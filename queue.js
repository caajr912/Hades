import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

const QUEUE_FILE = path.join(process.cwd(), 'queue.json');

/**
 * Normalize a company name to a stable key for dedup comparison.
 * Strips common suffixes (LLC, Inc, etc.) and punctuation so
 * "Worldwide Trophy Adventures" and "Worldwide Trophy Adventures LLC"
 * map to the same key.
 */
export function normalizeCompanyKey(name) {
  return name.toLowerCase()
    .replace(/\b(llc|inc|co|corp|ltd|company)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function readQueue() {
  try {
    return JSON.parse(await fs.readFile(QUEUE_FILE, 'utf8'));
  } catch {
    return [];
  }
}

async function writeQueue(entries) {
  await fs.writeFile(QUEUE_FILE, JSON.stringify(entries, null, 2), 'utf8');
}

/**
 * For each company with multiple 'pending' entries, keep the highest-seniority
 * contact and mark the rest 'rejected' (reason: company_dedup_cleanup).
 * Returns the count of entries removed.
 *
 * @param {function} seniorityScoreFn  (lead) => number — higher means more senior
 */
export async function deduplicateQueueByCompany(seniorityScoreFn) {
  const entries = await readQueue();
  const pending = entries.filter(e => e.status === 'pending');

  const byCompany = new Map();
  for (const e of pending) {
    const key = normalizeCompanyKey(e.lead?.companyName ?? '');
    if (!key) continue;
    if (!byCompany.has(key)) byCompany.set(key, []);
    byCompany.get(key).push(e);
  }

  let removed = 0;
  for (const group of byCompany.values()) {
    if (group.length <= 1) continue;
    group.sort((a, b) => seniorityScoreFn(b.lead) - seniorityScoreFn(a.lead));
    const [keep, ...drop] = group;
    for (const e of drop) {
      const idx = entries.findIndex(x => x.id === e.id);
      if (idx !== -1) {
        entries[idx].status       = 'rejected';
        entries[idx].rejectReason = `company_dedup_cleanup: kept ${keep.lead.firstName} ${keep.lead.lastName} (${keep.lead.title})`;
        entries[idx].reviewedAt   = new Date().toISOString();
        removed++;
      }
    }
  }

  if (removed) await writeQueue(entries);
  return removed;
}

/**
 * Apply data-integrity flags to existing pending entries that were queued before
 * flag detection was added. Only processes entries that have no flags yet.
 * Returns the count of entries updated.
 *
 * @param {function} detectFlagsFn  (lead) => Array<flag> — returns [] for clean leads
 */
export async function backfillFlags(detectFlagsFn) {
  const entries = await readQueue();
  let updated = 0;
  for (const e of entries) {
    if (e.status !== 'pending') continue;
    if (e.flags?.length) continue; // already flagged
    const flags = detectFlagsFn(e.lead);
    if (flags.length) {
      e.flags = flags;
      updated++;
    }
  }
  if (updated) await writeQueue(entries);
  return updated;
}

/**
 * Return a Set of normalized company keys for companies that already have a
 * pending or approved queue entry. Used to block same-company duplicates
 * across pipeline runs. Excludes 'hold' and 'rejected' so a rejected company
 * can be re-queued on a future run.
 */
export async function getQueuedCompanyKeys() {
  const entries = await readQueue();
  const keys = new Set();
  for (const e of entries) {
    if (e.status === 'hold' || e.status === 'rejected') continue;
    const name = e.lead?.companyName;
    if (name) keys.add(normalizeCompanyKey(name));
  }
  return keys;
}

/**
 * Return a Set of all emails and apolloIds already processed.
 * Excludes 'hold' entries — they are eligible for retry on the next run.
 */
export async function getProcessedKeys() {
  const entries = await readQueue();
  const keys = new Set();
  for (const e of entries) {
    if (e.status === 'hold') continue;
    if (e.lead?.email)    keys.add(e.lead.email.toLowerCase());
    if (e.lead?.apolloId) keys.add(e.lead.apolloId);
  }
  return keys;
}

const MAX_HOLD_ATTEMPTS = 3;

/**
 * Hold a lead whose scrape failed — it may be a real fit but couldn't be
 * enriched. Excluded from processedKeys so the next pull retries it.
 * After MAX_HOLD_ATTEMPTS failures the entry is marked 'rejected' so it
 * stops retrying.
 *
 * @param {Object} lead    normalized lead
 * @param {string} reason  short description of why it's held
 */
export async function enqueueHold(lead, reason) {
  const entries = await readQueue();
  const idx = entries.findIndex(
    e => e.status === 'hold' &&
         (e.lead?.email === lead.email || e.lead?.apolloId === lead.apolloId)
  );

  if (idx !== -1) {
    const attempts = (entries[idx].attempts ?? 1) + 1;
    if (attempts >= MAX_HOLD_ATTEMPTS) {
      entries[idx].status     = 'rejected';
      entries[idx].holdReason = `${reason} — exhausted after ${attempts} attempts`;
      entries[idx].reviewedAt = new Date().toISOString();
      console.log(`  Hold exhausted (${attempts}x) — permanently skipping ${lead.email ?? lead.apolloId}`);
    } else {
      entries[idx].attempts    = attempts;
      entries[idx].lastAttempt = new Date().toISOString();
    }
    await writeQueue(entries);
    return entries[idx];
  }

  const entry = {
    id:          randomUUID(),
    status:      'hold',
    holdReason:  reason,
    attempts:    1,
    lead,
    draft:       null,
    createdAt:   new Date().toISOString(),
    lastAttempt: new Date().toISOString(),
    reviewedAt:  null
  };
  entries.push(entry);
  await writeQueue(entries);
  return entry;
}

/**
 * Immediately reject a draft — it's visible via GET /queue?status=rejected
 * but cannot be approved. Used for auto-detected thin-data/fallback emails.
 */
export async function enqueueRejected(lead, draft, reason) {
  const entries = await readQueue();
  const entry = {
    id:           randomUUID(),
    status:       'rejected',
    rejectReason: reason,
    lead,
    draft,
    createdAt:    new Date().toISOString(),
    reviewedAt:   new Date().toISOString()
  };
  entries.push(entry);
  await writeQueue(entries);
  return entry;
}

/**
 * Add a composed draft to the queue with status "pending".
 * @param {Object}   lead
 * @param {Object}   draft
 * @param {Array}    flags  optional data-integrity flags, e.g. [{ type: 'domain_mismatch', ... }]
 */
export async function enqueue(lead, draft, flags = []) {
  const entries = await readQueue();
  const entry = {
    id:         randomUUID(),
    status:     'pending',
    ...(flags.length && { flags }),
    lead,
    draft,
    createdAt:  new Date().toISOString(),
    reviewedAt: null
  };
  entries.push(entry);
  await writeQueue(entries);
  return entry;
}

/**
 * Replace the draft on an existing queue entry.
 * Sets recomposedAt so reviewers know the copy was regenerated.
 */
export async function updateDraft(id, draft) {
  const entries = await readQueue();
  const idx = entries.findIndex(e => e.id === id);
  if (idx === -1) return null;
  entries[idx].draft        = draft;
  entries[idx].recomposedAt = new Date().toISOString();
  await writeQueue(entries);
  return entries[idx];
}

/**
 * List queue entries, optionally filtered by status.
 * @param {string|null} status  'pending' | 'approved' | 'rejected' | null (all)
 */
export async function listQueue(status = null) {
  const entries = await readQueue();
  return status ? entries.filter(e => e.status === status) : entries;
}

/**
 * Transition an entry's status. Returns the updated entry, or null if not found.
 * @param {string} id
 * @param {'approved'|'rejected'} action
 */
export async function reviewEntry(id, action) {
  const entries = await readQueue();
  const idx = entries.findIndex(e => e.id === id);
  if (idx === -1) return null;
  entries[idx].status     = action;
  entries[idx].reviewedAt = new Date().toISOString();
  await writeQueue(entries);
  return entries[idx];
}

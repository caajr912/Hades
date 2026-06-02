import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

const QUEUE_FILE = path.join(process.cwd(), 'queue.json');

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

/** Add a composed draft to the queue with status "pending". */
export async function enqueue(lead, draft) {
  const entries = await readQueue();
  const entry = {
    id:         randomUUID(),
    status:     'pending',
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

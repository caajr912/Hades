import { runWellBuiltWebBatch } from './apollo.js';
import { normalizeClayRow } from './clay.js';
import { scrapeCompany, extractLeadFields } from './enrich.js';
import { scoreLead, formatScoreRow, couldPassWithBetterData, isEnrichmentComplete } from './qualify.js';
import { composeDraft } from './compose.js';
import { enqueue, enqueueHold, enqueueRejected, getProcessedKeys, getQueuedCompanyKeys, normalizeCompanyKey, deduplicateQueueByCompany, backfillFlags, listQueue, updateDraft } from './queue.js';
import { InstantlyManager } from './instantly.js';

const CONCURRENCY = 5;

// ── Company dedup helpers ─────────────────────────────────────────────────────

// Higher number = prefer this contact when multiple from the same company pass.
const SENIORITY_RANK = { owner: 6, c_suite: 5, vp: 4, director: 3, manager: 2, senior: 1 };

function seniorityScore(lead) {
  const s = (lead.seniority ?? '').toLowerCase();
  if (SENIORITY_RANK[s] !== undefined) return SENIORITY_RANK[s];
  const t = (lead.title ?? '').toLowerCase();
  if (/\b(owner|co-owner|outfitter)\b/.test(t))    return 6;
  if (/\b(founder|co-founder)\b/.test(t))           return 6;
  if (/\b(ceo|coo|cfo|president|chief)\b/.test(t)) return 5;
  if (/\bvp\b|vice.president/.test(t))              return 4;
  if (/\bdirector\b/.test(t))                       return 3;
  if (/\bmanager\b/.test(t))                        return 2;
  return 0;
}

// ── Domain mismatch helpers ───────────────────────────────────────────────────

function extractDomain(url) {
  if (!url) return '';
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`)
      .hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return url.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
  }
}

function detectDomainMismatch(lead) {
  const emailDomain = lead.email?.split('@')[1]?.toLowerCase() ?? '';
  const siteDomain  = extractDomain(lead.website);
  if (!emailDomain || !siteDomain) return null;
  if (emailDomain === siteDomain) return null;
  return { type: 'domain_mismatch', emailDomain, siteDomain };
}

/**
 * Weekly job: pull leads from Apollo, scrape + AI-enrich each one, score fit,
 * compose a draft for qualifying leads, and hold them in the review queue.
 *
 * FIT_THRESHOLD env var (default 6, scale 0–10) controls the gate.
 * Set to 0 to pass everything; set to 11 to score-only without composing.
 */
export async function runPipeline() {
  const maxPages     = parseInt(process.env.APOLLO_MAX_PAGES  ?? '5', 10);
  const threshold    = parseInt(process.env.FIT_THRESHOLD     ?? '8', 10); // scale 0–12 with prestige

  const cleaned  = await deduplicateQueueByCompany(seniorityScore);
  if (cleaned > 0) console.log(`Pipeline: cleaned ${cleaned} company-duplicate entry(s) from queue.`);

  const flagged = await backfillFlags(lead => {
    const m = detectDomainMismatch(lead);
    return m ? [m] : [];
  });
  if (flagged > 0) console.log(`Pipeline: backfilled domain-mismatch flags on ${flagged} existing entry(s).`);

  console.log('Pipeline: starting Apollo pull...');
  const { leads } = await runWellBuiltWebBatch(maxPages);

  if (!leads?.length) {
    console.log('Pipeline: no new leads found.');
    return { queued: 0, skipped: 0, failed: 0 };
  }

  const processed       = await getProcessedKeys();
  const queuedCompanies = await getQueuedCompanyKeys();

  const fresh = leads.filter(lead => {
    if (lead.email    && processed.has(lead.email.toLowerCase())) return false;
    if (lead.apolloId && processed.has(lead.apolloId))            return false;
    return true;
  });

  if (fresh.length < leads.length) {
    console.log(`Pipeline: skipped ${leads.length - fresh.length} already-processed lead(s).`);
  }
  if (!fresh.length) {
    console.log('Pipeline: all leads already processed.');
    return { queued: 0, skipped: 0, failed: 0 };
  }

  console.log(`Pipeline: enriching ${fresh.length} leads (concurrency ${CONCURRENCY}, threshold ${threshold}/10)...`);
  // Fallback subject patterns → auto-reject; never send these to a prospect
  const FALLBACK_PATTERNS = ['wrong inbox', 'straight talk'];

  const results     = { queued: 0, skipped: 0, held: 0, autoRejected: 0, companyDuped: 0, failed: 0 };
  const scoreLog    = [];
  const passResults = []; // leads that cleared all inline gates; deduped + enqueued below
  const scrapeStats = { ok: 0, empty: 0, timeout: 0, blocked: 0, netErr: 0, noUrl: 0 };

  await runConcurrent(fresh, CONCURRENCY, async (lead) => {
    try {
      const { text: scrapedText, pages: scrapePages } = await scrapeCompany(lead.website);

      // Accumulate scrape stats for the end-of-run summary
      if (!lead.website) {
        scrapeStats.noUrl++;
      } else if (scrapePages.some(p => p.status === 'OK')) {
        scrapeStats.ok++;
      } else if (scrapePages.some(p => p.status === 'TIMEOUT')) {
        scrapeStats.timeout++;
      } else if (scrapePages.some(p => p.status === 'BLOCKED')) {
        scrapeStats.blocked++;
      } else if (scrapePages.some(p => p.status === 'NET_ERR')) {
        scrapeStats.netErr++;
      } else {
        scrapeStats.empty++;
      }

      const extracted          = await extractLeadFields(scrapedText, lead);
      const normalized         = normalizeClayRow({ ...lead, ...extracted });
      const enrichmentComplete = isEnrichmentComplete(normalized);
      const scrapeOkPages      = scrapePages.filter(p => p.status === 'OK').length;
      const meta               = { scrapeOkPages, totalPages: scrapePages.length, enrichmentComplete };

      // ── Gate 1: enrichment completeness ─────────────────────────────────
      // Score only when we have real extracted data. Scoring on an empty or
      // misleadingly partial scrape causes flip-flopping verdicts across runs.
      if (!enrichmentComplete) {
        const scrapeOk   = scrapePages.some(p => p.status === 'OK');
        const holdReason = scrapeOk
          ? `scrape_ok_extraction_empty (${scrapeOkPages}/${scrapePages.length} pages returned text)`
          : `scrape_failed: ${scrapePages.map(p => `${p.path}:${p.status}`).join(' ')}`;
        await enqueueHold(normalized, holdReason);
        scoreLog.push({ lead: normalized, fit: null, status: 'HOLD', meta });
        results.held++;
        return;
      }

      // ── Gate 2: fit score ────────────────────────────────────────────────
      const fit = scoreLead(normalized);

      if (fit.total < threshold) {
        const scrapeOk    = scrapePages.some(p => p.status === 'OK');
        const scrapeFailed = !scrapeOk && !!lead.website;

        if (scrapeFailed && couldPassWithBetterData(fit, threshold)) {
          const holdReason = scrapePages.map(p => `${p.path}:${p.status}`).join(' ');
          await enqueueHold(normalized, holdReason);
          scoreLog.push({ lead: normalized, fit, status: 'HOLD', meta });
          results.held++;
        } else {
          scoreLog.push({ lead: normalized, fit, status: 'SKIP', meta });
          results.skipped++;
        }
        return;
      }

      // ── Compose ──────────────────────────────────────────────────────────
      const draft = await composeDraft(normalized);

      // ── Gate 3: fallback subject detection ───────────────────────────────
      // Belt-and-suspenders: if Claude generated a decline/hedging email
      // despite passing the gates, reject it before it reaches the queue.
      if (FALLBACK_PATTERNS.some(p => draft.subject.toLowerCase().includes(p))) {
        console.log(`  Auto-rejected fallback draft for ${normalized.email}: "${draft.subject}"`);
        await enqueueRejected(normalized, draft, 'fallback_subject_pattern');
        scoreLog.push({ lead: normalized, fit, status: 'RJCT', meta });
        results.autoRejected++;
        return;
      }

      // Collect — company dedup + domain check happen after the concurrent phase
      const scoreEntry = { lead: normalized, fit, status: 'PASS', meta };
      scoreLog.push(scoreEntry);
      passResults.push({ lead: normalized, draft, scoreEntry });
    } catch (err) {
      console.error(`  Lead failed (${lead.email ?? 'no email'}): ${err.message}`);
      results.failed++;
    }
  });

  // ── Gate 4: company-level dedup ─────────────────────────────────────────
  // Step A: drop any company already present in the queue from a prior run
  const batchLeads = passResults.filter(r => {
    const key = normalizeCompanyKey(r.lead.companyName ?? '');
    if (key && queuedCompanies.has(key)) {
      r.scoreEntry.status = 'DUPE';
      results.companyDuped++;
      return false;
    }
    return true;
  });

  // Step B: within this batch, keep only the highest-seniority contact per company
  const companyBest = new Map(); // normalizedKey → passResult
  for (const r of batchLeads) {
    const key = normalizeCompanyKey(r.lead.companyName ?? '') || r.lead.apolloId;
    const current = companyBest.get(key);
    if (!current || seniorityScore(r.lead) > seniorityScore(current.lead)) {
      if (current) {
        current.scoreEntry.status = 'DUPE';
        results.companyDuped++;
      }
      companyBest.set(key, r);
    } else {
      r.scoreEntry.status = 'DUPE';
      results.companyDuped++;
    }
  }

  // Step C: enqueue winners, attaching any data-integrity flags
  for (const { lead, draft, scoreEntry } of companyBest.values()) {
    const flags = [];
    const mismatch = detectDomainMismatch(lead);
    if (mismatch) {
      flags.push(mismatch);
      console.log(`  [!] Domain mismatch — ${lead.companyName} (${lead.email}): email domain "${mismatch.emailDomain}" ≠ site domain "${mismatch.siteDomain}"`);
    }
    const entry = await enqueue(lead, draft, flags);
    console.log(`  Queued ${entry.id} — "${draft.subject}"${flags.length ? ' ⚠ domain flag' : ''}`);
    results.queued++;
  }

  // ── Score table ─────────────────────────────────────────────────────────
  const sorted = scoreLog.sort((a, b) => (b.fit?.total ?? -1) - (a.fit?.total ?? -1));
  console.log(`\nScore table (threshold ${threshold}/10):`);
  console.log(`  ${''.padEnd(4)}  ${'score'.padEnd(22)}  ${'company'.padEnd(32)}  keywords`);
  console.log(`  ${'─'.repeat(95)}`);
  for (const { lead, fit, status, meta } of sorted) {
    console.log(formatScoreRow(lead, fit, status, meta));
  }

  const scrapeTotal = Object.values(scrapeStats).reduce((a, b) => a + b, 0);
  console.log(
    `\nScrape stats (${scrapeTotal} domains): ` +
    `${scrapeStats.ok} OK, ${scrapeStats.empty} empty parse, ` +
    `${scrapeStats.timeout} timeout, ${scrapeStats.blocked} blocked, ` +
    `${scrapeStats.netErr} net-err, ${scrapeStats.noUrl} no URL`
  );
  console.log(`Pipeline complete — queued: ${results.queued}, company-duped: ${results.companyDuped}, skipped: ${results.skipped}, held: ${results.held}, auto-rejected: ${results.autoRejected}, failed: ${results.failed}`);
  return results;
}

/**
 * Send an approved queue entry to Instantly (and eventually HubSpot).
 * Called by POST /queue/:id/approve in server.js.
 */
export async function sendApprovedLead(entry) {
  const { lead, draft } = entry;
  const campaignId = process.env.INSTANTLY_CAMPAIGN_ID;
  if (!campaignId) throw new Error('INSTANTLY_CAMPAIGN_ID not set');

  const instantly = new InstantlyManager(process.env.INSTANTLY_API_KEY);
  await instantly.addLeadsToCampaign(campaignId, [{ ...lead, ...draft }]);
  console.log(`Sent to Instantly: ${lead.email}`);

  if (process.env.HUBSPOT_PRIVATE_APP_TOKEN) {
    await upsertHubSpotContact(lead);
  }
}

/**
 * Regenerate email drafts for all pending queue entries using the current brand
 * profile. Use this after updating config/brand.js to preview the new voice on
 * the existing queue without running a fresh Apollo pull.
 *
 * Does NOT re-score or re-gate — only the draft copy is replaced.
 * Sets recomposedAt on each entry so reviewers know the copy was regenerated.
 *
 * @returns {{ recomposed: number, failed: number }}
 */
export async function recomposePending() {
  const entries = await listQueue('pending');
  console.log(`Recomposing ${entries.length} pending entries...`);

  let recomposed = 0, failed = 0;
  for (const entry of entries) {
    try {
      const draft = await composeDraft(entry.lead);
      await updateDraft(entry.id, draft);
      console.log(`  OK  ${entry.id.slice(0, 8)} — "${draft.subject}" (${entry.lead.companyName})`);
      recomposed++;
    } catch (err) {
      console.error(`  ERR ${entry.id.slice(0, 8)} (${entry.lead.companyName}): ${err.message}`);
      failed++;
    }
  }

  console.log(`Recompose complete — ${recomposed} updated, ${failed} failed`);
  return { recomposed, failed };
}

async function upsertHubSpotContact(_lead) {
  // TODO: POST /crm/v3/objects/contacts — Phase 1 step 4
}

async function runConcurrent(items, limit, fn) {
  const queue = [...items];
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => { while (queue.length) await fn(queue.shift()); }
  );
  await Promise.all(workers);
}

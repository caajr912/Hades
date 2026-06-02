import { runWellBuiltWebBatch } from './apollo.js';
import { normalizeClayRow } from './clay.js';
import { scrapeCompany, extractLeadFields } from './enrich.js';
import { scoreLead, formatScoreRow } from './qualify.js';
import { composeDraft } from './compose.js';
import { enqueue, getProcessedKeys } from './queue.js';
import { InstantlyManager } from './instantly.js';

const CONCURRENCY = 5;

/**
 * Weekly job: pull leads from Apollo, scrape + AI-enrich each one, score fit,
 * compose a draft for qualifying leads, and hold them in the review queue.
 *
 * FIT_THRESHOLD env var (default 6, scale 0–10) controls the gate.
 * Set to 0 to pass everything; set to 11 to score-only without composing.
 */
export async function runPipeline() {
  const maxPages     = parseInt(process.env.APOLLO_MAX_PAGES  ?? '5', 10);
  const threshold    = parseInt(process.env.FIT_THRESHOLD     ?? '6', 10);

  console.log('Pipeline: starting Apollo pull...');
  const { leads } = await runWellBuiltWebBatch(maxPages);

  if (!leads?.length) {
    console.log('Pipeline: no new leads found.');
    return { queued: 0, skipped: 0, failed: 0 };
  }

  const processed = await getProcessedKeys();
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
  const results  = { queued: 0, skipped: 0, failed: 0 };
  const scoreLog = [];   // collect all scores for the summary table

  await runConcurrent(fresh, CONCURRENCY, async (lead) => {
    try {
      const scrapedText = await scrapeCompany(lead.website);
      const extracted   = await extractLeadFields(scrapedText, lead);
      const normalized  = normalizeClayRow({ ...lead, ...extracted });
      const fit         = scoreLead(normalized);

      if (fit.total < threshold) {
        scoreLog.push({ lead: normalized, fit, status: 'SKIP' });
        results.skipped++;
        return;
      }

      const draft = await composeDraft(normalized);
      const entry = await enqueue(normalized, draft);
      scoreLog.push({ lead: normalized, fit, status: 'PASS' });
      console.log(`  Queued ${entry.id} — "${draft.subject}"`);
      results.queued++;
    } catch (err) {
      console.error(`  Lead failed (${lead.email ?? 'no email'}): ${err.message}`);
      results.failed++;
    }
  });

  // ── Score table ─────────────────────────────────────────────────────────
  const sorted = scoreLog.sort((a, b) => b.fit.total - a.fit.total);
  console.log(`\nScore table (threshold ${threshold}/10):`);
  console.log(`  ${''.padEnd(4)}  ${'score'.padEnd(22)}  ${'company'.padEnd(32)}  keywords`);
  console.log(`  ${'─'.repeat(95)}`);
  for (const { lead, fit, status } of sorted) {
    console.log(formatScoreRow(lead, fit, status));
  }

  console.log(`\nPipeline complete — queued: ${results.queued}, skipped: ${results.skipped}, failed: ${results.failed}`);
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

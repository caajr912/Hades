import { runWellBuiltWebBatch } from './apollo.js';
import { normalizeClayRow } from './clay.js';
import { scrapeCompany, extractLeadFields } from './enrich.js';
import { composeDraft } from './compose.js';
import { enqueue } from './queue.js';
import { InstantlyManager } from './instantly.js';

const CONCURRENCY = 5;

/**
 * Weekly job: pull leads from Apollo, scrape + AI-enrich each one, compose a
 * draft email, and hold it in the review queue pending human approval.
 */
export async function runPipeline() {
  const maxPages = parseInt(process.env.APOLLO_MAX_PAGES ?? '5', 10);
  console.log('Pipeline: starting Apollo pull...');
  const { leads } = await runWellBuiltWebBatch(maxPages);

  if (!leads?.length) {
    console.log('Pipeline: no new leads found.');
    return { queued: 0, failed: 0 };
  }

  console.log(`Pipeline: enriching ${leads.length} leads (concurrency ${CONCURRENCY})...`);
  const results = { queued: 0, failed: 0 };

  await runConcurrent(leads, CONCURRENCY, async (lead) => {
    try {
      const scrapedText = await scrapeCompany(lead.website);
      const extracted   = await extractLeadFields(scrapedText, lead);
      const normalized  = normalizeClayRow({ ...lead, ...extracted });
      const draft       = await composeDraft(normalized);
      const entry       = await enqueue(normalized, draft);
      console.log(`Queued ${entry.id} — ${normalized.email} — "${draft.subject}"`);
      results.queued++;
    } catch (err) {
      console.error(`Lead failed (${lead.email ?? 'no email'}): ${err.message}`);
      results.failed++;
    }
  });

  console.log(`Pipeline complete — queued: ${results.queued}, failed: ${results.failed}`);
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

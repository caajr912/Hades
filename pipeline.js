import { runWellBuiltWebBatch } from './apollo.js';
import { pushToClay, normalizeClayRow } from './clay.js';
import { composeDraft } from './compose.js';
import { enqueue } from './queue.js';
import { InstantlyManager } from './instantly.js';

/**
 * Weekly cron job: pull leads from Apollo, dedup against Instantly, push to Clay.
 * Clay enriches each row asynchronously and POSTs back to /webhooks/clay.
 */
export async function runApolloToClay() {
  const maxPages = parseInt(process.env.APOLLO_MAX_PAGES ?? '5', 10);
  console.log('Pipeline: starting Apollo pull...');
  const { leads } = await runWellBuiltWebBatch(maxPages);
  if (!leads?.length) {
    console.log('Pipeline: no new leads to push to Clay.');
    return { sent: 0, failed: 0 };
  }
  console.log(`Pipeline: pushing ${leads.length} leads to Clay...`);
  return pushToClay(leads);
}

/**
 * Clay webhook callback: compose a full email draft and hold it in the review queue.
 * Nothing is sent to Instantly until the draft is approved via POST /queue/:id/approve.
 */
export async function handleEnrichedLead(row) {
  const lead = normalizeClayRow(row);
  if (!lead.email) {
    console.warn('handleEnrichedLead: skipping row with no email');
    return;
  }

  console.log(`Composing draft for ${lead.email}...`);
  const draft = await composeDraft(lead);
  const entry = await enqueue(lead, draft);

  console.log(`Queued draft ${entry.id} — pending review`);
  console.log(`  Subject: "${draft.subject}"`);
}

/**
 * Send an approved queue entry to Instantly.
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

import { runWellBuiltWebBatch } from './apollo.js';
import { normalizeClayRow } from './clay.js';
import { scrapeCompany, extractLeadFields } from './enrich.js';
import { scoreLead, formatScoreRow, couldPassWithBetterData, isEnrichmentComplete } from './qualify.js';
import { composeDraft } from './compose.js';
import { enqueue, enqueueHold, enqueueRejected, getProcessedKeys } from './queue.js';
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
  // Fallback subject patterns → auto-reject; never send these to a prospect
  const FALLBACK_PATTERNS = ['wrong inbox', 'straight talk'];

  const results     = { queued: 0, skipped: 0, held: 0, autoRejected: 0, failed: 0 };
  const scoreLog    = [];
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

      const entry = await enqueue(normalized, draft);
      scoreLog.push({ lead: normalized, fit, status: 'PASS', meta });
      console.log(`  Queued ${entry.id} — "${draft.subject}"`);
      results.queued++;
    } catch (err) {
      console.error(`  Lead failed (${lead.email ?? 'no email'}): ${err.message}`);
      results.failed++;
    }
  });

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
  console.log(`Pipeline complete — queued: ${results.queued}, skipped: ${results.skipped}, held: ${results.held}, auto-rejected: ${results.autoRejected}, failed: ${results.failed}`);
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

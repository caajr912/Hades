# Hades Rebuild — Build Brief

Hand this to Claude Code from the repo root. `personalize.js` already exists and is
correct — keep it. Everything else below is the work.

## Goal

Make cold emails genuinely personalized using deep Clay enrichment. Today the
enrichment never runs (`index.js` never imports `clay.js`) and `clay.js` is built on
a Clay REST endpoint that doesn't exist. Rebuild around Clay's real model.

## Architecture (this is the important change)

Clay is async, not a function call. Hades stops being a run-and-exit cron script and
becomes a small always-on service on Railway:

1. **Cron (inside the service)** runs the weekly Apollo pull, dedupes against
   Instantly (reuse `apollo.js` → `runWellBuiltWebBatch`, which already does Apollo
   email enrichment + Instantly dedup), then POSTs each lead into the Clay table's
   inbound webhook URL.
2. **Clay** enriches each row asynchronously (columns configured in the Clay UI —
   see below).
3. **Clay's final outbound "HTTP API" column** POSTs each finished row back to the
   service at `POST /webhooks/clay`.
4. **The callback** verifies the Clay signature, normalizes the row, runs
   `personalize.js` (Claude API) to generate the opener from the deep data, then
   pushes the lead to Instantly. HubSpot is a later layer (stub it for now).

Personalization stays in `personalize.js` (versioned code, reusable for HubSpot and
future channels), NOT a Clay AI column. The richer the Clay columns, the better the
opener.

## Repo changes

- **`server.js` (new, entry point):** Express app. `GET /health`,
  `POST /webhooks/clay`. Registers the cron job. `npm start` → `node server.js`.
- **`pipeline.js` (new):** `runApolloToClay()` (pull + dedup + push to Clay) and
  `handleEnrichedLead(row)` (normalize → personalize → Instantly).
- **`clay.js` (rewrite):** delete the fake `/people/enrich` REST client. New exports:
  `pushToClay(leads)` → POST to `CLAY_WEBHOOK_URL` (note Clay's 50k-submission cap
  per webhook table); `verifyClaySignature(req)` → HMAC-SHA256 on `x-clay-signature`
  using `CLAY_WEBHOOK_SECRET`; `normalizeClayRow(row)` → map enriched fields to the
  lead shape `personalize.js` expects (companyName, companyIndustry, city, state,
  companyDescription, companyTechnologies, etc.).
- **`instantly.js`:** payload already updated to send `personalization` +
  `custom_variables` + `skip_if_in_campaign`. In the callback, add one lead at a time
  via `addLeadsToCampaign(campaignId, [lead])`.
- **`index.js`:** retire (or make it a thin alias for `server.js`). Remove the
  unconditional `discoverCampaigns()` call — it's running on every cron tick.
- **`apollo.js`:** keep. Move the hardcoded campaign-ID fallbacks to env-only.
- **`package.json`:** add `express` and `@anthropic-ai/sdk`; `start` → `node
  server.js`; `engines.node` → `>=20` (18 is EOL). Drop the in-memory
  `markLeadsAsContacted` reliance — dedup is the Instantly query at pull time.
- **`.env.example` (new):** see env vars below.

## Clay table setup (do this in the Clay UI — code can't)

1. New table → add a **Webhook** source → copy the inbound URL → that's
   `CLAY_WEBHOOK_URL`.
2. Enrichment columns, tuned for **local service SMBs** (this is the whole point —
   skip funding/hiring signals, they're noise for a 6-person shop):
   - Domain / website from email or company name
   - **Google Maps / Places**: rating, review count, years in business, categories,
     hours — the richest local signal
   - Recent Google review snippet (via integration, if available)
   - Website scrape / homepage summary: services offered, "family-owned since X"
   - Employee count + industry (secondary firmographics)
   - LinkedIn company / tech stack (optional, low value here)
3. Final column → **HTTP API** (outbound), POST to
   `https://<your-railway-app>/webhooks/clay`, body = the enriched fields as JSON,
   add a header carrying the signing secret. Run condition: only fire on rows with a
   verified email.

## Env vars

```
APOLLO_API_KEY=
INSTANTLY_API_KEY=
INSTANTLY_CAMPAIGN_ID=
CLAY_WEBHOOK_URL=
CLAY_WEBHOOK_SECRET=
ANTHROPIC_API_KEY=
PERSONALIZE_MODEL=claude-haiku-4-5-20251001
APOLLO_MAX_PAGES=5
PORT=3000
# later: HUBSPOT_PRIVATE_APP_TOKEN=
```

## Instantly sequence (manual, in their dashboard)

Make `{{personalization}}` the literal first line of the sequence. Use
`{{company_insight}}` / `{{top_talking_point}}` in later steps as desired.

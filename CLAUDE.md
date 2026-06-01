# CLAUDE.md — Hades for The Elite Compass

This repo is a Hades (cold outreach) build **for a client**, not for WBW's own
receptionist business. Read `BUILD_BRIEF.md` for the architecture. Read this file
for *who it's for* — it overrides any WBW/Louisiana/AI-receptionist framing left in
the code or comments.

## Client

**The Elite Compass LLC** — Colorado media company. Publishes a premium print +
digital magazine for affluent hunters and anglers across the US.
Site: https://theelitecompass.com · Phone: (303) 625-7511.
Engagement green-lit May 2026, collaborative with their internal marketing team
(not hands-off delivery).

**Revenue model is B2B ad sales.** They sell ad space to outfitters, lodges, gear
brands, and guided-experience companies, pitched on access to a curated affluent
sportsman audience + mailing list.

## What this repo does (Phase 1)

Configure Hades for **advertiser outreach**: source advertiser prospects, enrich
deeply via Clay, generate genuinely personalized openers, and **drop enriched leads
into the client's HubSpot pipeline** while sending cold email via Instantly.

Out of scope for this repo (separate workstreams): Twilio SMS sequences via HubSpot,
social content batch automation, and all Phase 2 work (Hermes inbound calls,
consumer subscriber-list enrichment).

## TARGETING — this is the part the code currently gets wrong

- **Leads = advertisers**, not local SMBs: hunting/fishing outfitters, lodges &
  ranches, gear/apparel/optics brands, guided-experience operators. Tune the Apollo
  search criteria to these industries, not Louisiana service trades.
- **Pitch = ad space in The Elite Compass**, reaching affluent, high-intent hunters
  and anglers. NOT an AI phone receptionist. NOT WBW.
- **Destination = the client's HubSpot** (their portal — we need a Private App admin
  token from them before the pipeline can write). Instantly is the sending tool;
  HubSpot is the system of record.

## personalize.js — must be retargeted

`personalize.js` exists and the structure is correct, but its `SYSTEM` prompt is
written for WBW's receptionist pitch. Rewrite it for Elite Compass:

- Voice: someone who knows the hunting/angling world, writing to a business owner.
- The opener references a real, Clay-verified fact about *their* operation (the
  lodge's species/season, the brand's product line, the outfitter's region/reviews)
  and connects to "your customers are exactly who reads The Elite Compass."
- Same hard rules: one sentence, ≤30 words, only provided facts, no fabrication, no
  corporate filler. Don't mention the magazine by name in the opener — that's the
  next line's job.

## Clay enrichment columns — retarget for this audience

The personalization is only as good as the Clay data. For advertiser prospects:

- **Outfitters / lodges / guided experiences** (often local destinations): Google
  Maps rating + review count, location/region, species or activities offered,
  season, years in business, website scrape (packages, "since 19xx"). Local review
  signal is gold here.
- **Gear / apparel / optics brands** (more DTC/ecommerce): product category,
  Shopify/site tech, audience/positioning, recent launches, social following.
- Skip generic B2B firmographics (funding rounds, hiring signals) — irrelevant to
  whether they'd buy a magazine ad.

## Build order

1. Confirm the Elite Compass HubSpot Private App token is available (blocker).
2. Execute `BUILD_BRIEF.md` repo changes (service + Clay round-trip).
3. Retarget Apollo search criteria + `personalize.js` SYSTEM prompt per above.
4. Add the HubSpot upsert in the `/webhooks/clay` callback alongside the Instantly push.
5. Configure the Clay table columns (UI) for the advertiser audience.

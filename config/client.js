/**
 * config/client.js — all client-specific values for this deployment.
 *
 * Swap this file (plus .env) to retarget the engine for a different client.
 * Engine code (server.js, pipeline.js, clay.js, personalize.js) never imports
 * anything client-specific directly — it only reads from here and from env vars.
 */

// ---------------------------------------------------------------------------
// Personalization system prompt
// ---------------------------------------------------------------------------

export const PERSONALIZATION_SYSTEM = `You write cold-email openers for a premium print + digital magazine for affluent hunters and anglers across the US.

Your job: write ONE sentence (≤30 words) that will be the literal first line of a cold email to a business that might advertise in the magazine.

Rules:
- Reference one specific, verified fact from the data provided (e.g. species/region, product line, Google rating/reviews, years operating, recent launch, social following, etc.)
- Connect that fact to the idea that their customers are exactly who reads the magazine — without naming the magazine
- Sound like a fellow industry insider writing to a business owner, not a marketer
- No corporate filler ("I hope this finds you well", "I wanted to reach out", etc.)
- No fabrication — only use facts that are explicitly present in the data block
- Do NOT name the magazine in this sentence; that is the next line's job
- Output ONLY the opener sentence, nothing else`;

// ---------------------------------------------------------------------------
// Apollo search criteria — advertiser prospects for a hunting/angling magazine
// Target: outfitters, lodges/ranches, gear/apparel/optics brands,
//         guided-experience operators. US-wide, decision-maker contacts.
// ---------------------------------------------------------------------------

export const APOLLO_CRITERIA = {
  person_titles: [
    'Owner', 'Co-Owner', 'Founder', 'Co-Founder',
    'President', 'CEO',
    'Marketing Director', 'Marketing Manager', 'VP of Marketing',
    'Advertising Manager', 'Brand Manager', 'Director of Marketing',
    'General Manager', 'Operations Manager',
    'Outfitter', 'Head Guide', 'Lodge Manager', 'Ranch Manager'
  ],

  person_seniorities: ['c_suite', 'vp', 'director', 'manager', 'owner'],

  // SIC codes for hunting/fishing/outdoor-recreation verticals
  organization_sic_codes: [
    '7999', // Amusement & Recreation Services (guided hunts, fishing charters)
    '0971', // Hunting, Trapping & Game Propagation
    '0912', // Finfish (fishing operations)
    '7011', // Hotels & Motels (hunting/fishing lodges)
    '5091', // Sporting & Recreation Goods — wholesale
    '5941', // Sporting Goods Stores — retail
    '5699', // Apparel & Accessory Stores NEC (outdoor/camo apparel)
    '5040', // Professional & Commercial Equipment (optics, gear)
    '5065'  // Electronic Parts (trail cameras, GPS devices)
  ],

  // US-wide — advertisers are national or regional, not geo-restricted
  person_locations: ['United States'],

  email_status: ['verified'],
  prospected_by_current_team: ['no']
};

// ---------------------------------------------------------------------------
// Lead quality filter (runs on raw Apollo results before Clay push)
// Return true to keep, false to drop.
// ---------------------------------------------------------------------------

export function filterLead(lead) {
  // Must have enough data for Clay enrichment
  if (!lead.first_name || !lead.last_name || !lead.organization?.name) return false;

  const name = (lead.organization?.name ?? '').toLowerCase();

  // Drop big-box / mass-market retailers — they don't need a boutique magazine ad
  const excluded = [
    'bass pro', "bass pro shops", 'cabelas', "cabela's",
    'academy sports', "dick's sporting", 'dicks sporting goods',
    'walmart', 'amazon', 'target', 'costco',
    // Non-commercial entities
    'association', 'foundation', 'nonprofit', '501(c)',
    'government', 'municipal', 'city of', 'county of',
    'university', 'college', 'school district'
  ];

  if (excluded.some(p => name.includes(p))) return false;

  return true;
}

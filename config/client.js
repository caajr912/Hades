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

  // SIC codes for hunting/fishing/outdoor-recreation verticals.
  // Dropped 5040 (Professional Equipment) and 5065 (Electronic Parts) — too generic.
  // Outdoor keyword check in filterLead() narrows the broad codes (e.g. 7999, 7011).
  organization_sic_codes: [
    '7999', // Amusement & Recreation Services (guided hunts, fishing charters)
    '0971', // Hunting, Trapping & Game Propagation
    '0912', // Finfish (fishing operations)
    '7011', // Hotels & Motels (hunting/fishing lodges)
    '5091', // Sporting & Recreation Goods — wholesale
    '5941', // Sporting Goods Stores — retail
    '5699'  // Apparel & Accessory Stores NEC (outdoor/camo apparel)
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

// Keywords checked against company name + industry + Apollo keywords array.
// Any single match is enough to pass. Keeps the filter broad enough not to
// miss small operators whose Apollo profile is thin.
const OUTDOOR_KEYWORDS = [
  'hunting', 'hunt', 'fisher', 'fishing', 'angler', 'angling',
  'outfitter', 'lodge', 'ranch', 'guide service', 'guided',
  'fly fish', 'fly rod', 'tackle', 'wildlife',
  'whitetail', 'elk', 'mule deer', 'waterfowl', 'pheasant', 'turkey',
  'archery', 'bow hunt', 'rifle', 'shotgun',
  'optic', 'scope', 'rangefinder', 'binocular',
  'camo', 'camouflage', 'blaze orange',
  'hunting gear', 'hunting apparel', 'outdoor apparel'
];

export function filterLead(lead) {
  if (!lead.first_name || !lead.organization?.name) return false;

  const org = lead.organization ?? {};
  const searchText = [
    org.name,
    org.industry,
    org.short_description,
    ...(Array.isArray(org.keywords) ? org.keywords : [])
  ].join(' ').toLowerCase();

  // Must mention the outdoor vertical somewhere in Apollo's data
  if (!OUTDOOR_KEYWORDS.some(kw => searchText.includes(kw))) return false;

  // Drop big-box / mass-market retailers
  const excluded = [
    'bass pro', "bass pro shops", 'cabelas', "cabela's",
    'academy sports', "dick's sporting", 'dicks sporting goods',
    'walmart', 'amazon', 'target', 'costco',
    // Non-commercial entities
    'association', 'foundation', 'nonprofit', '501(c)',
    'government', 'municipal', 'city of', 'county of',
    'university', 'college', 'school district'
  ];

  const name = org.name.toLowerCase();
  if (excluded.some(p => name.includes(p))) return false;

  return true;
}

/**
 * qualify.js — lead fit scoring for Elite Compass advertiser targeting.
 *
 * Scores each enriched lead 0–10 across four dimensions.
 * Only leads at or above FIT_THRESHOLD (env var, default 6) proceed to compose.
 *
 * Dimensions:
 *   vertical   (0–4)  what the business does — guide/lodge, species, gear
 *   audience   (0–3)  customer overlap with Elite Compass readers
 *   dataDepth  (0–2)  enough enrichment signal to write a specific email
 *   commercial (0–1)  viable advertiser (not a nonprofit / association / HQ entity)
 */

// ── Keyword lists ─────────────────────────────────────────────────────────────

// Guides, lodges, outfitters — highest-value vertical
const GUIDE_LODGE = [
  'outfitter', 'guide service', 'guided hunt', 'guided fishing', 'guided fly',
  'hunting lodge', 'fishing lodge', 'hunting ranch', 'hunting camp', 'fish camp',
  'hunting resort', 'fishing resort', 'hunting plantation', 'game preserve',
  'big game', 'trophy hunt', 'trophy fish',
  'duck club', 'waterfowl club', 'pheasant hunt', 'quail hunt',
  'deer camp', 'elk camp', 'bear camp', 'dove field'
];

// Specific species — require compound phrases or unambiguous terms to avoid
// collisions with "bass guitar", "duck brand", "bear market", "turkey (food)", etc.
const SPECIES = [
  // Deer / big game — unambiguous
  'whitetail', 'mule deer', 'blacktail', 'elk', 'moose', 'caribou',
  'pronghorn', 'antelope', 'bison', 'buffalo',
  // Bear / predators — require context
  'bear hunting', 'bear guide', 'bear hunt',
  'mountain lion', 'cougar', 'wild boar', 'feral hog',
  // Upland / waterfowl — require hunting context for ambiguous terms
  'turkey hunting', 'wild turkey hunt',
  'pheasant', 'quail', 'grouse', 'chukar', 'partridge',
  'duck hunting', 'duck blind', 'goose hunting',
  'waterfowl', 'dove hunting', 'snipe', 'woodcock',
  // Fish — require fishing context for ambiguous terms like "bass", "tuna", "marlin"
  'trout', 'salmon', 'steelhead',
  'bass fishing', 'largemouth', 'smallmouth', 'striped bass', 'spotted bass',
  'walleye', 'pike', 'muskie', 'catfish', 'crappie', 'bluegill', 'perch', 'carp',
  'tarpon', 'bonefish', 'redfish', 'snook', 'permit',
  'tuna fishing', 'marlin fishing', 'mahi', 'wahoo', 'halibut', 'striper', 'flounder',
  'fly fish', 'fly fishing', 'fly rod', 'fly tying', 'wading', 'waders'
];

// Outdoor gear, apparel, optics, equipment brands
const GEAR = [
  'hunting gear', 'hunting apparel', 'hunting clothing', 'hunting boot', 'hunting pack',
  'camo', 'camouflage', 'blaze orange', 'gore-tex',
  'bow hunting', 'archery', 'crossbow', 'compound bow', 'recurve',
  'arrow', 'broadhead', 'quiver',
  'rifle', 'shotgun', 'muzzleloader', 'firearm', 'handgun', 'pistol',
  'ammunition', 'ammo', 'cartridge', 'bullet',
  'riflescope', 'hunting optic', 'rangefinder', 'binocular', 'spotting scope',
  'trail camera', 'game camera', 'feeder', 'decoy', 'game call',
  'hunting knife', 'skinning', 'field dressing', 'game processing',
  'fishing rod', 'fishing reel', 'fishing tackle', 'fishing lure',
  'fishing line', 'fishing apparel', 'fishing gear', 'wader', 'wading boot',
  'kayak fish', 'fishing kayak', 'bass boat', 'drift boat'
];

// Audience / positioning signals — who their customers are.
// Removed 'passionate' and 'dedicated' — too generic (music schools, gyms, etc.).
const AUDIENCE = [
  'sportsman', 'sportsmen', 'sportswomen',
  'hunter', 'hunters', 'angler', 'anglers',
  'affluent', 'luxury', 'premium', 'high-end', 'upscale', 'discerning',
  'serious hunter', 'serious angler', 'avid hunter', 'avid angler',
  'hardcore', 'trophy', 'conservation', 'wildlife', 'wild game',
  'outdoor enthusiast', 'outdoor lifestyle'
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function matchList(text, keywords) {
  return keywords.filter(kw => text.includes(kw));
}

function buildText(lead) {
  return [
    lead.companyName,
    lead.companyIndustry,
    lead.companyDescription,
    lead.speciesOrActivities,
    lead.productCategory,
    lead.audiencePositioning,
    lead.coreValues,
    lead.season,
    lead.yearsInBusiness,
    lead.linkedinHeadline,
    lead.title
  ].filter(Boolean).join(' ').toLowerCase();
}

// ── Completeness gate ─────────────────────────────────────────────────────────

/**
 * True if the lead has enough extracted enrichment data to produce a reliable
 * fit score. Leads that fail this check are held for retry rather than scored
 * on incomplete data — which would produce unpredictable verdicts.
 *
 * Requires at least one of:
 *   - companyDescription with ≥ 20 chars (excludes trivial stub values)
 *   - any domain-specific extracted field (species, product, audience, years)
 *
 * Intentionally does NOT count companyIndustry (Apollo generic label) or
 * companyName alone — those aren't enough signal to score reliably.
 *
 * @param {Object} lead  normalized lead from normalizeClayRow()
 * @returns {boolean}
 */
export function isEnrichmentComplete(lead) {
  const descOk    = (lead.companyDescription?.trim().length ?? 0) >= 20;
  const hasField  = !!(
    lead.speciesOrActivities?.trim() ||
    lead.productCategory?.trim()     ||
    lead.audiencePositioning?.trim() ||
    lead.yearsInBusiness?.trim()
  );
  return descOk || hasField;
}

// ── Scorer ────────────────────────────────────────────────────────────────────

/**
 * Score an enriched, normalized lead for fit with Elite Compass.
 * Only call this after isEnrichmentComplete() returns true.
 *
 * @param {Object} lead  normalized lead from normalizeClayRow()
 * @returns {{ total: number, breakdown: Object, matched: string[], richFields: number }}
 */
export function scoreLead(lead) {
  const text = buildText(lead);

  const guideLodgeMatches = matchList(text, GUIDE_LODGE);
  const speciesMatches    = matchList(text, SPECIES);
  const gearMatches       = matchList(text, GEAR);
  const audienceMatches   = matchList(text, AUDIENCE);

  // ── Vertical (0–4): what the business actually does ──────────────────────
  let vertical = 0;
  if (guideLodgeMatches.length > 0) {
    vertical = 4;
  } else if (speciesMatches.length >= 2) {
    vertical = 4;
  } else if (speciesMatches.length === 1) {
    vertical = 3;
  } else if (gearMatches.length >= 2) {
    vertical = 3;
  } else if (gearMatches.length === 1) {
    vertical = 2;
  } else if (
    text.includes('outdoor') ||
    text.includes('sporting goods') ||
    text.includes('recreation') ||
    text.includes('adventure')
  ) {
    vertical = 1;
  }

  // ── Audience (0–3): overlap with Elite Compass readers ───────────────────
  let audience = 0;
  const hasSpecies  = speciesMatches.length > 0;
  const hasAudience = audienceMatches.length > 0;

  if (audienceMatches.length >= 2 || (hasSpecies && hasAudience)) {
    audience = 3;
  } else if (hasAudience || speciesMatches.length >= 2) {
    audience = 2;
  } else if (hasSpecies || gearMatches.length >= 2 || vertical >= 3) {
    audience = 1;
  }

  // ── Data depth (0–2): enough signal for a specific email ─────────────────
  const richFields = [
    lead.companyDescription,
    lead.speciesOrActivities,
    lead.productCategory,
    lead.audiencePositioning,
    lead.yearsInBusiness,
    lead.coreValues,
    lead.season
  ].filter(f => f?.trim()).length;

  const dataDepth = richFields >= 3 ? 2 : richFields >= 1 ? 1 : 0;

  // ── Commercial viability (0–1) ────────────────────────────────────────────
  const nameAndDesc   = `${lead.companyName ?? ''} ${lead.companyDescription ?? ''}`.toLowerCase();
  const nonCommercial = ['nonprofit', 'non-profit', 'foundation', 'association',
                         '501(c)', 'government', 'municipal', 'university', 'college'];
  const commercial    = nonCommercial.some(kw => nameAndDesc.includes(kw)) ? 0 : 1;

  const total = vertical + audience + dataDepth + commercial;

  const matched = [...new Set([
    ...guideLodgeMatches,
    ...speciesMatches,
    ...gearMatches,
    ...audienceMatches
  ])].slice(0, 5);

  return {
    total,
    breakdown: { vertical, audience, dataDepth, commercial },
    matched,
    richFields
  };
}

/**
 * Would this lead potentially pass the threshold if a scrape had succeeded?
 * Used to distinguish genuine no-fit from scrape-failure-induced low score.
 */
export function couldPassWithBetterData(fit, threshold) {
  const maxDataDepth = 2;
  return (fit.total + (maxDataDepth - fit.breakdown.dataDepth)) >= threshold;
}

/**
 * Format a score row for the summary table.
 * meta: { scrapeOkPages, totalPages, enrichmentComplete }
 */
export function formatScoreRow(lead, fit, status, meta = {}) {
  const { scrapeOkPages = null, totalPages = null, enrichmentComplete = null } = meta;

  const label = ({ PASS: 'PASS', HOLD: 'HOLD', RJCT: 'RJCT', DUPE: 'DUPE' })[status] ?? 'SKIP';

  const scoreStr = fit
    ? `${fit.total}/10 [V:${fit.breakdown.vertical} A:${fit.breakdown.audience} D:${fit.breakdown.dataDepth} C:${fit.breakdown.commercial}]`
    : `-- /10 [not scored]            `;

  const kws  = fit?.matched.length ? fit.matched.join(', ') : '';
  const name = (lead.companyName ?? lead.email ?? '?').slice(0, 28).padEnd(28);

  const scrapeTag  = totalPages !== null ? ` scrape:${scrapeOkPages}/${totalPages}pg` : '';
  const enrichTag  = enrichmentComplete !== null
    ? (enrichmentComplete ? ' enrich:OK' : ' enrich:EMPTY')
    : '';

  return `  ${label} ${scoreStr}  ${name}  ${kws}${scrapeTag}${enrichTag}`;
}

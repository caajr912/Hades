import Anthropic from '@anthropic-ai/sdk';
import { parse } from 'node-html-parser';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const HAIKU = 'claude-haiku-4-5-20251001';

const SCRAPE_TIMEOUT_MS = 5000;
const MAX_TEXT_CHARS = 8000;
const CANDIDATE_PATHS = ['', '/about', '/about-us', '/services'];

const EXTRACTED_FIELDS = [
  'company_description',
  'species_or_activities',
  'season',
  'product_category',
  'audience_positioning',
  'years_in_business',
  'core_values'
];

/**
 * Fetch and concatenate text from up to 3 pages of a company's website.
 * Returns '' on any total failure — never throws.
 *
 * @param {string} rawUrl  company website URL or bare domain
 * @returns {Promise<string>}
 */
export async function scrapeCompany(rawUrl) {
  if (!rawUrl) return '';

  let base;
  try {
    const normalized = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
    const u = new URL(normalized);
    base = `${u.protocol}//${u.host}`;
  } catch {
    return '';
  }

  const chunks = [];
  for (const path of CANDIDATE_PATHS) {
    if (chunks.join(' ').length >= MAX_TEXT_CHARS) break;
    try {
      const text = await fetchPageText(`${base}${path}`);
      if (text) chunks.push(text);
    } catch {
      // best-effort: skip failed pages silently
    }
  }

  return chunks.join('\n\n').slice(0, MAX_TEXT_CHARS);
}

async function fetchPageText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Hades-enricher/1.0)' }
    });
    if (!res.ok) return '';
    const html = await res.text();
    return htmlToText(html);
  } finally {
    clearTimeout(timer);
  }
}

function htmlToText(html) {
  const root = parse(html);
  root.querySelectorAll('script, style, nav, footer, header, noscript, iframe').forEach(el => el.remove());
  return root.text.replace(/\s+/g, ' ').trim();
}

/**
 * Extract enrichment fields from scraped website text using Claude Haiku.
 * Falls back gracefully to Apollo-provided data when text is empty.
 * Returns empty strings for any field not determinable — no fabrication.
 *
 * @param {string} scrapedText  plain text from scrapeCompany()
 * @param {Object} apolloLead   normalized Apollo lead (enrichmentReady shape)
 * @returns {Promise<Object>}   object with EXTRACTED_FIELDS keys
 */
export async function extractLeadFields(scrapedText, apolloLead) {
  const contextLines = [
    apolloLead.companyName        && `Company: ${apolloLead.companyName}`,
    apolloLead.industry           && `Industry: ${apolloLead.industry}`,
    apolloLead.companyDescription && `Apollo description: ${apolloLead.companyDescription}`,
    scrapedText                   && `Website text:\n${scrapedText}`
  ].filter(Boolean);

  if (!contextLines.length) return emptyFields();

  let msg;
  try {
    msg = await client.messages.create({
      model: HAIKU,
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `Extract the following fields from the company information below. Return ONLY a JSON object with these exact keys. Use "" for any field you cannot determine — do not fabricate or infer beyond what is stated.

Fields:
- company_description: 1–2 sentence factual summary of what the company does
- species_or_activities: hunting/fishing species or outdoor activities offered (e.g. "whitetail deer, elk, pheasant" or "fly fishing, bass")
- season: operating season if stated (e.g. "fall/winter", "year-round", "May–September")
- product_category: for gear/apparel/optics brands, the product type (e.g. "hunting optics", "camo apparel")
- audience_positioning: how they describe their target customer or position themselves
- years_in_business: year founded or years operating as stated (e.g. "since 1987", "family-owned since 1992")
- core_values: brand values or mission language (e.g. "conservation", "family tradition", "precision craftsmanship")

Company information:
${contextLines.join('\n\n')}

Return only the JSON object, no markdown fences.`
      }]
    });
  } catch (err) {
    console.warn(`extractLeadFields: Claude call failed for ${apolloLead.companyName ?? 'unknown'}: ${err.message}`);
    return emptyFields();
  }

  try {
    const cleaned = msg.content[0].text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();
    return JSON.parse(cleaned);
  } catch {
    console.warn(`extractLeadFields: could not parse JSON for ${apolloLead.companyName ?? 'unknown'}`);
    return emptyFields();
  }
}

function emptyFields() {
  return Object.fromEntries(EXTRACTED_FIELDS.map(k => [k, '']));
}

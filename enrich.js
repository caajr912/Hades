import Anthropic from '@anthropic-ai/sdk';
import { parse } from 'node-html-parser';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const HAIKU = 'claude-haiku-4-5-20251001';

const SCRAPE_TIMEOUT_MS = 5000;
const RETRY_TIMEOUT_MS  = 10000;  // one retry with doubled timeout on TIMEOUT failures
const MAX_TEXT_CHARS    = 8000;
const CANDIDATE_PATHS   = ['', '/about', '/about-us', '/services', '/contact', '/contact-us'];

const EXTRACTED_FIELDS = [
  'company_description',
  'species_or_activities',
  'season',
  'product_category',
  'audience_positioning',
  'years_in_business',
  'core_values'
];

// Contact fields use null (not '') for "not found" — write-back logic
// downstream distinguishes null from empty string.
const CONTACT_FIELDS = ['contact_name', 'contact_title'];

// ── Scraper ───────────────────────────────────────────────────────────────────

/**
 * Fetch and concatenate text from up to 6 candidate pages of a company's
 * website (stops early once MAX_TEXT_CHARS is reached).
 * Classifies each page result and retries once on TIMEOUT.
 * Never throws — returns { text, pages } where pages holds per-page diagnostics.
 *
 * page.status values: OK | TIMEOUT | BLOCKED | NOT_FOUND | HTTP_ERR | EMPTY | NET_ERR
 *
 * @param {string} rawUrl
 * @returns {Promise<{ text: string, pages: object[] }>}
 */
export async function scrapeCompany(rawUrl) {
  if (!rawUrl) return { text: '', pages: [] };

  let base;
  try {
    const normalized = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
    const u = new URL(normalized);
    base = `${u.protocol}//${u.host}`;
  } catch {
    return { text: '', pages: [{ path: '/', status: 'INVALID_URL' }] };
  }

  const chunks = [];
  const pages  = [];

  for (const path of CANDIDATE_PATHS) {
    if (chunks.join(' ').length >= MAX_TEXT_CHARS) break;

    let result = await fetchPageResult(`${base}${path}`);

    // Retry once on timeout — some sites are slow to respond
    if (result.status === 'TIMEOUT') {
      const retry = await fetchPageResult(`${base}${path}`, RETRY_TIMEOUT_MS);
      result = { ...retry, retried: true };
    }

    pages.push({ path: path || '/', ...result });
    if (result.text) chunks.push(result.text);
  }

  const text = chunks.join('\n\n').slice(0, MAX_TEXT_CHARS);

  // One-line diagnostic per domain
  const pageSummary = pages
    .map(p => {
      const label = p.path === '/' ? 'home' : p.path.slice(1);
      const tag   = p.chars ? `${p.status}(${p.chars})` : p.status;
      return `${label}=${tag}${p.retried ? '*' : ''}`;
    })
    .join(' ');
  const outcome = text ? `${text.length}ch` : 'EMPTY';
  console.log(`  scrape ${base}: ${pageSummary} → ${outcome}`);

  return { text, pages };
}

async function fetchPageResult(url, timeoutMs = SCRAPE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Hades-enricher/1.0)' }
    });
    if (!res.ok) {
      if (res.status === 403 || res.status === 401) return { text: '', status: 'BLOCKED', chars: 0 };
      if (res.status === 404)                        return { text: '', status: 'NOT_FOUND', chars: 0 };
      return { text: '', status: `HTTP${res.status}`, chars: 0 };
    }
    const html = await res.text();
    const text = htmlToText(html);
    if (!text) return { text: '', status: 'EMPTY', chars: 0 };
    return { text, status: 'OK', chars: text.length };
  } catch (err) {
    if (err.name === 'AbortError') return { text: '', status: 'TIMEOUT', chars: 0 };
    return { text: '', status: 'NET_ERR', chars: 0 };
  } finally {
    clearTimeout(timer);
  }
}

function htmlToText(html) {
  const root = parse(html);
  root.querySelectorAll('script, style, nav, footer, header, noscript, iframe').forEach(el => el.remove());
  // structuredText (not .text) inserts a break at block-element boundaries —
  // .text concatenates adjacent elements with nothing between them, which
  // silently merges e.g. "...April Johnson</p><p>Our store..." into
  // "JohnsonOur", corrupting both word-boundary checks and the text fed to
  // the extraction model.
  return root.structuredText.replace(/\s+/g, ' ').trim();
}

// ── Extractor ─────────────────────────────────────────────────────────────────

/**
 * Extract enrichment fields from scraped website text using Claude Haiku.
 * Falls back gracefully to Apollo-provided data when text is empty.
 * Returns empty strings for undetermined content fields, and null for
 * undetermined contact_name/contact_title — no fabrication either way.
 *
 * @param {string} scrapedText
 * @param {Object} apolloLead
 * @returns {Promise<Object>}
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
        content: `Extract the following fields from the company information below. Return ONLY a JSON object with these exact keys.

Fields:
- company_description: 1–2 sentence factual summary of what the company does. Use "" if you cannot determine this.
- species_or_activities: hunting/fishing species or outdoor activities offered (e.g. "whitetail deer, elk, pheasant" or "fly fishing, bass"). Use "" if you cannot determine this.
- season: operating season if stated (e.g. "fall/winter", "year-round", "May–September"). Use "" if you cannot determine this.
- product_category: for gear/apparel/optics brands, the product type (e.g. "hunting optics", "camo apparel"). Use "" if you cannot determine this.
- audience_positioning: how they describe their target customer or position themselves. Use "" if you cannot determine this.
- years_in_business: year founded or years operating as stated (e.g. "since 1987", "family-owned since 1992"). Use "" if you cannot determine this.
- core_values: brand values or mission language (e.g. "conservation", "family tradition", "precision craftsmanship"). Use "" if you cannot determine this.
- contact_name: the name of the owner, founder, or primary guide/contact, if an individual is actually named in the WEBSITE TEXT — an About/Team/Contact page, a "meet your guide" bio, a signed welcome note, a testimonial that names a staff member, etc. Base this ONLY on the website text, never on the company name — do not infer or guess a person's name just because it resembles part of the company name (e.g. do not return "Dave Blackburn" for "Dave Blackburn's Kootenai Angler" unless an individual named Dave Blackburn is actually mentioned in the website text itself). If more than one person is named, resolve it to ONE person as follows: if they share a surname (e.g. "Keith and April Johnson", "your hosts, Jake and Laurel DeLong"), return the FIRST person's full name INCLUDING the shared surname (e.g. "Keith Johnson", "Jake DeLong") — do not drop the surname just because it's written after the second person's name, and do not include the second person. If they do NOT share a surname (e.g. a list of distinct guides), return only the first person's name as written. Never return a compound string containing "and" or "&" — always resolve it to a single person's name first. Use JSON null if no individual is named anywhere in the website text — a generic contact form, a company name alone, or a list of staff first names with no clear primary contact are all null.
- contact_title: that person's role/title exactly as stated (e.g. "Owner", "Head Guide", "Founder"). Use JSON null if no title is stated, even when a name was found.

Do not fabricate or infer beyond what is explicitly stated for any field.

Company information:
${contextLines.join('\n\n')}

Return only the JSON object, no markdown fences.`
      }]
    });
  } catch (err) {
    console.warn(`  extract: Claude failed for ${apolloLead.companyName ?? 'unknown'}: ${err.message}`);
    return emptyFields();
  }

  try {
    const cleaned = msg.content[0].text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();
    const parsed = normalizeContactFields(JSON.parse(cleaned));
    return enforceNameInScrapedText(parsed, scrapedText, apolloLead.companyName);
  } catch {
    console.warn(`  extract: bad JSON for ${apolloLead.companyName ?? 'unknown'}`);
    return emptyFields();
  }
}

function emptyFields() {
  return {
    ...Object.fromEntries(EXTRACTED_FIELDS.map(k => [k, ''])),
    ...Object.fromEntries(CONTACT_FIELDS.map(k => [k, null]))
  };
}

const NULLISH_NAME_VALUES = new Set(['', 'n/a', 'na', 'none', 'null', 'unknown', 'not stated', 'not found']);

/**
 * Guard against model inconsistency on contact_name/contact_title:
 * coerce empty-ish strings to null. Shared-surname/multi-person resolution
 * is the prompt's job now (see extraction prompt) — code no longer guesses
 * how to split a compound name, since a naive split can silently truncate a
 * correctly-resolved "Keith Johnson" down to "Keith and April Johnson" → "Keith".
 * If the model still returns a compound string despite the prompt instruction,
 * null it out rather than guess how to fix it.
 */
function normalizeContactFields(fields) {
  const clean = (v) => {
    if (v == null) return null;
    const trimmed = String(v).trim();
    return NULLISH_NAME_VALUES.has(trimmed.toLowerCase()) ? null : trimmed;
  };

  let contactName = clean(fields.contact_name);
  let contactTitle = clean(fields.contact_title);

  if (contactName && /\b(and|&)\b/i.test(contactName)) {
    console.warn(`  extract: contact_name still compound despite resolution instruction, nulling: "${contactName}"`);
    contactName = null;
    contactTitle = null;
  }

  return { ...fields, contact_name: contactName, contact_title: contactTitle };
}

/**
 * Guardrail enforced in code, not delegated to Claude (same philosophy as
 * compose.js's runGuardrails): a contact_name must be verifiable against the
 * actual scraped page text, not just plausible from the company name. Checks
 * that every meaningful token of the name appears as a whole word somewhere
 * in scrapedText — not requiring the full name as one contiguous substring,
 * since a correctly-resolved shared surname (e.g. "Keith Johnson" from
 * "Keith and April Johnson") won't appear contiguously in the source text.
 */
function enforceNameInScrapedText(fields, scrapedText, companyName) {
  if (!fields.contact_name) return fields;

  const haystack = (scrapedText ?? '').toLowerCase();
  const tokens = fields.contact_name
    .split(/\s+/)
    .map(t => t.replace(/[^a-z]/gi, ''))
    .filter(t => t.length >= 2);

  const verified = tokens.length > 0 && tokens.every(t => new RegExp(`\\b${t}\\b`, 'i').test(haystack));

  if (!verified) {
    console.warn(`  extract: contact_name "${fields.contact_name}" not found in scraped text for ${companyName ?? 'unknown'} — likely inferred from company name, nulling`);
    return { ...fields, contact_name: null, contact_title: null };
  }
  return fields;
}

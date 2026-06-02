import Anthropic from '@anthropic-ai/sdk';
import { parse } from 'node-html-parser';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const HAIKU = 'claude-haiku-4-5-20251001';

const SCRAPE_TIMEOUT_MS = 5000;
const RETRY_TIMEOUT_MS  = 10000;  // one retry with doubled timeout on TIMEOUT failures
const MAX_TEXT_CHARS    = 8000;
const CANDIDATE_PATHS   = ['', '/about', '/about-us', '/services'];

const EXTRACTED_FIELDS = [
  'company_description',
  'species_or_activities',
  'season',
  'product_category',
  'audience_positioning',
  'years_in_business',
  'core_values'
];

// ── Scraper ───────────────────────────────────────────────────────────────────

/**
 * Fetch and concatenate text from up to 3 pages of a company's website.
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
  return root.text.replace(/\s+/g, ' ').trim();
}

// ── Extractor ─────────────────────────────────────────────────────────────────

/**
 * Extract enrichment fields from scraped website text using Claude Haiku.
 * Falls back gracefully to Apollo-provided data when text is empty.
 * Returns empty strings for any field not determinable — no fabrication.
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
    console.warn(`  extract: Claude failed for ${apolloLead.companyName ?? 'unknown'}: ${err.message}`);
    return emptyFields();
  }

  try {
    const cleaned = msg.content[0].text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();
    return JSON.parse(cleaned);
  } catch {
    console.warn(`  extract: bad JSON for ${apolloLead.companyName ?? 'unknown'}`);
    return emptyFields();
  }
}

function emptyFields() {
  return Object.fromEntries(EXTRACTED_FIELDS.map(k => [k, '']));
}

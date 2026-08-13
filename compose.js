import Anthropic from '@anthropic-ai/sdk';
import { BRAND_PROFILE } from './config/brand.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-6';

/**
 * Deterministic per-lead style assignment.
 *
 * Each email is composed by an independent, stateless model call that cannot see
 * the other emails in a batch — so an instruction to "vary across emails" is
 * impossible to honor and the model converges on one pattern. Instead we hash the
 * lead's email to pick ONE opener, ONE close, and ONE subject format from
 * BRAND_PROFILE.styleVariants, and inject them as a STYLE block. Same lead always
 * maps to the same style (stable across recompose runs); across a batch the styles
 * spread. xmur3 gives good low-bit distribution so successive picks are independent.
 */
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function styleDirective(lead) {
  const sv = BRAND_PROFILE.styleVariants;
  const company = lead.companyName ?? 'their operation';
  const fill = (s) => s.replace(/\{company\}/gi, company);
  const seed = String(lead.email || lead.apolloId || lead.companyName || Math.random());
  const rand = xmur3(seed);
  const opener  = fill(sv.openers[rand()       % sv.openers.length]);
  const door    = fill(sv.audienceDoors[rand() % sv.audienceDoors.length]);
  const close   = fill(sv.closes[rand()        % sv.closes.length]);
  const subject = fill(sv.subjects[rand()      % sv.subjects.length]);
  return `STYLE FOR THIS EMAIL — follow exactly; do not fall back to a stock opener, audience line, or close even if the examples suggest one:
- OPENER: ${opener}
- AUDIENCE DOOR: ${door}
- THE ASK: ${close}
- SUBJECT LINE: use exactly this — ${subject}`;
}

/**
 * Generate a full cold email (subject + body) for an enriched lead.
 *
 * Guardrails enforced in code after generation:
 *   - Subject character limit
 *   - Body word count limit
 *   - Banned phrase check
 *   - Compliance footer appended (not delegated to Claude)
 *
 * @param {Object} lead  normalized lead from normalizeClayRow()
 * @returns {Promise<{subject: string, body: string}>}
 */
export async function composeDraft(lead) {
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: buildSystemPrompt(),
    messages: [{ role: 'user', content: `${buildLeadBlock(lead)}\n\n${styleDirective(lead)}` }]
  });

  const draft = parseResponse(msg.content[0].text);
  runGuardrails(draft, lead);
  draft.body += BRAND_PROFILE.complianceFooter;
  return draft;
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

function buildSystemPrompt() {
  const bp = BRAND_PROFILE;
  const sender = bp.sender;

  const examplesText = bp.exampleEmails.map((ex, i) => [
    `=== EXAMPLE ${i + 1} ===`,
    `Lead data:\n${ex.leadContext}`,
    `Subject: ${ex.subject}`,
    `Body:\n${ex.body}`,
    `=== END ${i + 1} ===`
  ].join('\n')).join('\n\n');

  return `You write short, personal cold outreach emails for ${bp.name} (${bp.website}), ${bp.tagline}.

WHAT WE SELL
${bp.product}

VOICE
${bp.voice}

EMAIL STRUCTURE — write in this exact order, no section headings in the output:
1. Opener — ${bp.skeleton.hook}
2. Curiosity — ${bp.skeleton.whyThem}
3. Audience door — ${bp.skeleton.offer}
4. The ask — ${bp.skeleton.cta}

HARD RULES
- Only use facts explicitly stated in the lead data — zero fabrication, zero assumption
- Subject: ≤${bp.lengthLimits.subjectMaxChars} characters
- Body: ≤${bp.lengthLimits.bodyMaxWords} words
- Never use: ${bp.bannedPhrases.map(p => `"${p}"`).join(', ')}
- Do not include a sign-off, signature, or compliance footer — added separately by the system
- ALWAYS return the JSON object — even if lead data is sparse, write the best email you can from what is provided. Never respond with prose, questions, or explanations.

SENDER
${sender.name}, ${sender.title}, ${sender.company}

OUTPUT FORMAT
Return only this JSON object — no markdown fences, no explanation, nothing else:
{"subject": "...", "body": "..."}

EXAMPLES
${examplesText}`;
}

function buildLeadBlock(lead) {
  const lines = [];

  // Company
  if (lead.companyName)        lines.push(`Business: ${lead.companyName}`);
  if (lead.companyIndustry)    lines.push(`Industry: ${lead.companyIndustry}`);
  if (lead.city || lead.state) lines.push(`Location: ${[lead.city, lead.state].filter(Boolean).join(', ')}`);
  if (lead.companyDescription) lines.push(`About: ${lead.companyDescription}`);
  if (lead.companyFoundedYear) lines.push(`Founded: ${lead.companyFoundedYear}`);

  // Contact (informs tone; first name is used in the greeting)
  if (lead.firstName)        lines.push(`Contact first name: ${lead.firstName}`);
  if (lead.title)            lines.push(`Contact title: ${lead.title}`);
  if (lead.linkedinHeadline) lines.push(`Contact headline: ${lead.linkedinHeadline}`);
  if (lead.seniority)        lines.push(`Seniority: ${lead.seniority}`);

  // Outdoor-specific enrichment
  if (lead.speciesOrActivities) lines.push(`Species / activities: ${lead.speciesOrActivities}`);
  if (lead.season)               lines.push(`Season: ${lead.season}`);
  if (lead.yearsInBusiness)      lines.push(`In business since: ${lead.yearsInBusiness}`);
  if (lead.productCategory)      lines.push(`Product category: ${lead.productCategory}`);
  if (lead.audiencePositioning)  lines.push(`Audience / positioning: ${lead.audiencePositioning}`);
  if (lead.recentLaunches)       lines.push(`Recent launches: ${lead.recentLaunches}`);
  if (lead.socialFollowing)      lines.push(`Social following: ${lead.socialFollowing}`);
  if (lead.coreValues)           lines.push(`Brand values: ${lead.coreValues}`);

  return lines.join('\n') || `Business: ${lead.companyName ?? 'unknown'}`;
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

function parseResponse(text) {
  // 1. Strip markdown fences
  let cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // 2. Claude sometimes adds a prose prefix before the JSON object; extract the first {...}
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { parsed = JSON.parse(match[0]); } catch { /* fall through */ }
    }
    if (!parsed) throw new Error(`compose: Claude response is not valid JSON.\nRaw:\n${text}`);
  }
  if (!parsed.subject || !parsed.body) {
    throw new Error(`compose: JSON missing required fields.\nParsed: ${JSON.stringify(parsed)}`);
  }
  return {
    subject: String(parsed.subject).trim(),
    body:    String(parsed.body).trim()
  };
}

// ---------------------------------------------------------------------------
// Guardrails — enforced in code, not delegated to Claude
// ---------------------------------------------------------------------------

function runGuardrails(draft, lead) {
  const { lengthLimits, bannedPhrases } = BRAND_PROFILE;

  if (draft.subject.length > lengthLimits.subjectMaxChars) {
    throw new Error(
      `compose: subject too long (${draft.subject.length} chars, limit ${lengthLimits.subjectMaxChars}).\n"${draft.subject}"`
    );
  }

  const wordCount = draft.body.split(/\s+/).filter(Boolean).length;
  if (wordCount > lengthLimits.bodyMaxWords) {
    throw new Error(`compose: body too long (${wordCount} words, limit ${lengthLimits.bodyMaxWords})`);
  }

  const combined = `${draft.subject} ${draft.body}`.toLowerCase();
  for (const phrase of bannedPhrases) {
    if (combined.includes(phrase.toLowerCase())) {
      throw new Error(`compose: draft contains banned phrase: "${phrase}"`);
    }
  }

  if (!lead.companyName) {
    console.warn('compose: lead.companyName is empty — review draft carefully for fabrication');
  }
}

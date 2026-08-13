import 'dotenv/config';
import pg from 'pg';
import { scrapeCompany, extractLeadFields } from './enrich.js';

/**
 * One-off backfill: for Lead Engine leads with a website but no contact_name/
 * ask_for, scrape the site and ask Claude for the owner/primary contact's
 * name + title (enrich.js's 8th extracted field), then write the result back
 * to leads.contact_name / contact_title / ask_for.
 *
 * Write-back rules (per decision, see conversation — not re-derived here):
 *   - First-name-only find  → ask_for only, contact_name stays null.
 *   - Full name (2+ tokens) → both contact_name and ask_for (first token).
 *   - contact_title is written whenever known, independent of name completeness.
 *   - Never overwrites an existing non-null value in any of the 3 columns
 *     (per-column COALESCE in the UPDATE).
 *
 * Usage:
 *   node backfill-leadengine-contacts.js               # dry run, all gap rows
 *   node backfill-leadengine-contacts.js --limit=20     # dry run, first 20
 *   node backfill-leadengine-contacts.js --commit       # writes to Postgres
 *   node backfill-leadengine-contacts.js --commit --limit=20
 */

const CONCURRENCY = 5;

const args    = process.argv.slice(2);
const COMMIT  = args.includes('--commit');
const limitArg = args.find(a => a.startsWith('--limit='));
const LIMIT   = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Split an extracted contact name into the write-back shape.
 * @param {string|null} contactName  already normalized to a single person by enrich.js
 * @param {string|null} contactTitle
 */
function splitForWriteback(contactName, contactTitle) {
  if (!contactName) {
    return { contact_name: null, contact_title: null, ask_for: null };
  }
  const tokens = contactName.split(/\s+/);
  if (tokens.length >= 2) {
    return { contact_name: contactName, contact_title: contactTitle, ask_for: tokens[0] };
  }
  // First-name-only: not enough for a "contact_name" record, but still useful
  // on a call script.
  return { contact_name: null, contact_title: contactTitle, ask_for: contactName };
}

async function fetchGapLeads(client) {
  const params = [];
  let sql = `
    select id, company, category, website
    from leads
    where client = 'TEC'
      and website is not null and trim(website) <> ''
      and contact_name is null
      and ask_for is null
    order by created_at
  `;
  if (LIMIT) {
    params.push(LIMIT);
    sql += ` limit $${params.length}`;
  }
  const { rows } = await client.query(sql, params);
  return rows;
}

async function writeBack(db, leadId, fields) {
  if (!fields.contact_name && !fields.contact_title && !fields.ask_for) return false;
  await db.query(
    `update leads
     set contact_name  = coalesce(contact_name, $1),
         contact_title = coalesce(contact_title, $2),
         ask_for       = coalesce(ask_for, $3),
         updated_at    = now()
     where id = $4`,
    [fields.contact_name, fields.contact_title, fields.ask_for, leadId]
  );
  return true;
}

async function runConcurrent(items, limit, fn) {
  const queue = [...items];
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => { while (queue.length) await fn(queue.shift()); }
  );
  await Promise.all(workers);
}

async function main() {
  const client = await pool.connect();
  let leads;
  try {
    leads = await fetchGapLeads(client);
  } finally {
    client.release();
  }

  console.log(`Backfill: ${leads.length} lead(s) with a website and no contact_name/ask_for.`);
  console.log(COMMIT ? 'Mode: COMMIT — writing to Postgres.' : 'Mode: DRY RUN — no writes (pass --commit to write).');

  const stats = { total: leads.length, fullName: 0, firstNameOnly: 0, notFound: 0, written: 0, scrapeFailed: 0 };

  await runConcurrent(leads, CONCURRENCY, async (lead) => {
    const category = Array.isArray(lead.category) ? lead.category.join(', ') : lead.category;

    const { text, pages } = await scrapeCompany(lead.website);
    if (!pages.some(p => p.status === 'OK')) stats.scrapeFailed++;

    const extracted = await extractLeadFields(text, { companyName: lead.company, industry: category });
    const fields = splitForWriteback(extracted.contact_name, extracted.contact_title);

    if (fields.contact_name) stats.fullName++;
    else if (fields.ask_for) stats.firstNameOnly++;
    else stats.notFound++;

    const label = fields.contact_name
      ? `${fields.contact_name}${fields.contact_title ? ` (${fields.contact_title})` : ''} → contact_name + ask_for`
      : fields.ask_for
        ? `${fields.ask_for}${fields.contact_title ? ` (${fields.contact_title})` : ''} → ask_for only`
        : 'no contact found';
    console.log(`  ${lead.company}: ${label}`);

    if (COMMIT) {
      const wrote = await writeBack(pool, lead.id, fields);
      if (wrote) stats.written++;
    }
  });

  console.log('\n=== Summary ===');
  console.log(`Total processed:       ${stats.total}`);
  console.log(`Scrape failed:         ${stats.scrapeFailed}`);
  console.log(`Full name found:       ${stats.fullName}`);
  console.log(`First-name-only found: ${stats.firstNameOnly}`);
  console.log(`No contact found:      ${stats.notFound}`);
  if (COMMIT) console.log(`Rows written:          ${stats.written}`);

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

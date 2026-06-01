import crypto from 'crypto';
import axios from 'axios';

/**
 * POST each lead as an individual JSON payload to the Clay table's inbound webhook.
 * Clay's webhook table accepts one object per request.
 * Note: Clay imposes a ~50,000-submission cap per webhook table.
 *
 * @param {Array<Object>} leads  normalized lead objects from apollo.js
 * @returns {Promise<{sent: number, failed: number}>}
 */
export async function pushToClay(leads) {
  const webhookUrl = process.env.CLAY_WEBHOOK_URL;
  if (!webhookUrl) throw new Error('CLAY_WEBHOOK_URL is not set');

  const results = { sent: 0, failed: 0 };

  for (const lead of leads) {
    try {
      await axios.post(webhookUrl, lead, {
        headers: { 'Content-Type': 'application/json' }
      });
      results.sent++;
    } catch (err) {
      console.error(`Clay push failed for ${lead.email}:`, err.response?.data ?? err.message);
      results.failed++;
    }
  }

  console.log(`Clay push complete — sent: ${results.sent}, failed: ${results.failed}`);
  return results;
}

/**
 * Verify the HMAC-SHA256 signature Clay sends on the x-clay-signature header.
 * Requires server.js to capture req.rawBody via express.json({ verify: ... }).
 *
 * @param {import('express').Request} req
 * @returns {boolean}
 */
export function verifyClaySignature(req) {
  const secret = process.env.CLAY_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('CLAY_WEBHOOK_SECRET not set — skipping signature verification');
    return true;
  }

  const signature = req.headers['x-clay-signature'];
  if (!signature) return false;

  const body = req.rawBody ?? Buffer.from(JSON.stringify(req.body));
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');

  // timingSafeEqual requires equal-length buffers
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

/**
 * Map a Clay-enriched row to the lead shape personalize.js and instantly.js expect.
 * Field name aliases handle both snake_case (Clay default export) and camelCase.
 * Adjust the Clay UI column names to match these keys if needed.
 *
 * @param {Object} row  raw payload from Clay's outbound HTTP API column
 * @returns {Object}    normalized lead
 */
export function normalizeClayRow(row) {
  return {
    // Core contact
    firstName:   row.first_name         ?? row.firstName         ?? '',
    lastName:    row.last_name          ?? row.lastName          ?? '',
    email:       row.email              ?? '',
    phone:       row.phone              ?? '',
    title:       row.title              ?? '',
    linkedinUrl: row.linkedin_url       ?? row.linkedinUrl       ?? '',

    // Company
    companyName:         row.company_name        ?? row.companyName        ?? row.organization_name ?? '',
    companyIndustry:     row.industry            ?? row.companyIndustry    ?? '',
    website:             row.website             ?? row.domain             ?? '',
    companyDescription:  row.company_description ?? row.companyDescription ?? '',
    companyTechnologies: row.technologies        ?? row.companyTechnologies ?? [],

    // Location
    city:    row.city    ?? '',
    state:   row.state   ?? '',
    country: row.country ?? 'US',

    // Advertiser-specific enrichment (configure matching column names in Clay UI)
    googleRating:         row.google_rating          ?? row.googleRating         ?? null,
    googleReviewCount:    row.google_review_count     ?? row.googleReviewCount    ?? null,
    recentReviewSnippet:  row.recent_review_snippet   ?? row.recentReviewSnippet  ?? '',
    speciesOrActivities:  row.species_or_activities   ?? row.speciesOrActivities  ?? '',
    season:               row.season                  ?? '',
    yearsInBusiness:      row.years_in_business       ?? row.yearsInBusiness      ?? '',
    productCategory:      row.product_category        ?? row.productCategory      ?? '',
    audiencePositioning:  row.audience_positioning    ?? row.audiencePositioning  ?? '',
    recentLaunches:       row.recent_launches         ?? row.recentLaunches       ?? '',
    socialFollowing:      row.social_following        ?? row.socialFollowing       ?? '',

    // Metadata
    apolloId:  row.apollo_id ?? row.apolloId ?? '',
    pullDate:  row.pull_date ?? row.pullDate  ?? new Date().toISOString()
  };
}

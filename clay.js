/**
 * Map a merged Apollo + Claude-extracted row to the lead shape
 * that composeDraft() and instantly.js expect.
 * Handles both snake_case (Claude extraction) and camelCase (Apollo mapping).
 *
 * @param {Object} row
 * @returns {Object} normalized lead
 */
export function normalizeClayRow(row) {
  return {
    // Core contact
    firstName:   row.first_name ?? row.firstName ?? '',
    lastName:    row.last_name  ?? row.lastName  ?? '',
    email:       row.email      ?? '',
    phone:       row.phone      ?? '',
    title:       row.title      ?? '',
    linkedinUrl: row.linkedin_url ?? row.linkedinUrl ?? '',

    // Person signals — Apollo-derived from LinkedIn data
    linkedinHeadline:   row.headline           ?? row.linkedinHeadline   ?? '',
    seniority:          row.seniority           ?? '',
    companyFoundedYear: row.companyFoundedYear  ?? row.founded_year       ?? null,

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

    // Enrichment fields — extracted by Claude from website scrape
    speciesOrActivities: row.species_or_activities ?? row.speciesOrActivities ?? '',
    season:              row.season                ?? '',
    yearsInBusiness:     row.years_in_business     ?? row.yearsInBusiness     ?? '',
    productCategory:     row.product_category      ?? row.productCategory     ?? '',
    audiencePositioning: row.audience_positioning  ?? row.audiencePositioning ?? '',
    recentLaunches:      row.recent_launches       ?? row.recentLaunches      ?? '',
    socialFollowing:     row.social_following      ?? row.socialFollowing     ?? '',
    coreValues:          row.core_values           ?? row.coreValues          ?? '',

    // Metadata
    apolloId: row.apollo_id ?? row.apolloId ?? '',
    pullDate: row.pull_date ?? row.pullDate  ?? new Date().toISOString()
  };
}

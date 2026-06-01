import axios from 'axios';
import { InstantlyManager } from './instantly.js';
import { APOLLO_CRITERIA, filterLead } from './config/client.js';

export class ApolloLeadPuller {
  constructor(apiKey, instantlyApiKey = null) {
    this.apiKey = apiKey;
    this.baseURL = 'https://api.apollo.io/v1';
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'X-Api-Key': this.apiKey
      }
    });

    this.instantly = instantlyApiKey ? new InstantlyManager(instantlyApiKey) : null;
  }

  async searchPeople(criteria, limit = 25) {
    try {
      const response = await this.client.post('/mixed_people/search', {
        ...criteria,
        page: 1,
        per_page: Math.min(limit, 200)
      });

      if (response.data?.people) {
        console.log(`Found ${response.data.people.length} leads from Apollo`);
        return response.data.people;
      }
      return [];
    } catch (error) {
      console.error('Apollo search error:', error.response?.data || error.message);
      throw new Error(`Apollo search failed: ${error.message}`);
    }
  }

  async searchCompanies(criteria, limit = 25) {
    try {
      const response = await this.client.post('/mixed_companies/search', {
        ...criteria,
        page: 1,
        per_page: Math.min(limit, 200)
      });

      if (response.data?.organizations) {
        console.log(`Found ${response.data.organizations.length} companies from Apollo`);
        return response.data.organizations;
      }
      return [];
    } catch (error) {
      console.error('Apollo company search error:', error.response?.data || error.message);
      throw new Error(`Apollo company search failed: ${error.message}`);
    }
  }

  async getPeopleDetails(personIds) {
    try {
      const response = await this.client.post('/people/match', { ids: personIds });

      if (response.data?.people) {
        console.log(`Retrieved details for ${response.data.people.length} people`);
        return response.data.people;
      }
      return [];
    } catch (error) {
      console.error('Apollo people details error:', error.response?.data || error.message);
      throw new Error(`Apollo people details failed: ${error.message}`);
    }
  }

  filterLeads(leads, filters = {}) {
    const {
      requireEmail = true,
      requireLinkedIn = false,
      excludeGenericEmails = true,
      minEmployees = null,
      maxEmployees = null,
      excludeTitles = [],
      requiredTitles = []
    } = filters;

    return leads.filter(lead => {
      if (requireEmail && !lead.email) return false;
      if (requireLinkedIn && !lead.linkedin_url) return false;

      if (excludeGenericEmails && lead.email) {
        const genericPatterns = ['info@', 'contact@', 'hello@', 'support@', 'admin@'];
        if (genericPatterns.some(p => lead.email.toLowerCase().includes(p))) return false;
      }

      const companySize = lead.organization?.estimated_num_employees;
      if (minEmployees && companySize < minEmployees) return false;
      if (maxEmployees && companySize > maxEmployees) return false;

      const title = lead.title?.toLowerCase() || '';
      if (excludeTitles.length && excludeTitles.some(t => title.includes(t.toLowerCase()))) return false;
      if (requiredTitles.length && !requiredTitles.some(t => title.includes(t.toLowerCase()))) return false;

      return true;
    });
  }

  async getAllLeads(criteria, totalLimit = 100) {
    const allLeads = [];
    let currentPage = 1;

    try {
      while (allLeads.length < totalLimit) {
        const remaining = totalLimit - allLeads.length;
        const pageSize = Math.min(remaining, 100);

        const response = await this.client.post('/mixed_people/search', {
          ...criteria,
          page: currentPage,
          per_page: pageSize
        });

        if (!response.data?.people?.length) {
          console.log(`No more leads at page ${currentPage}`);
          break;
        }

        allLeads.push(...response.data.people);
        console.log(`Page ${currentPage}: ${response.data.people.length} leads (total: ${allLeads.length})`);

        if (response.data.people.length < pageSize) break;

        currentPage++;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      console.log(`Total leads collected: ${allLeads.length}`);
      return allLeads.slice(0, totalLimit);
    } catch (error) {
      console.error('Error in getAllLeads:', error.response?.data || error.message);
      throw error;
    }
  }

  async getWeeklyLeadBatch(batchSize = 100, maxPages = 5) {
    console.log(`Starting weekly lead pull — target ${batchSize} leads, up to ${maxPages} pages...`);

    const campaignId = process.env.INSTANTLY_CAMPAIGN_ID;

    try {
      let allNewLeads = [];
      let currentPage = 1;
      let totalProcessed = 0;
      let totalDuplicates = 0;

      let existingEmails = new Set();
      if (this.instantly) {
        console.log('Getting existing Instantly leads for deduplication...');
        existingEmails = await this.instantly.getExistingLeads(campaignId);
        console.log(`Dedup set: ${existingEmails.size} existing emails`);
      }

      while (allNewLeads.length < batchSize && currentPage <= maxPages) {
        console.log(`\n=== Apollo page ${currentPage} ===`);

        const searchBuffer = Math.min(200, batchSize * 2);
        console.log(`Pulling ${searchBuffer} leads from page ${currentPage}...`);

        const searchBody = ApolloLeadPuller.getWellBuiltWebSearchBody(currentPage, searchBuffer);
        const response = await this.client.post('/mixed_people/search', searchBody);

        if (!response.data?.people?.length) {
          console.log(`No more leads on page ${currentPage}`);
          break;
        }

        let pageLeads = response.data.people;
        console.log(`Raw leads from page ${currentPage}: ${pageLeads.length}`);

        console.log(`Unlocking emails for page ${currentPage}...`);
        pageLeads = await this.enrichLeadsWithEmails(pageLeads);
        console.log(`Unlocked: ${pageLeads.length} leads with real emails`);

        pageLeads.slice(0, 5).forEach((lead, i) => {
          const email = lead.email || 'NO_EMAIL';
          const name = `${lead.first_name || ''} ${lead.last_name || ''}`.trim();
          const company = lead.organization?.name || 'NO_COMPANY';
          console.log(`  ${i + 1}. ${email} — ${name} at ${company}`);
        });

        if (currentPage > 1) {
          const pageEmails = new Set(pageLeads.map(l => l.email).filter(Boolean));
          const overlap = [...pageEmails].filter(e => existingEmails.has(e.toLowerCase())).length;
          console.log(`Overlap with Instantly: ${overlap}/${pageLeads.length}`);
        }

        totalProcessed += pageLeads.length;

        // Apply client-specific quality filter
        pageLeads = this.filterWellBuiltWebLeads(pageLeads);
        console.log(`Quality-filtered: ${pageLeads.length} leads`);

        const pageNewLeads = pageLeads.filter(lead => {
          const email = lead.email?.toLowerCase();
          return email && !existingEmails.has(email);
        });

        const pageDuplicates = pageLeads.length - pageNewLeads.length;
        totalDuplicates += pageDuplicates;

        if (pageDuplicates > 0) {
          console.log(`Removed ${pageDuplicates} duplicates on page ${currentPage}`);
          const samples = pageLeads
            .filter(l => l.email && existingEmails.has(l.email.toLowerCase()))
            .slice(0, 3)
            .map(l => l.email);
          if (samples.length) console.log(`  Sample duplicates: ${samples.join(', ')}`);
        }
        console.log(`New leads on page ${currentPage}: ${pageNewLeads.length}`);

        allNewLeads.push(...pageNewLeads);
        pageNewLeads.forEach(lead => {
          if (lead.email) existingEmails.add(lead.email.toLowerCase());
        });

        console.log(`Running total: ${allNewLeads.length}/${batchSize}`);

        if (allNewLeads.length >= batchSize) {
          console.log(`Target reached — ${allNewLeads.length} new leads collected`);
          break;
        }

        if (pageNewLeads.length < 5) {
          console.log(`Only ${pageNewLeads.length} new leads on page ${currentPage} — market may be saturating`);
        }

        currentPage++;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      console.log(`\nPagination summary:`);
      console.log(`  Pages checked: ${currentPage - 1} / ${maxPages}`);
      console.log(`  Total processed: ${totalProcessed}`);
      console.log(`  Duplicates filtered: ${totalDuplicates}`);
      console.log(`  New leads: ${allNewLeads.length}`);

      if (allNewLeads.length === 0) {
        console.log('No new leads across all pages — criteria may be saturated');
        return [];
      }

      let finalLeads = allNewLeads;
      if (this.instantly) {
        const finalExisting = await this.instantly.getExistingLeads(campaignId);
        finalLeads = allNewLeads.filter(lead => {
          const email = lead.email?.toLowerCase();
          return email && !finalExisting.has(email);
        });
        const extra = allNewLeads.length - finalLeads.length;
        if (extra > 0) console.log(`Final dedup pass: removed ${extra} more`);
      }

      this.logWeeklyBatchSummary(finalLeads, totalDuplicates, currentPage - 1);
      return finalLeads;
    } catch (error) {
      console.error('Weekly batch pull failed:', error.response?.data || error.message);
      throw error;
    }
  }

  async enrichLeadsWithEmails(leads) {
    console.log(`Enriching ${leads.length} leads for email addresses...`);

    const enrichedLeads = [];
    let creditsUsed = 0;
    let failures = 0;

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      console.log(`  Enriching ${i + 1}/${leads.length}: ${lead.first_name} ${lead.last_name} at ${lead.organization?.name}`);

      try {
        const enrichResponse = await this.client.post('/people/match', {
          first_name: lead.first_name,
          last_name: lead.last_name,
          organization_name: lead.organization?.name,
          domain: lead.organization?.website_url,
          id: lead.id
        });

        if (enrichResponse.data?.person?.email) {
          enrichedLeads.push({
            ...lead,
            email: enrichResponse.data.person.email,
            email_status: enrichResponse.data.person.email_status,
            phone_numbers: enrichResponse.data.person.phone_numbers || lead.phone_numbers,
            enriched: true,
            credits_used: 1
          });
          creditsUsed++;
          console.log(`    Found: ${enrichResponse.data.person.email}`);
        } else {
          console.log('    No email found');
          failures++;
        }

        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`    Failed for ${lead.first_name} ${lead.last_name}:`, error.response?.data || error.message);
        failures++;
      }
    }

    console.log(`Enrichment: ${enrichedLeads.length} ok, ${failures} failed, ${creditsUsed} credits used`);
    return enrichedLeads;
  }

  /** Client-specific lead quality filter — delegates to config/client.js */
  filterWellBuiltWebLeads(leads) {
    return leads.filter(filterLead);
  }

  logWeeklyBatchSummary(leads, duplicatesFiltered = 0, pagesChecked = 1) {
    const industries = {};
    const titles = {};
    const states = {};

    leads.forEach(lead => {
      const industry = lead.organization?.industry || 'Unknown';
      industries[industry] = (industries[industry] || 0) + 1;

      const title = lead.title || 'Unknown';
      titles[title] = (titles[title] || 0) + 1;

      const state = lead.state || 'Unknown';
      states[state] = (states[state] || 0) + 1;
    });

    console.log('\nWeekly batch summary:');
    console.log(`  New leads: ${leads.length}`);
    console.log(`  Pages checked: ${pagesChecked}`);
    console.log(`  Duplicates filtered: ${duplicatesFiltered}`);
    console.log('  Top industries:', Object.entries(industries).slice(0, 5));
    console.log('  Top titles:', Object.entries(titles).slice(0, 5));
    console.log('  Top states:', Object.entries(states).slice(0, 5));
  }

  /** Apollo search criteria — reads from config/client.js */
  static getWellBuiltWebCriteria() {
    return APOLLO_CRITERIA;
  }

  static getWellBuiltWebSearchBody(page = 1, perPage = 100) {
    return {
      page,
      per_page: Math.min(perPage, 100),
      ...ApolloLeadPuller.getWellBuiltWebCriteria()
    };
  }
}

export async function runWellBuiltWebBatch(maxPages = 5) {
  const apollo = new ApolloLeadPuller(
    process.env.APOLLO_API_KEY,
    process.env.INSTANTLY_API_KEY
  );

  try {
    console.log(`Starting Apollo lead pull — up to ${maxPages} pages...`);
    const leads = await apollo.getWeeklyLeadBatch(100, maxPages);

    if (leads.length === 0) {
      return { leads: [], message: 'No new leads found' };
    }

    const enrichmentReady = leads.map(lead => ({
      firstName:    lead.first_name,
      lastName:     lead.last_name,
      email:        lead.email,
      phone:        lead.phone_numbers?.[0]?.raw_number,
      title:        lead.title,
      companyName:  lead.organization?.name,
      companySize:  lead.organization?.estimated_num_employees,
      industry:     lead.organization?.industry,
      website:      lead.organization?.website_url,
      city:         lead.city,
      state:        lead.state,
      country:      lead.country,
      apolloId:     lead.id,
      linkedinUrl:  lead.linkedin_url,
      intentScore:  lead.buyer_intent_strength_score || 0,
      lastActivity: lead.last_activity_date,
      pullDate:     new Date().toISOString(),
      leadSource:   'apollo_weekly_batch'
    }));

    console.log(`${enrichmentReady.length} leads ready for Clay`);
    return { leads: enrichmentReady, message: `Found ${enrichmentReady.length} new leads` };
  } catch (error) {
    console.error('Apollo batch failed:', error);
    throw error;
  }
}

export async function findInstantlyCampaigns() {
  try {
    const instantly = new InstantlyManager(process.env.INSTANTLY_API_KEY);
    return await instantly.showMyCampaigns();
  } catch (error) {
    console.error('Failed to fetch campaigns:', error.message);
    return [];
  }
}

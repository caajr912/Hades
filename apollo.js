/**
 * Enhanced Apollo API Authentication Setup with Instantly Deduplication
 * Add this to your .env file:
 * APOLLO_API_KEY=your_apollo_api_key_here
 * INSTANTLY_API_KEY=your_instantly_api_v2_key_here
 * INSTANTLY_CAMPAIGN_ID=your_campaign_id_here (optional)
 * 
 * Cron Schedule for Railway:
 * Every Sunday at 8 PM Central: "0 20 * * 0"
 */
import axios from 'axios';
import { InstantlyManager } from './instantly.js'; // Import your Instantly class

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

    // Initialize Instantly integration if API key provided
    this.instantly = instantlyApiKey ? new InstantlyManager(instantlyApiKey) : null;
  }

  /**
   * Search for people/leads based on criteria
   * @param {Object} criteria - Search parameters
   * @param {number} limit - Number of leads to fetch (default: 25, max: 200)
   * @returns {Promise<Array>} Array of lead objects
   */
  async searchPeople(criteria, limit = 25) {
    try {
      const response = await this.client.post('/mixed_people/search', {
        ...criteria,
        page: 1,
        per_page: Math.min(limit, 200) // Apollo max is 200 per request
      });

      if (response.data && response.data.people) {
        console.log(`✅ Found ${response.data.people.length} leads from Apollo`);
        return response.data.people;
      }

      return [];
    } catch (error) {
      console.error('❌ Apollo search error:', error.response?.data || error.message);
      throw new Error(`Apollo search failed: ${error.message}`);
    }
  }

  /**
   * Search for companies based on criteria
   * @param {Object} criteria - Company search parameters
   * @param {number} limit - Number of companies to fetch
   * @returns {Promise<Array>} Array of company objects
   */
  async searchCompanies(criteria, limit = 25) {
    try {
      const response = await this.client.post('/mixed_companies/search', {
        ...criteria,
        page: 1,
        per_page: Math.min(limit, 200)
      });

      if (response.data && response.data.organizations) {
        console.log(`✅ Found ${response.data.organizations.length} companies from Apollo`);
        return response.data.organizations;
      }

      return [];
    } catch (error) {
      console.error('❌ Apollo company search error:', error.response?.data || error.message);
      throw new Error(`Apollo company search failed: ${error.message}`);
    }
  }

  /**
   * Get detailed info for specific people by their Apollo IDs
   * @param {Array} personIds - Array of Apollo person IDs
   * @returns {Promise<Array>} Array of detailed person objects
   */
  async getPeopleDetails(personIds) {
    try {
      const response = await this.client.post('/people/match', {
        ids: personIds
      });

      if (response.data && response.data.people) {
        console.log(`✅ Retrieved details for ${response.data.people.length} people`);
        return response.data.people;
      }

      return [];
    } catch (error) {
      console.error('❌ Apollo people details error:', error.response?.data || error.message);
      throw new Error(`Apollo people details failed: ${error.message}`);
    }
  }

  /**
   * Filter leads based on quality criteria
   * @param {Array} leads - Raw leads from Apollo
   * @param {Object} filters - Quality filters to apply
   * @returns {Array} Filtered leads
   */
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
      // Must have email if required
      if (requireEmail && !lead.email) {
        return false;
      }

      // Must have LinkedIn if required
      if (requireLinkedIn && !lead.linkedin_url) {
        return false;
      }

      // Filter out generic emails
      if (excludeGenericEmails && lead.email) {
        const genericPatterns = ['info@', 'contact@', 'hello@', 'support@', 'admin@'];
        if (genericPatterns.some(pattern => lead.email.toLowerCase().includes(pattern))) {
          return false;
        }
      }

      // Company size filters
      const companySize = lead.organization?.estimated_num_employees;
      if (minEmployees && companySize < minEmployees) return false;
      if (maxEmployees && companySize > maxEmployees) return false;

      // Title filters
      const title = lead.title?.toLowerCase() || '';
      if (excludeTitles.length && excludeTitles.some(t => title.includes(t.toLowerCase()))) {
        return false;
      }
      if (requiredTitles.length && !requiredTitles.some(t => title.includes(t.toLowerCase()))) {
        return false;
      }

      return true;
    });
  }

  /**
   * Get leads with pagination support for larger batches
   * @param {Object} criteria - Search criteria
   * @param {number} totalLimit - Total number of leads to collect across pages
   * @returns {Promise<Array>} All collected leads
   */
  async getAllLeads(criteria, totalLimit = 100) {
    const allLeads = [];
    let currentPage = 1;
    const perPage = 200; // Max per request

    try {
      while (allLeads.length < totalLimit) {
        const remaining = totalLimit - allLeads.length;
        const pageSize = Math.min(remaining, 100); // Apollo max is 100

        const response = await this.client.post('/mixed_people/search', {
          ...criteria,
          page: currentPage,
          per_page: pageSize
        });

        if (!response.data?.people?.length) {
          console.log(`📄 No more leads found at page ${currentPage}`);
          break;
        }

        allLeads.push(...response.data.people);
        console.log(`📄 Page ${currentPage}: ${response.data.people.length} leads (total: ${allLeads.length})`);

        // Check if we've reached the end
        if (response.data.people.length < pageSize) {
          break;
        }

        currentPage++;
        
        // Rate limiting - Apollo has limits
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      console.log(`🎯 Total leads collected: ${allLeads.length}`);
      return allLeads.slice(0, totalLimit);

    } catch (error) {
      console.error('❌ Error in getAllLeads:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * ENHANCED Weekly batch job with Instantly deduplication AND pagination
   * This now checks Instantly BEFORE enriching leads to save Apollo credits
   * AND can pull from multiple Apollo pages to find new leads
   */
  async getWeeklyLeadBatch(batchSize = 100, maxPages = 5) {
    console.log('🎯 Starting WellBuiltWeb weekly lead pull with Instantly deduplication + pagination...');
    console.log(`📅 Target: ${batchSize} high-quality AI receptionist prospects`);
    console.log(`📄 Will check up to ${maxPages} Apollo pages for new leads`);
    
    const campaignId = process.env.INSTANTLY_CAMPAIGN_ID; // Get from environment
    
    try {
      let allNewLeads = [];
      let currentPage = 1;
      let totalProcessed = 0;
      let totalDuplicates = 0;

      // Step 1: Get existing leads from Instantly ONCE (don't repeat this for each page)
      let existingEmails = new Set();
      if (this.instantly) {
        console.log('🔍 Getting existing Instantly leads for deduplication...');
        existingEmails = await this.instantly.getExistingLeads(campaignId);
        console.log(`🔄 Will filter against ${existingEmails.size} existing emails`);
      }

      // Step 2: Paginate through Apollo until we have enough new leads
      while (allNewLeads.length < batchSize && currentPage <= maxPages) {
        console.log(`\n📄 === APOLLO PAGE ${currentPage} ===`);
        
        // Pull from current Apollo page
        const searchBuffer = Math.min(200, batchSize * 2); // Pull 2x target per page
        console.log(`🔍 Pulling ${searchBuffer} leads from Apollo page ${currentPage}...`);
        
        const searchBody = ApolloLeadPuller.getWellBuiltWebSearchBody(currentPage, searchBuffer);
        const response = await this.client.post('/mixed_people/search', searchBody);
        
        if (!response.data?.people?.length) {
          console.log(`📄 No more leads found on page ${currentPage} - reached end of results`);
          break;
        }

        let pageLeads = response.data.people;
        console.log(`✅ Raw leads from page ${currentPage}: ${pageLeads.length}`);
        totalProcessed += pageLeads.length;

        // Apply quality filters
        pageLeads = this.filterWellBuiltWebLeads(pageLeads);
        console.log(`🎯 Qualified leads after filtering: ${pageLeads.length}`);

        // Filter duplicates against Instantly
        const pageNewLeads = pageLeads.filter(lead => {
          const email = lead.email?.toLowerCase();
          return email && !existingEmails.has(email);
        });

        const pageDuplicates = pageLeads.length - pageNewLeads.length;
        totalDuplicates += pageDuplicates;

        if (pageDuplicates > 0) {
          console.log(`🔄 Page ${currentPage}: Removed ${pageDuplicates} duplicates`);
        }
        console.log(`🆕 Page ${currentPage}: ${pageNewLeads.length} new leads found`);

        // Add new leads to our collection
        allNewLeads.push(...pageNewLeads);

        // Add these new emails to our existing set for future page deduplication
        pageNewLeads.forEach(lead => {
          if (lead.email) {
            existingEmails.add(lead.email.toLowerCase());
          }
        });

        console.log(`📊 Running total: ${allNewLeads.length}/${batchSize} new leads collected`);

        // If we have enough, stop here
        if (allNewLeads.length >= batchSize) {
          console.log(`🎯 Target reached! Collected ${allNewLeads.length} new leads`);
          break;
        }

        // If this page had very few new leads, we might be hitting saturation
        if (pageNewLeads.length < 5) {
          console.log(`⚠️ Only ${pageNewLeads.length} new leads on page ${currentPage} - market might be saturated`);
        }

        currentPage++;
        
        // Rate limiting between pages
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Summary of pagination results
      console.log(`\n📊 PAGINATION SUMMARY:`);
      console.log(`📄 Pages checked: ${currentPage - 1} of ${maxPages} max`);
      console.log(`📋 Total leads processed: ${totalProcessed}`);
      console.log(`🔄 Total duplicates filtered: ${totalDuplicates}`);
      console.log(`🆕 New leads found: ${allNewLeads.length}`);
      console.log(`💰 Apollo credits saved by avoiding duplicates: ${totalDuplicates}`);

      if (allNewLeads.length === 0) {
        console.log('\n⚠️ No new leads found across all pages!');
        console.log('💡 Your ideal customer criteria might be fully saturated');
        console.log('💡 Consider expanding to new markets or adjusting criteria');
        return [];
      }

      // Take only what we need for enrichment
      const leadsToEnrich = allNewLeads.slice(0, batchSize);
      if (leadsToEnrich.length < allNewLeads.length) {
        console.log(`📊 Taking first ${leadsToEnrich.length} leads for enrichment (${allNewLeads.length - leadsToEnrich.length} saved for next time)`);
      }

      // Step 3: Enrich leads to get real email addresses (only for new leads!)
      console.log('\n🔓 ENRICHING LEADS FOR REAL EMAIL ADDRESSES:');
      const enrichedLeads = await this.enrichLeadsWithEmails(leadsToEnrich);

      if (enrichedLeads.length === 0) {
        console.log('⚠️ No leads were successfully enriched with real emails');
        return [];
      }

      // Step 4: Final deduplication check (in case enrichment revealed different emails)
      let finalLeads = enrichedLeads;
      if (this.instantly) {
        const finalExistingEmails = await this.instantly.getExistingLeads(campaignId);
        finalLeads = enrichedLeads.filter(lead => {
          const email = lead.email?.toLowerCase();
          return email && !finalExistingEmails.has(email);
        });

        const enrichmentDuplicates = enrichedLeads.length - finalLeads.length;
        if (enrichmentDuplicates > 0) {
          console.log(`🔄 Removed ${enrichmentDuplicates} additional duplicates found after enrichment`);
        }
      }

      // Log summary for weekly report with pagination stats
      this.logWeeklyBatchSummary(finalLeads, totalDuplicates, currentPage - 1);
      
      return finalLeads;

    } catch (error) {
      console.error('❌ Weekly batch pull failed:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Enrich leads to get real email addresses (uses Apollo credits)
   * @param {Array} leads - Raw leads from search
   * @returns {Promise<Array>} Enriched leads with real emails
   */
  async enrichLeadsWithEmails(leads) {
    console.log(`🔓 Enriching ${leads.length} leads to unlock real email addresses...`);
    console.log(`💳 This will use Apollo credits (you have 2,500 available)`);
    
    const enrichedLeads = [];
    let creditsUsed = 0;
    let enrichmentFailures = 0;

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      console.log(`📧 Enriching ${i + 1}/${leads.length}: ${lead.first_name} ${lead.last_name} at ${lead.organization?.name}`);
      
      try {
        // Use Apollo's People Enrichment endpoint to get real email
        const enrichResponse = await this.client.post('/people/match', {
          first_name: lead.first_name,
          last_name: lead.last_name,
          organization_name: lead.organization?.name,
          domain: lead.organization?.website_url,
          // Use existing Apollo ID if available for better matching
          id: lead.id
        });

        if (enrichResponse.data && enrichResponse.data.person && enrichResponse.data.person.email) {
          // Successfully enriched - got real email
          const enrichedLead = {
            ...lead,
            email: enrichResponse.data.person.email,
            email_status: enrichResponse.data.person.email_status,
            phone_numbers: enrichResponse.data.person.phone_numbers || lead.phone_numbers,
            enriched: true,
            credits_used: 1
          };
          
          enrichedLeads.push(enrichedLead);
          creditsUsed++;
          console.log(`✅ Real email found: ${enrichResponse.data.person.email}`);
        } else {
          // Enrichment didn't return email
          console.log(`⚠️ No email found during enrichment`);
          enrichmentFailures++;
        }

        // Rate limiting to avoid API issues
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.error(`❌ Enrichment failed for ${lead.first_name} ${lead.last_name}:`, error.response?.data || error.message);
        enrichmentFailures++;
      }
    }

    console.log(`\n🔓 ENRICHMENT SUMMARY:`);
    console.log(`✅ Successfully enriched: ${enrichedLeads.length} leads`);
    console.log(`❌ Enrichment failures: ${enrichmentFailures}`);
    console.log(`💳 Apollo credits used: ${creditsUsed}`);
    console.log(`💰 Remaining credits: ~${2500 - creditsUsed}`);
    console.log(`📧 Success rate: ${((enrichedLeads.length / leads.length) * 100).toFixed(1)}%`);

    return enrichedLeads;
  }

  /**
   * WellBuiltWeb specific lead quality filters
   */
  filterWellBuiltWebLeads(leads) {
    return leads.filter(lead => {
      // Skip email verification here since we'll enrich them later
      // Must have name and company for enrichment
      if (!lead.first_name || !lead.last_name || !lead.organization?.name) {
        return false;
      }

      // Company size validation (5-50 employees) - only if data exists
      const empCount = lead.organization?.estimated_num_employees;
      if (empCount && (empCount < 5 || empCount > 50)) {
        return false;
      }

      // Exclude organizations that don't need AI receptionists
      const companyName = (lead.organization?.name || '').toLowerCase();
      const excludeCompanyTypes = [
        // Direct competitors
        'answering', 'call center', 'virtual assistant', 'receptionist service',
        // Organizations/associations (not target businesses)
        'association', 'chamber of commerce', 'trade association', 'nonprofit',
        'foundation', 'institute', 'federation', 'alliance', 'council',
        // Government/large entities
        'government', 'municipal', 'state of', 'city of', 'parish of',
        'university', 'college', 'school district', 'hospital system',
        // Large corporate/tech
        'corporation', 'enterprises', 'technologies', 'solutions inc',
        // Complex care services (high liability/implementation complexity)
        'care services', 'healthcare', 'home care', 'senior care', 'care',
        // Manufacturing/industrial (too complex for AI receptionist)
        'manufacturing', 'industrial', 'fabrication', 'production',
        // Specialized/hazardous cleaning (requires human expertise)
        'biohazard', 'trauma cleaning', 'death cleaning', 'crime scene', 'hazmat'
      ];
      
      if (excludeCompanyTypes.some(type => companyName.includes(type))) {
        return false;
      }

      return true;
    });
  }

  /**
   * Enhanced logging with pagination and duplicate prevention stats
   */
  logWeeklyBatchSummary(leads, duplicatesFiltered = 0, pagesChecked = 1) {
    const industries = {};
    const titles = {};
    const states = {};

    leads.forEach(lead => {
      // Industry breakdown
      const industry = lead.organization?.industry || 'Unknown';
      industries[industry] = (industries[industry] || 0) + 1;

      // Title breakdown  
      const title = lead.title || 'Unknown';
      titles[title] = (titles[title] || 0) + 1;

      // State breakdown
      const state = lead.state || 'Unknown';
      states[state] = (states[state] || 0) + 1;
    });

    console.log('\n📊 ENHANCED WEEKLY BATCH SUMMARY WITH PAGINATION:');
    console.log(`🎯 NEW Qualified Leads (duplicates avoided): ${leads.length}`);
    console.log(`📄 Apollo pages checked: ${pagesChecked}`);
    console.log(`🔄 Duplicates filtered out: ${duplicatesFiltered}`);
    console.log(`💰 Apollo credits saved by avoiding duplicates: ${duplicatesFiltered}`);
    console.log('\nTop Industries:', Object.entries(industries).slice(0, 5));
    console.log('\nTop Titles:', Object.entries(titles).slice(0, 5));
    console.log('\nTop States:', Object.entries(states).slice(0, 5));
    console.log('-------------------\n');
  }

  /**
   * WellBuiltWeb AI Receptionist Lead Specification
   * Target: Small businesses (5-50 employees) needing phone coverage
   */
  static getWellBuiltWebCriteria() {
    return {
      // FIRMOGRAPHICS
      organization_num_employees_ranges: ["5,10", "11,50"],
      organization_locations: ["Louisiana"],

      // INDUSTRY TARGETING - Use precise SIC codes instead of keywords
      organization_sic_codes: [
        "7538", // Auto repair shops and services
        "1711", // Plumbing, heating, air-conditioning contractors  
        "1731", // Electrical contractors
        "1761", // Roofing, siding, and sheet metal contractors
        "7231", // Beauty salons
        "7297", // Massage parlors and spas
        "8021", // Dental offices and clinics
        "8111"  // Legal services (law firms)
      ],

      // CONTACT LEVEL TARGETING
      person_titles: [
        "Owner", "CEO", "Founder", "President",
        "Office Manager", "Operations Manager", "Practice Manager", 
        "General Manager", "Business Manager",
        "Practice Administrator", "Clinic Manager", "Office Administrator"
      ],

      person_seniorities: [
        "c_suite", "vp", "director", "manager", "owner"
      ],

      // DATA QUALITY REQUIREMENTS
      email_status: ["verified"],
      phone_status: ["verified"],
      
      // LOCATION SPECIFICITY
      person_locations: ["Louisiana", "Lafayette, Louisiana"],

      // Additional filters for lead quality
      prospected_by_current_team: ["no"]
    };
  }

  /**
   * Get the complete Apollo API request body for WellBuiltWeb leads
   * @param {number} page - Page number for pagination
   * @param {number} perPage - Leads per page (max 100 for Apollo)
   * @returns {Object} Complete Apollo API request body
   */
  static getWellBuiltWebSearchBody(page = 1, perPage = 100) {
    const criteria = ApolloLeadPuller.getWellBuiltWebCriteria();
    
    return {
      // Pagination - Apollo max is 100 per page
      page: page,
      per_page: Math.min(perPage, 100),
      
      // Core search criteria
      ...criteria,
      
      // Additional filters for lead quality
      prospected_by_current_team: ["no"] // Haven't been contacted by us
      
      // Note: Removed sort_by_field as Apollo doesn't support "relevance"
      // Results will be returned in Apollo's default order
    };
  }
}

// Enhanced WellBuiltWeb Weekly Lead Pull with Instantly Integration + Pagination
export async function runWellBuiltWebBatch(maxPages = 5) {
  const apollo = new ApolloLeadPuller(
    process.env.APOLLO_API_KEY,
    process.env.INSTANTLY_API_KEY  // Pass Instantly API key for deduplication
  );
  
  try {
    console.log('🚀 WellBuiltWeb AI Receptionist Lead Pull Starting...');
    console.log('🔄 With Instantly duplicate prevention + Apollo pagination enabled!');
    console.log('📍 Louisiana Focus: Building local relationships around Lafayette');
    console.log('📅 Target: Small businesses needing phone coverage (5-50 employees)');
    console.log(`📄 Will check up to ${maxPages} Apollo pages for fresh leads`);
    
    // Get this week's batch of NEW leads with pagination (not in Instantly)
    const leads = await apollo.getWeeklyLeadBatch(100, maxPages);
    
    if (leads.length === 0) {
      console.log('⚠️ No new qualified leads found across all pages checked');
      console.log('💡 Your ideal customer criteria are fully saturated');
      console.log('💡 Consider expanding to new markets or adjusting targeting criteria');
      return { leads: [], message: 'No new leads found - market saturated' };
    }

    // Transform for Clay enrichment or direct use
    const enrichmentReady = leads.map(lead => ({
      // Core contact info
      firstName: lead.first_name,
      lastName: lead.last_name,
      email: lead.email,
      phone: lead.phone_numbers?.[0]?.raw_number,
      title: lead.title,
      
      // Company info
      companyName: lead.organization?.name,
      companySize: lead.organization?.estimated_num_employees,
      industry: lead.organization?.industry,
      website: lead.organization?.website_url,
      
      // Location
      city: lead.city,
      state: lead.state,
      country: lead.country,
      
      // Apollo metadata
      apolloId: lead.id,
      linkedinUrl: lead.linkedin_url,
      
      // Lead scoring data
      intentScore: lead.buyer_intent_strength_score || 0,
      lastActivity: lead.last_activity_date,
      
      // For tracking
      pullDate: new Date().toISOString(),
      leadSource: 'apollo_weekly_batch_paginated'
    }));

    console.log(`✅ ${enrichmentReady.length} NEW leads ready for outreach (found via pagination + deduplication!)`);
    return { 
      leads: enrichmentReady,
      message: `Found ${enrichmentReady.length} new leads via pagination`
    };

  } catch (error) {
    console.error('❌ WellBuiltWeb batch failed:', error);
    throw error;
  }
}

/**
 * Helper function to find your Instantly campaign IDs
 * Run this first to get your campaign ID for the environment variables
 */
export async function findInstantlyCampaigns() {
  try {
    const instantly = new InstantlyManager(process.env.INSTANTLY_API_KEY);
    return await instantly.showMyCampaigns();
  } catch (error) {
    console.error('❌ Failed to fetch campaigns:', error.message);
    return [];
  }
}

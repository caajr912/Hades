import axios from 'axios';

export class ApolloLeadPuller {
  constructor(apiKey) {
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
   * WellBuiltWeb AI Receptionist Lead Specification
   * Target: Small businesses (5-50 employees) needing phone coverage
   */
  static getWellBuiltWebCriteria() {
    return {
      // FIRMOGRAPHICS
      organization_num_employees_ranges: ["5,10", "11,50"], // 5-50 employees
      organization_locations: ["Louisiana"], // Louisiana only
      
      // TOP TARGET INDUSTRIES for AI receptionist
      organization_industry_tag_ids: [
        "5567cd4d74686d4c5916256d", // Professional Services
        "5567cd4e74686d6578220242", // Healthcare & Medical
        "5567cd4d74686d4c59162563", // Legal Services
        "5567cd4e74686d5f94220235", // Home Services/Construction
        "5567cd4d74686d4c59162567"  // Retail
      ],

      // REVENUE FILTER (optional - under $10M) - Removed as format may be incorrect
      // organization_annual_revenue_ranges: ["$0", "$1M", "$10M"],

      // CONTACT LEVEL TARGETING
      person_titles: [
        // Primary decision makers
        "Owner", "CEO", "Founder", "President",
        // Operations focused
        "Office Manager", "Operations Manager", "Practice Manager", 
        "General Manager", "Business Manager",
        // Medical/Professional specific
        "Practice Administrator", "Clinic Manager", "Office Administrator"
      ],

      person_seniorities: [
        "c_suite", "vp", "director", "manager", "owner"
      ],

      // TECHNOGRAPHIC EXCLUSIONS (companies already using advanced call tools)
      organization_not_technologies: [
        "CallRail", "RingCentral", "Invoca", "DialogTech", 
        "Marchex", "Convirza", "ResponseTap", "Infinity",
        "Five9", "Genesys", "Twilio Flex"
      ],

      // INTENT DATA (removed - may not be available for small markets)
      // buyer_intent_strength_score: 50,
      // intent_topics: [...],

      // DATA QUALITY REQUIREMENTS
      email_status: ["verified"],
      phone_status: ["verified"],
      
      // LOCATION SPECIFICITY (Louisiana focus, Lafayette area priority)
      person_locations: ["Louisiana", "Lafayette, Louisiana"],
      organization_locations: ["Louisiana"],
      
      // EXCLUDE COMPETITORS
      organization_not_keywords: [
        "answering service", "call center", "virtual assistant service",
        "receptionist service", "AI phone", "chatbot company"
      ]
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

  /**
   * Weekly batch job specification for WellBuiltWeb
   * Runs every Sunday at 8 PM Central Time
   */
  async getWeeklyLeadBatch(batchSize = 100) {
    console.log('🎯 Starting WellBuiltWeb weekly lead pull...');
    console.log(`📅 Target: ${batchSize} high-quality AI receptionist prospects`);
    
    try {
      const searchBody = ApolloLeadPuller.getWellBuiltWebSearchBody(1, batchSize);
      
      const response = await this.client.post('/mixed_people/search', searchBody);
      
      if (!response.data?.people?.length) {
        console.log('⚠️ No leads found with current criteria');
        return [];
      }

      let leads = response.data.people;
      console.log(`✅ Raw leads pulled: ${leads.length}`);

      // Apply WellBuiltWeb specific quality filters
      leads = this.filterWellBuiltWebLeads(leads);
      console.log(`🎯 Qualified leads after filtering: ${leads.length}`);

      // Log summary for weekly report
      this.logWeeklyBatchSummary(leads);
      
      return leads;

    } catch (error) {
      console.error('❌ Weekly batch pull failed:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * WellBuiltWeb specific lead quality filters
   */
  filterWellBuiltWebLeads(leads) {
    return leads.filter(lead => {
      // Must have verified email
      if (!lead.email || lead.email_status !== 'verified') {
        return false;
      }

      // Must have phone number
      if (!lead.phone_numbers?.length) {
        return false;
      }

      // Filter out generic emails
      const email = lead.email.toLowerCase();
      const genericEmails = ['info@', 'contact@', 'hello@', 'support@', 'admin@', 'sales@'];
      if (genericEmails.some(generic => email.includes(generic))) {
        return false;
      }

      // Must be decision maker level
      const title = (lead.title || '').toLowerCase();
      const decisionMakerKeywords = [
        'owner', 'ceo', 'founder', 'president', 'manager', 'director', 
        'administrator', 'practice', 'office', 'operations'
      ];
      
      if (!decisionMakerKeywords.some(keyword => title.includes(keyword))) {
        return false;
      }

      // Company size validation (5-50 employees)
      const empCount = lead.organization?.estimated_num_employees;
      if (empCount && (empCount < 5 || empCount > 50)) {
        return false;
      }

      // Exclude if company name suggests they're already a phone service
      const companyName = (lead.organization?.name || '').toLowerCase();
      const excludeCompanyTypes = [
        'answering', 'call center', 'virtual assistant', 'receptionist service'
      ];
      if (excludeCompanyTypes.some(type => companyName.includes(type))) {
        return false;
      }

      return true;
    });
  }

  /**
   * Log summary of weekly batch for reporting
   */
  logWeeklyBatchSummary(leads) {
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

    console.log('\n📊 WEEKLY BATCH SUMMARY:');
    console.log(`Total Qualified Leads: ${leads.length}`);
    console.log('\nTop Industries:', Object.entries(industries).slice(0, 5));
    console.log('\nTop Titles:', Object.entries(titles).slice(0, 5));
    console.log('\nTop States:', Object.entries(states).slice(0, 5));
    console.log('-------------------\n');
  }
}

// WellBuiltWeb Weekly Lead Pull - Example usage
export async function runWellBuiltWebBatch() {
  const apollo = new ApolloLeadPuller(process.env.APOLLO_API_KEY);
  
  try {
    console.log('🚀 WellBuiltWeb AI Receptionist Lead Pull Starting...');
    console.log('📍 Louisiana Focus: Building local relationships around Lafayette');
    console.log('📅 Target: Small businesses needing phone coverage (5-50 employees)');
    
    // Get this week's batch of leads
    const leads = await apollo.getWeeklyLeadBatch(100);
    
    if (leads.length === 0) {
      console.log('⚠️ No qualified leads found this week');
      return [];
    }

    // Transform for Clay enrichment
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
      leadSource: 'apollo_weekly_batch'
    }));

    console.log(`✅ ${enrichmentReady.length} leads ready for Clay enrichment`);
    return enrichmentReady;

  } catch (error) {
    console.error('❌ WellBuiltWeb batch failed:', error);
    throw error;
  }
}

/**
 * Apollo API Authentication Setup
 * Add this to your .env file:
 * APOLLO_API_KEY=your_apollo_api_key_here
 * 
 * Cron Schedule for Railway:
 * Every Sunday at 8 PM Central: "0 20 * * 0"
 */

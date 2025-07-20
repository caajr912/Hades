import axios from 'axios';

export class ClayEnricher {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'https://api.clay.com/v1';
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Enrich a single lead with additional data from Clay
   * @param {Object} lead - Lead object from Apollo
   * @returns {Promise<Object>} Enriched lead with additional data
   */
  async enrichLead(lead) {
    try {
      console.log(`🔍 Enriching ${lead.firstName} ${lead.lastName} at ${lead.companyName}`);

      // Clay person enrichment
      const personData = await this.enrichPerson({
        email: lead.email,
        firstName: lead.firstName,
        lastName: lead.lastName,
        companyName: lead.companyName,
        linkedinUrl: lead.linkedinUrl
      });

      // Clay company enrichment
      const companyData = await this.enrichCompany({
        companyName: lead.companyName,
        website: lead.website,
        location: `${lead.city}, ${lead.state}`
      });

      // Combine all data
      const enrichedLead = {
        ...lead,
        
        // Enhanced person data
        personalEmail: personData.personalEmail,
        phoneNumber: personData.phoneNumber || lead.phone,
        linkedinProfile: personData.linkedinProfile,
        twitterProfile: personData.twitterProfile,
        jobTitle: personData.jobTitle || lead.title,
        experience: personData.experience,
        education: personData.education,
        
        // Enhanced company data
        companyDescription: companyData.description,
        companyEmployeeCount: companyData.employeeCount || lead.companySize,
        companyRevenue: companyData.revenue,
        companyIndustry: companyData.industry || lead.industry,
        companyFounded: companyData.founded,
        companyTechnologies: companyData.technologies,
        companySocialProfiles: companyData.socialProfiles,
        companyFunding: companyData.funding,
        
        // Enrichment metadata
        enrichedAt: new Date().toISOString(),
        enrichmentSource: 'clay_api',
        clayPersonId: personData.clayId,
        clayCompanyId: companyData.clayId
      };

      console.log(`✅ Enriched ${lead.firstName} ${lead.lastName} successfully`);
      return enrichedLead;

    } catch (error) {
      console.error(`❌ Failed to enrich ${lead.firstName} ${lead.lastName}:`, error.message);
      
      // Return original lead with enrichment failure noted
      return {
        ...lead,
        enrichmentFailed: true,
        enrichmentError: error.message,
        enrichedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Enrich person data using Clay's person enrichment
   * @param {Object} personInfo - Basic person information
   * @returns {Promise<Object>} Enriched person data
   */
  async enrichPerson(personInfo) {
    try {
      const response = await this.client.post('/people/enrich', {
        email: personInfo.email,
        first_name: personInfo.firstName,
        last_name: personInfo.lastName,
        company_name: personInfo.companyName,
        linkedin_url: personInfo.linkedinUrl,
        
        // Request specific data points
        include: [
          'personal_email',
          'phone_number',
          'linkedin_profile',
          'twitter_profile', 
          'job_title',
          'experience',
          'education'
        ]
      });

      if (response.data && response.data.person) {
        const person = response.data.person;
        
        return {
          clayId: person.id,
          personalEmail: person.personal_email,
          phoneNumber: person.phone_number,
          linkedinProfile: person.linkedin_profile,
          twitterProfile: person.twitter_profile,
          jobTitle: person.job_title,
          experience: person.experience,
          education: person.education
        };
      }

      return {};
    } catch (error) {
      console.error('❌ Clay person enrichment failed:', error.response?.data || error.message);
      return {};
    }
  }

  /**
   * Enrich company data using Clay's company enrichment
   * @param {Object} companyInfo - Basic company information
   * @returns {Promise<Object>} Enriched company data
   */
  async enrichCompany(companyInfo) {
    try {
      const response = await this.client.post('/companies/enrich', {
        company_name: companyInfo.companyName,
        website: companyInfo.website,
        location: companyInfo.location,
        
        // Request specific data points
        include: [
          'description',
          'employee_count',
          'revenue',
          'industry',
          'founded_year',
          'technologies',
          'social_profiles',
          'funding'
        ]
      });

      if (response.data && response.data.company) {
        const company = response.data.company;
        
        return {
          clayId: company.id,
          description: company.description,
          employeeCount: company.employee_count,
          revenue: company.revenue,
          industry: company.industry,
          founded: company.founded_year,
          technologies: company.technologies,
          socialProfiles: company.social_profiles,
          funding: company.funding
        };
      }

      return {};
    } catch (error) {
      console.error('❌ Clay company enrichment failed:', error.response?.data || error.message);
      return {};
    }
  }

  /**
   * Batch enrich multiple leads with rate limiting
   * @param {Array} leads - Array of leads from Apollo
   * @param {number} batchSize - Number of leads to process in parallel
   * @param {number} delayMs - Delay between batches in milliseconds
   * @returns {Promise<Array>} Array of enriched leads
   */
  async batchEnrichLeads(leads, batchSize = 5, delayMs = 2000) {
    console.log(`🎯 Starting Clay enrichment for ${leads.length} leads...`);
    console.log(`📊 Processing in batches of ${batchSize} with ${delayMs}ms delay`);
    
    const enrichedLeads = [];
    const failedLeads = [];

    for (let i = 0; i < leads.length; i += batchSize) {
      const batch = leads.slice(i, i + batchSize);
      console.log(`\n📦 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(leads.length/batchSize)}`);
      
      try {
        // Process batch in parallel
        const batchPromises = batch.map(lead => this.enrichLead(lead));
        const batchResults = await Promise.allSettled(batchPromises);
        
        // Separate successful and failed enrichments
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            const enrichedLead = result.value;
            if (enrichedLead.enrichmentFailed) {
              failedLeads.push(enrichedLead);
            } else {
              enrichedLeads.push(enrichedLead);
            }
          } else {
            failedLeads.push({
              ...batch[index],
              enrichmentFailed: true,
              enrichmentError: result.reason.message,
              enrichedAt: new Date().toISOString()
            });
          }
        });

        // Rate limiting delay between batches
        if (i + batchSize < leads.length) {
          console.log(`⏳ Waiting ${delayMs}ms before next batch...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }

      } catch (error) {
        console.error(`❌ Batch ${Math.floor(i/batchSize) + 1} failed:`, error.message);
        
        // Add failed batch to failed leads
        batch.forEach(lead => {
          failedLeads.push({
            ...lead,
            enrichmentFailed: true,
            enrichmentError: error.message,
            enrichedAt: new Date().toISOString()
          });
        });
      }
    }

    // Log summary
    console.log(`\n📊 CLAY ENRICHMENT SUMMARY:`);
    console.log(`✅ Successfully enriched: ${enrichedLeads.length}`);
    console.log(`❌ Failed enrichments: ${failedLeads.length}`);
    console.log(`📈 Success rate: ${((enrichedLeads.length / leads.length) * 100).toFixed(1)}%`);

    // Return all leads (successful enrichments first)
    return [...enrichedLeads, ...failedLeads];
  }

  /**
   * WellBuiltWeb specific enrichment workflow
   * Focus on data points most useful for AI receptionist prospects
   */
  async enrichWellBuiltWebLeads(leads) {
    console.log('🏗️ WellBuiltWeb Clay Enrichment Starting...');
    console.log(`📊 Enriching ${leads.length} Louisiana business prospects`);
    
    try {
      // Use conservative rate limiting for API stability
      const enrichedLeads = await this.batchEnrichLeads(leads, 3, 3000);
      
      // Filter and enhance for WellBuiltWeb specific use case
      const wellBuiltWebReady = enrichedLeads.map(lead => ({
        ...lead,
        
        // AI Receptionist specific scoring
        aiReceptionistScore: this.calculateReceptionistScore(lead),
        
        // Key talking points for outreach
        talkingPoints: this.generateTalkingPoints(lead),
        
        // Implementation complexity assessment
        implementationComplexity: this.assessImplementationComplexity(lead)
      }));

      console.log(`✅ WellBuiltWeb enrichment complete: ${wellBuiltWebReady.length} leads ready for outreach`);
      return wellBuiltWebReady;

    } catch (error) {
      console.error('❌ WellBuiltWeb enrichment failed:', error);
      throw error;
    }
  }

  /**
   * Calculate how good a prospect is for AI receptionist services
   * @param {Object} lead - Enriched lead data
   * @returns {number} Score from 0-100
   */
  calculateReceptionistScore(lead) {
    let score = 50; // Base score

    // Company size factors (sweet spot: 5-30 employees)
    const empCount = lead.companyEmployeeCount || lead.companySize || 0;
    if (empCount >= 5 && empCount <= 15) score += 20;
    else if (empCount >= 16 && empCount <= 30) score += 15;
    else if (empCount >= 31 && empCount <= 50) score += 10;

    // Industry factors (our target SIC codes)
    const targetIndustries = ['auto repair', 'hvac', 'plumbing', 'electrical', 'roofing', 'salon', 'spa', 'dental', 'legal'];
    if (targetIndustries.some(industry => 
      (lead.companyIndustry || '').toLowerCase().includes(industry) ||
      (lead.companyDescription || '').toLowerCase().includes(industry)
    )) {
      score += 15;
    }

    // Technology factors (less tech = higher score for basic AI receptionist)
    if (!lead.companyTechnologies || lead.companyTechnologies.length < 5) {
      score += 10;
    }

    // Title factors (decision makers)
    const decisionMakerTitles = ['owner', 'ceo', 'president', 'founder', 'office manager'];
    if (decisionMakerTitles.some(title => 
      (lead.jobTitle || lead.title || '').toLowerCase().includes(title)
    )) {
      score += 15;
    }

    return Math.min(Math.max(score, 0), 100);
  }

  /**
   * Generate personalized talking points for outreach
   * @param {Object} lead - Enriched lead data
   * @returns {Array} Array of talking point strings
   */
  generateTalkingPoints(lead) {
    const points = [];

    // Company size talking point
    const empCount = lead.companyEmployeeCount || lead.companySize;
    if (empCount && empCount <= 20) {
      points.push(`Small team of ${empCount} - perfect size where everyone wears multiple hats and phone coverage is crucial`);
    }

    // Industry-specific talking points
    const industry = (lead.companyIndustry || '').toLowerCase();
    if (industry.includes('auto') || industry.includes('repair')) {
      points.push('Auto repair shops often miss calls when mechanics are under the hood - AI receptionist captures every opportunity');
    } else if (industry.includes('hvac') || industry.includes('plumb') || industry.includes('electric')) {
      points.push('Field technicians can\'t answer phones while on job sites - AI ensures no emergency call goes unanswered');
    } else if (industry.includes('salon') || industry.includes('spa')) {
      points.push('Stylists can\'t break away from clients to answer phones - AI handles booking while you focus on customers');
    } else if (industry.includes('dental')) {
      points.push('Dental practices have high appointment volume - AI can handle scheduling while staff focuses on patient care');
    } else if (industry.includes('legal')) {
      points.push('Law firms need professional phone presence - AI ensures every potential client gets immediate attention');
    }

    // Technology sophistication talking point
    if (!lead.companyTechnologies || lead.companyTechnologies.length < 3) {
      points.push('Simple tech setup means easy AI receptionist integration - no complex systems to worry about');
    }

    // Location talking point (Louisiana focus)
    if (lead.city) {
      points.push(`Local ${lead.city} business - we understand Louisiana market and can meet in person for setup`);
    }

    return points.slice(0, 3); // Return top 3 most relevant points
  }

  /**
   * Assess how complex implementation would be
   * @param {Object} lead - Enriched lead data
   * @returns {string} 'Low', 'Medium', or 'High'
   */
  assessImplementationComplexity(lead) {
    let complexityScore = 0;

    // Company size factor
    const empCount = lead.companyEmployeeCount || lead.companySize || 0;
    if (empCount > 30) complexityScore += 1;
    if (empCount > 50) complexityScore += 1;

    // Technology factor
    if (lead.companyTechnologies && lead.companyTechnologies.length > 10) {
      complexityScore += 1;
    }

    // Industry factor
    const complexIndustries = ['healthcare', 'medical', 'hospital', 'emergency'];
    if (complexIndustries.some(industry => 
      (lead.companyIndustry || '').toLowerCase().includes(industry)
    )) {
      complexityScore += 2;
    }

    if (complexityScore === 0) return 'Low';
    if (complexityScore <= 2) return 'Medium';
    return 'High';
  }
}

// WellBuiltWeb Clay Enrichment - Example usage
export async function runWellBuiltWebEnrichment(apolloLeads) {
  const clay = new ClayEnricher(process.env.CLAY_API_KEY);
  
  try {
    console.log('🎨 Clay Enrichment Starting...');
    console.log(`📊 Processing ${apolloLeads.length} Apollo leads through Clay`);
    
    // Enrich leads with Clay data
    const enrichedLeads = await clay.enrichWellBuiltWebLeads(apolloLeads);
    
    // Log enrichment summary
    const successfulEnrichments = enrichedLeads.filter(lead => !lead.enrichmentFailed);
    const failedEnrichments = enrichedLeads.filter(lead => lead.enrichmentFailed);
    
    console.log(`\n🎯 CLAY ENRICHMENT COMPLETE:`);
    console.log(`✅ Successfully enriched: ${successfulEnrichments.length}`);
    console.log(`❌ Failed enrichments: ${failedEnrichments.length}`);
    console.log(`📈 Overall success rate: ${((successfulEnrichments.length / apolloLeads.length) * 100).toFixed(1)}%`);
    
    // Show sample enriched lead
    if (successfulEnrichments.length > 0) {
      const sample = successfulEnrichments[0];
      console.log(`\n📄 Sample enriched lead:`);
      console.log(`Name: ${sample.firstName} ${sample.lastName}`);
      console.log(`Company: ${sample.companyName} (${sample.companyEmployeeCount || 'Unknown'} employees)`);
      console.log(`AI Score: ${sample.aiReceptionistScore}/100`);
      console.log(`Implementation: ${sample.implementationComplexity} complexity`);
      console.log(`Talking Points: ${sample.talkingPoints.length} generated`);
    }
    
    return enrichedLeads;

  } catch (error) {
    console.error('❌ Clay enrichment failed:', error);
    throw error;
  }
}

/**
 * Clay API Authentication Setup
 * Add this to your .env file:
 * CLAY_API_KEY=your_clay_api_key_here
 */

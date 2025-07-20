import axios from 'axios';

export class InstantlyManager {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'https://api.instantly.ai';
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Add leads to an existing campaign (API V2)
   * @param {string} campaignId - Campaign ID to add leads to
   * @param {Array} leads - Array of lead objects
   * @returns {Promise<Object>} Addition results
   */
  async addLeadsToCampaign(campaignId, leads) {
    try {
      console.log(`📧 Adding ${leads.length} leads to Instantly campaign: ${campaignId}`);
      
      // In API V2, we create individual leads with campaign assignment
      let successCount = 0;
      let failCount = 0;
      const errors = [];

      for (const lead of leads) {
        try {
          const leadData = {
            campaign: campaignId,
            email: lead.email,
            first_name: lead.firstName,
            last_name: lead.lastName,
            company_name: lead.companyName,
            title: lead.title,
            phone: lead.phone,
            website: lead.website,
            city: lead.city,
            state: lead.state,
            industry: lead.industry,
            // Custom variables (API V2 format)
            custom_variables: {
              company_size: lead.companySize?.toString() || '',
              apollo_id: lead.apolloId || '',
              pull_date: lead.pullDate || new Date().toISOString()
            }
          };

          const response = await this.client.post('/api/v2/leads', leadData);
          
          if (response.data) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (leadError) {
          failCount++;
          errors.push(`${lead.email}: ${leadError.response?.data?.message || leadError.message}`);
        }

        // Small delay between individual lead creation
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log(`✅ Successfully added ${successCount}/${leads.length} leads to campaign`);
      
      if (errors.length > 0 && errors.length <= 5) {
        console.log('⚠️ Some errors:', errors.slice(0, 5));
      }

      return {
        success: true,
        added_count: successCount,
        failed_count: failCount,
        campaign_id: campaignId,
        total_processed: leads.length
      };

    } catch (error) {
      console.error('❌ Adding leads failed:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get campaign details (API V2)
   * @param {string} campaignId - Campaign ID
   * @returns {Promise<Object>} Campaign details
   */
  async getCampaignStats(campaignId) {
    try {
      const response = await this.client.get(`/api/v2/campaigns/${campaignId}`);

      if (response.data) {
        return response.data;
      }

      throw new Error('Failed to get campaign stats');
    } catch (error) {
      console.error('❌ Getting campaign stats failed:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * List all campaigns (API V2)
   * @returns {Promise<Array>} Array of campaigns
   */
  async listCampaigns() {
    try {
      const response = await this.client.get('/api/v2/campaigns');

      if (response.data) {
        return response.data;
      }

      return [];
    } catch (error) {
      console.error('❌ Listing campaigns failed:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Batch add leads with error handling and progress tracking
   * @param {string} campaignId - Campaign ID
   * @param {Array} leads - Array of leads
   * @param {number} batchSize - Number of leads to add per batch
   * @returns {Promise<Object>} Results summary
   */
  async batchAddLeads(campaignId, leads, batchSize = 25) {
    console.log(`📊 Processing ${leads.length} leads in batches of ${batchSize}`);
    
    const results = {
      total_leads: leads.length,
      successful_adds: 0,
      failed_adds: 0,
      batches_processed: 0,
      errors: []
    };

    for (let i = 0; i < leads.length; i += batchSize) {
      const batch = leads.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(leads.length / batchSize);
      
      console.log(`📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} leads)`);
      
      try {
        await this.addLeadsToCampaign(campaignId, batch);
        results.successful_adds += batch.length;
        results.batches_processed++;
        
        // Rate limiting - wait between batches
        if (i + batchSize < leads.length) {
          console.log('⏳ Waiting 2 seconds before next batch...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
      } catch (error) {
        console.error(`❌ Batch ${batchNumber} failed:`, error.message);
        results.failed_adds += batch.length;
        results.errors.push({
          batch: batchNumber,
          error: error.message,
          leads_count: batch.length
        });
      }
    }

    return results;
  }
}

// WellBuiltWeb Instantly Integration - Main function
export async function runWellBuiltWebOutreach(apolloLeads, campaignId = '5cf286eb-6adc-45cc-ba82-d5225f91c3a0') {
  const instantly = new InstantlyManager(process.env.INSTANTLY_API_KEY);
  
  try {
    console.log('📧 Instantly Email Campaign Starting...');
    console.log(`🎯 Campaign ID: ${campaignId}`);
    console.log(`📊 Processing ${apolloLeads.length} Louisiana AI receptionist prospects`);
    
    // Get current campaign stats (before adding new leads)
    console.log('\n📈 Getting current campaign statistics...');
    let initialStats = {};
    try {
      initialStats = await instantly.getCampaignStats(campaignId);
      console.log(`📊 Current campaign: ${initialStats.name || 'Unknown'}`);
    } catch (error) {
      console.log(`⚠️ Could not get initial stats: ${error.message}`);
    }
    
    // Add leads to campaign in batches
    console.log('\n📧 Adding new leads to campaign...');
    const results = await instantly.batchAddLeads(campaignId, apolloLeads, 25);
    
    // Get updated campaign stats
    console.log('\n📈 Getting updated campaign statistics...');
    let finalStats = {};
    try {
      finalStats = await instantly.getCampaignStats(campaignId);
    } catch (error) {
      console.log(`⚠️ Could not get final stats: ${error.message}`);
    }
    
    // Log comprehensive results
    console.log('\n🎯 INSTANTLY CAMPAIGN RESULTS:');
    console.log(`✅ Successfully added: ${results.successful_adds} leads`);
    console.log(`❌ Failed to add: ${results.failed_adds} leads`);
    console.log(`📦 Batches processed: ${results.batches_processed}`);
    console.log(`📧 Success rate: ${((results.successful_adds / results.total_leads) * 100).toFixed(1)}%`);
    
    if (results.errors.length > 0) {
      console.log('\n⚠️ BATCH ERRORS:');
      results.errors.forEach(error => {
        console.log(`- Batch ${error.batch}: ${error.error} (${error.leads_count} leads)`);
      });
    }

    // Sample lead added for verification
    if (results.successful_adds > 0) {
      console.log('\n📄 Sample lead added:');
      const sampleLead = apolloLeads[0];
      console.log(`Name: ${sampleLead.firstName} ${sampleLead.lastName}`);
      console.log(`Email: ${sampleLead.email}`);
      console.log(`Company: ${sampleLead.companyName} (${sampleLead.companySize || 'Unknown'} employees)`);
      console.log(`Location: ${sampleLead.city}, ${sampleLead.state}`);
    }

    console.log('\n🚀 EMAIL SEQUENCE WILL START AUTOMATICALLY');
    console.log('📧 Leads will begin receiving your AI receptionist campaign emails');
    console.log('📊 Monitor results in your Instantly dashboard');
    console.log('-------------------');

    return {
      campaign_id: campaignId,
      leads_processed: results.total_leads,
      leads_added: results.successful_adds,
      leads_failed: results.failed_adds,
      success_rate: ((results.successful_adds / results.total_leads) * 100).toFixed(1),
      campaign_total: finalStats.total_leads || 'Unknown'
    };

  } catch (error) {
    console.error('❌ Instantly integration failed:', error);
    throw error;
  }
}

/**
 * Mark leads as contacted after successful email campaign setup
 * This prevents duplicate outreach in future Apollo pulls
 */
export async function markLeadsAsContacted(successfulLeads) {
  try {
    // Simple in-memory tracking for now
    const contactedEmails = global.contactedEmails || new Set();
    
    successfulLeads.forEach(lead => {
      contactedEmails.add(lead.email.toLowerCase());
    });
    
    global.contactedEmails = contactedEmails;
    console.log(`📝 Marked ${successfulLeads.length} leads as contacted`);
    console.log(`📊 Total contacted leads tracked: ${contactedEmails.size}`);
    
  } catch (error) {
    console.error('⚠️ Failed to mark leads as contacted:', error.message);
  }
}

/**
 * Instantly API V2 Authentication Setup
 * Add this to your .env file:
 * INSTANTLY_API_KEY=your_instantly_api_v2_key_here
 * 
 * NOTE: You need a NEW API key for V2 - the old V1 keys won't work
 */

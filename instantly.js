import axios from 'axios';

export class InstantlyManager {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'https://api.instantly.ai/api/v1';
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Add leads to an existing campaign
   * @param {string} campaignId - Campaign ID to add leads to
   * @param {Array} leads - Array of lead objects
   * @returns {Promise<Object>} Addition results
   */
  async addLeadsToCampaign(campaignId, leads) {
    try {
      console.log(`📧 Adding ${leads.length} leads to Instantly campaign: ${campaignId}`);
      
      // Format leads for Instantly API
      const formattedLeads = leads.map(lead => ({
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
        // Custom fields for personalization
        company_size: lead.companySize?.toString() || '',
        apollo_id: lead.apolloId,
        pull_date: lead.pullDate
      }));

      const response = await this.client.post('/campaign/add_leads', {
        api_key: this.apiKey,
        campaign_id: campaignId,
        leads: formattedLeads
      });

      if (response.data && response.data.success) {
        console.log(`✅ Successfully added ${formattedLeads.length} leads to campaign`);
        return {
          success: true,
          added_count: formattedLeads.length,
          campaign_id: campaignId,
          leads_added: formattedLeads
        };
      }

      throw new Error(response.data?.message || 'Failed to add leads');
    } catch (error) {
      console.error('❌ Adding leads failed:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get campaign statistics
   * @param {string} campaignId - Campaign ID
   * @returns {Promise<Object>} Campaign stats
   */
  async getCampaignStats(campaignId) {
    try {
      const response = await this.client.get('/campaign/get', {
        params: {
          api_key: this.apiKey,
          campaign_id: campaignId
        }
      });

      if (response.data && response.data.success) {
        return response.data.data;
      }

      throw new Error(response.data?.message || 'Failed to get stats');
    } catch (error) {
      console.error('❌ Getting campaign stats failed:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * List all campaigns
   * @returns {Promise<Array>} Array of campaigns
   */
  async listCampaigns() {
    try {
      const response = await this.client.get('/campaign/list', {
        params: {
          api_key: this.apiKey
        }
      });

      if (response.data && response.data.success) {
        return response.data.data;
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
  async batchAddLeads(campaignId, leads, batchSize = 50) {
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
    const initialStats = await instantly.getCampaignStats(campaignId);
    console.log(`📊 Current campaign leads: ${initialStats.total_leads || 0}`);
    
    // Add leads to campaign in batches
    console.log('\n📧 Adding new leads to campaign...');
    const results = await instantly.batchAddLeads(campaignId, apolloLeads, 25);
    
    // Get updated campaign stats
    console.log('\n📈 Getting updated campaign statistics...');
    const finalStats = await instantly.getCampaignStats(campaignId);
    
    // Log comprehensive results
    console.log('\n🎯 INSTANTLY CAMPAIGN RESULTS:');
    console.log(`✅ Successfully added: ${results.successful_adds} leads`);
    console.log(`❌ Failed to add: ${results.failed_adds} leads`);
    console.log(`📦 Batches processed: ${results.batches_processed}`);
    console.log(`📈 Campaign total leads: ${finalStats.total_leads || 'Unknown'}`);
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
      campaign_total: finalStats.total_leads
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
 * Instantly API Authentication Setup
 * Add this to your .env file:
 * INSTANTLY_API_KEY=your_instantly_api_key_here
 */

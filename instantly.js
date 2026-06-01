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
   * 🆕 NEW: Get all campaigns - V2 API (fixed for correct response format)
   */
  async getCampaigns() {
    try {
      console.log('🔍 Fetching all campaigns from Instantly V2 API...');
      
      const response = await this.client.get('/api/v2/campaigns');

      // V2 API returns campaigns in `items` array
      if (response.data && response.data.items && Array.isArray(response.data.items) && response.data.items.length > 0) {
        console.log(`✅ Found ${response.data.items.length} campaigns:`);
        
        // Display campaigns in a nice format
        response.data.items.forEach((campaign, index) => {
          console.log(`${index + 1}. "${campaign.name}" (ID: ${campaign.id})`);
          console.log(`   Status: ${campaign.status === 1 ? 'Active' : 'Inactive'}`);
          console.log(`   Created: ${new Date(campaign.timestamp_created).toLocaleDateString()}`);
          console.log('   ---');
        });
        
        return response.data.items;
      } else {
        console.log('⚠️ No campaigns found');
        console.log('Response data:', response.data);
        return [];
      }

    } catch (error) {
      console.error('❌ Error fetching campaigns:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * 🆕 NEW: Get existing leads using V2 API with correct pagination
   */
  async getExistingLeads(campaignId = null) {
    try {
      console.log(campaignId ? 
        `🔍 Checking existing leads in campaign ${campaignId}...` : 
        '🔍 Checking existing leads across ALL campaigns...'
      );
      
      const allEmails = new Set();
      let totalChecked = 0;

      try {
        // V2 API pagination with max limit of 100
        let hasMore = true;
        let startingAfter = null;

        while (hasMore) {
          const requestBody = {
            limit: 100 // Max allowed by V2 API
          };

          if (campaignId) {
            requestBody.campaign_id = campaignId;
          }

          if (startingAfter) {
            requestBody.starting_after = startingAfter;
          }

          const response = await this.client.post('/api/v2/leads/list', requestBody);

          // Handle V2 API response format
          let leads = [];
          if (response.data) {
            if (Array.isArray(response.data)) {
              leads = response.data;
            } else if (response.data.items && Array.isArray(response.data.items)) {
              leads = response.data.items;
            }
          }

          if (leads.length > 0) {
            leads.forEach(lead => {
              if (lead.email) {
                allEmails.add(lead.email.toLowerCase());
              }
            });
            
            totalChecked += leads.length;
            console.log(`📧 Processed ${totalChecked} existing leads...`);

            // Check if we got less than the limit (meaning we're at the end)
            if (leads.length < 100) {
              hasMore = false;
            } else {
              // Use the last lead's ID for pagination
              startingAfter = leads[leads.length - 1].id;
            }
          } else {
            hasMore = false;
          }

          // Rate limiting to be nice to the API
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        if (totalChecked === 0) {
          console.log('📧 No existing leads found in this campaign');
        }

      } catch (leadsError) {
        console.log(`⚠️ Could not fetch leads: ${leadsError.message}`);
        console.log('💡 Error details:', leadsError.response?.data || 'No additional details');
      }

      console.log(`✅ Found ${allEmails.size} unique emails already in Instantly`);
      return allEmails;

    } catch (error) {
      console.error('❌ Error fetching existing leads:', error.response?.data || error.message);
      console.log('⚠️ Continuing without deduplication due to API error');
      return new Set();
    }
  }

  /**
   * 🆕 NEW: Filter out leads that already exist in Instantly
   * This prevents duplicate lead pulls and wasted Apollo credits
   */
  async filterDuplicateLeads(newLeads, campaignId = null) {
    console.log(`🔄 Checking ${newLeads.length} new leads against existing Instantly data...`);
    
    // Get existing emails from Instantly
    const existingEmails = await this.getExistingLeads(campaignId);
    
    // Filter out duplicates
    const uniqueLeads = newLeads.filter(lead => {
      const email = lead.email?.toLowerCase();
      return email && !existingEmails.has(email);
    });

    const duplicatesRemoved = newLeads.length - uniqueLeads.length;
    
    if (duplicatesRemoved > 0) {
      console.log(`🔄 Removed ${duplicatesRemoved} duplicates already in Instantly`);
      console.log(`💰 Saved ~${duplicatesRemoved} Apollo credits!`);
    }
    
    console.log(`🆕 ${uniqueLeads.length} new leads ready for enrichment`);
    return uniqueLeads;
  }

  /**
   * 🆕 NEW: Display all campaigns with IDs for easy copying
   */
  async showMyCampaigns() {
    console.log('🎯 WellBuiltWeb Campaign Finder');
    console.log('================================');
    
    const campaigns = await this.getCampaigns();
    
    if (campaigns.length > 0) {
      console.log('\n📋 Copy one of these campaign IDs to use in your lead puller:');
      campaigns.forEach((campaign, index) => {
        console.log(`\nCampaign ${index + 1}: ${campaign.name}`);
        console.log(`📋 ID: ${campaign.id}`);
        console.log(`Status: ${campaign.status === 1 ? '✅ Active' : '❌ Inactive'}`);
      });
      
      console.log('\n💡 Usage:');
      console.log('Add this to your Railway environment variables:');
      console.log('INSTANTLY_CAMPAIGN_ID=<paste_campaign_id_here>');
    }
    
    return campaigns;
  }

  /**
   * Add leads to an existing campaign (API V2) - YOUR ORIGINAL FUNCTION
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
            industry: lead.industry ?? lead.companyIndustry,
            skip_if_in_campaign: true,
            // subject and body are set by compose.js and passed through the queue entry
            custom_variables: {
              subject:      lead.subject ?? '',
              body:         lead.body    ?? '',
              company_size: lead.companySize?.toString() ?? '',
              apollo_id:    lead.apolloId ?? '',
              pull_date:    lead.pullDate ?? new Date().toISOString()
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
   * Get campaign details (API V2) - YOUR ORIGINAL FUNCTION
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
   * List all campaigns (API V2) - YOUR ORIGINAL FUNCTION
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
   * Batch add leads with error handling and progress tracking - YOUR ORIGINAL FUNCTION
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

// WellBuiltWeb Instantly Integration - YOUR ORIGINAL FUNCTION
export async function runWellBuiltWebOutreach(apolloLeads, campaignId = null) {
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
 * 🆕 NEW: Enhanced main function with deduplication
 */
export async function runWellBuiltWebOutreachEnhanced(apolloLeads, campaignId = null) {
  const instantly = new InstantlyManager(process.env.INSTANTLY_API_KEY);
  
  // Use environment variable campaign ID if not provided
  const targetCampaignId = campaignId || process.env.INSTANTLY_CAMPAIGN_ID;
  if (!targetCampaignId) throw new Error('INSTANTLY_CAMPAIGN_ID is not set');
  
  try {
    console.log('📧 Enhanced Instantly Email Campaign Starting...');
    console.log(`🎯 Campaign ID: ${targetCampaignId}`);
    console.log(`📊 Processing ${apolloLeads.length} Louisiana AI receptionist prospects`);
    
    // NEW: Filter out duplicates before adding to campaign
    console.log('\n🔄 Filtering duplicates against existing Instantly leads...');
    const uniqueLeads = await instantly.filterDuplicateLeads(apolloLeads, targetCampaignId);
    
    if (uniqueLeads.length === 0) {
      console.log('⚠️ All leads were duplicates! No new leads to add.');
      return {
        campaign_id: targetCampaignId,
        leads_processed: apolloLeads.length,
        leads_added: 0,
        leads_failed: 0,
        duplicates_filtered: apolloLeads.length,
        success_rate: '0.0',
        message: 'All leads were duplicates'
      };
    }

    console.log(`🆕 Processing ${uniqueLeads.length} unique leads (${apolloLeads.length - uniqueLeads.length} duplicates filtered)`);
    
    // Get current campaign stats (before adding new leads)
    console.log('\n📈 Getting current campaign statistics...');
    let initialStats = {};
    try {
      initialStats = await instantly.getCampaignStats(targetCampaignId);
      console.log(`📊 Current campaign: ${initialStats.name || 'Unknown'}`);
    } catch (error) {
      console.log(`⚠️ Could not get initial stats: ${error.message}`);
    }
    
    // Add only unique leads to campaign in batches
    console.log('\n📧 Adding new leads to campaign...');
    const results = await instantly.batchAddLeads(targetCampaignId, uniqueLeads, 25);
    
    // Get updated campaign stats
    console.log('\n📈 Getting updated campaign statistics...');
    let finalStats = {};
    try {
      finalStats = await instantly.getCampaignStats(targetCampaignId);
    } catch (error) {
      console.log(`⚠️ Could not get final stats: ${error.message}`);
    }
    
    // Log comprehensive results with deduplication info
    console.log('\n🎯 ENHANCED INSTANTLY CAMPAIGN RESULTS:');
    console.log(`📊 Original leads from Apollo: ${apolloLeads.length}`);
    console.log(`🔄 Duplicates filtered out: ${apolloLeads.length - uniqueLeads.length}`);
    console.log(`💰 Apollo credits saved: ~${apolloLeads.length - uniqueLeads.length}`);
    console.log(`✅ Successfully added: ${results.successful_adds} leads`);
    console.log(`❌ Failed to add: ${results.failed_adds} leads`);
    console.log(`📦 Batches processed: ${results.batches_processed}`);
    console.log(`📧 Success rate: ${((results.successful_adds / uniqueLeads.length) * 100).toFixed(1)}%`);
    
    if (results.errors.length > 0) {
      console.log('\n⚠️ BATCH ERRORS:');
      results.errors.forEach(error => {
        console.log(`- Batch ${error.batch}: ${error.error} (${error.leads_count} leads)`);
      });
    }

    // Sample lead added for verification
    if (results.successful_adds > 0) {
      console.log('\n📄 Sample lead added:');
      const sampleLead = uniqueLeads[0];
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
      campaign_id: targetCampaignId,
      leads_processed: apolloLeads.length,
      duplicates_filtered: apolloLeads.length - uniqueLeads.length,
      leads_added: results.successful_adds,
      leads_failed: results.failed_adds,
      success_rate: ((results.successful_adds / uniqueLeads.length) * 100).toFixed(1),
      campaign_total: finalStats.total_leads || 'Unknown',
      credits_saved: apolloLeads.length - uniqueLeads.length
    };

  } catch (error) {
    console.error('❌ Enhanced Instantly integration failed:', error);
    throw error;
  }
}

/**
 * Mark leads as contacted after successful email campaign setup - YOUR ORIGINAL FUNCTION
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
 * 🆕 NEW: Quick function to find and display campaign IDs
 * Run this first to get your campaign ID
 */
export async function findMyCampaigns() {
  const instantly = new InstantlyManager(process.env.INSTANTLY_API_KEY);
  return await instantly.showMyCampaigns();
}

/**
 * Instantly API V2 Authentication Setup
 * Add this to your .env file:
 * INSTANTLY_API_KEY=your_instantly_api_v2_key_here
 * INSTANTLY_CAMPAIGN_ID=your_campaign_id_here (optional)
 * 
 * NOTE: You need a NEW API key for V2 - the old V1 keys won't work
 */

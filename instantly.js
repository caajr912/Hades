/**
 * Instantly Helper Functions - Add these to your existing instantly.js file
 * These functions help you find campaign IDs and check for duplicates
 */

/**
 * Get all campaigns from your Instantly account
 * Use this to find your campaign IDs
 */
async function getCampaigns() {
  const INSTANTLY_API_KEY = process.env.INSTANTLY_API_KEY;
  
  if (!INSTANTLY_API_KEY) {
    console.error('❌ INSTANTLY_API_KEY not found in environment variables');
    return [];
  }

  try {
    console.log('🔍 Fetching all campaigns from Instantly...');
    
    const response = await fetch('https://api.instantly.ai/api/v2/campaigns', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${INSTANTLY_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('❌ Failed to fetch campaigns:', response.status, errorData);
      return [];
    }

    const data = await response.json();
    
    if (data && data.length > 0) {
      console.log(`✅ Found ${data.length} campaigns:`);
      
      // Display campaigns in a nice format
      data.forEach((campaign, index) => {
        console.log(`${index + 1}. "${campaign.name}" (ID: ${campaign.id})`);
        console.log(`   Status: ${campaign.status === 1 ? 'Active' : 'Inactive'}`);
        console.log(`   Created: ${new Date(campaign.timestamp_created).toLocaleDateString()}`);
        console.log('   ---');
      });
      
      return data;
    } else {
      console.log('⚠️ No campaigns found in your Instantly account');
      return [];
    }

  } catch (error) {
    console.error('❌ Error fetching campaigns:', error.message);
    return [];
  }
}

/**
 * Get existing leads from a specific campaign (or all campaigns)
 * This is what you'll use to check for duplicates
 */
async function getExistingLeads(campaignId = null) {
  const INSTANTLY_API_KEY = process.env.INSTANTLY_API_KEY;
  
  try {
    console.log(campaignId ? 
      `🔍 Checking existing leads in campaign ${campaignId}...` : 
      '🔍 Checking existing leads across ALL campaigns...'
    );
    
    const allEmails = new Set();
    let limit = 100; // Start with smaller batches
    let offset = 0;
    let totalChecked = 0;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString()
      });

      // Add campaign filter if specified
      if (campaignId) {
        params.append('campaign_id', campaignId);
      }

      const url = `https://api.instantly.ai/api/v2/leads?${params}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${INSTANTLY_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.error('❌ Failed to fetch leads:', response.status);
        break;
      }

      const data = await response.json();
      
      if (data && data.length > 0) {
        data.forEach(lead => {
          if (lead.email) {
            allEmails.add(lead.email.toLowerCase());
          }
        });
        
        totalChecked += data.length;
        console.log(`📧 Processed ${totalChecked} existing leads...`);
        
        // Check if we got less than the limit (meaning we're at the end)
        if (data.length < limit) {
          hasMore = false;
        } else {
          offset += limit;
        }
      } else {
        hasMore = false;
      }

      // Rate limiting to be nice to the API
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`✅ Found ${allEmails.size} unique emails already in Instantly`);
    return allEmails;

  } catch (error) {
    console.error('❌ Error fetching existing leads:', error.message);
    // Return empty set if API fails - better to potentially have duplicates than miss leads
    console.log('⚠️ Continuing without deduplication due to API error');
    return new Set();
  }
}

/**
 * Filter out leads that already exist in Instantly
 * This is the main deduplication function
 */
async function filterDuplicateLeads(newLeads, campaignId = null) {
  console.log(`🔄 Checking ${newLeads.length} new leads against existing Instantly data...`);
  
  // Get existing emails from Instantly
  const existingEmails = await getExistingLeads(campaignId);
  
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
 * Simple function to run and display your campaigns
 * Run this first to find your campaign IDs
 */
async function showMyCampaigns() {
  console.log('🎯 WellBuiltWeb Campaign Finder');
  console.log('================================');
  
  const campaigns = await getCampaigns();
  
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
 * Enhanced lead checking that works with your existing Apollo code
 * Add this to your Apollo class methods
 */
async function enhancedGetWeeklyLeadBatch(apolloInstance, batchSize = 100, campaignId = null) {
  console.log('🎯 Starting enhanced weekly lead pull with Instantly deduplication...');
  console.log(`📅 Target: ${batchSize} NEW high-quality prospects`);
  
  try {
    // Step 1: Pull more leads from Apollo than we need (accounting for duplicates)
    const searchBuffer = Math.max(batchSize * 3, 300); // Pull 3x target to account for duplicates
    console.log(`🔍 Pulling ${searchBuffer} raw leads from Apollo (${batchSize} target after filtering)...`);
    
    // Use your existing Apollo search
    const searchBody = apolloInstance.getWellBuiltWebSearchBody(1, searchBuffer);
    const response = await apolloInstance.client.post('/mixed_people/search', searchBody);
    
    if (!response.data?.people?.length) {
      console.log('⚠️ No leads found with current criteria');
      return [];
    }

    let leads = response.data.people;
    console.log(`✅ Raw leads pulled from Apollo: ${leads.length}`);

    // Step 2: Apply your existing quality filters
    leads = apolloInstance.filterWellBuiltWebLeads(leads);
    console.log(`🎯 Qualified leads after filtering: ${leads.length}`);

    // Step 3: NEW - Remove duplicates against Instantly
    const newLeads = await filterDuplicateLeads(leads, campaignId);

    if (newLeads.length === 0) {
      console.log('⚠️ No new leads after deduplication - all were already in Instantly!');
      console.log('💡 Consider expanding your Apollo search criteria or targeting different markets');
      return [];
    }

    // Step 4: Take only what we need for enrichment
    const leadsToEnrich = newLeads.slice(0, batchSize);
    if (leadsToEnrich.length < newLeads.length) {
      console.log(`📊 Taking first ${leadsToEnrich.length} leads for enrichment (${newLeads.length - leadsToEnrich.length} saved for next time)`);
    }

    // Step 5: Use your existing enrichment
    console.log('\n🔓 ENRICHING LEADS FOR REAL EMAIL ADDRESSES:');
    const enrichedLeads = await apolloInstance.enrichLeadsWithEmails(leadsToEnrich);

    if (enrichedLeads.length === 0) {
      console.log('⚠️ No leads were successfully enriched with real emails');
      return [];
    }

    // Step 6: Final deduplication check (in case enrichment revealed different emails)
    const existingEmails = await getExistingLeads(campaignId);
    const finalLeads = enrichedLeads.filter(lead => {
      const email = lead.email?.toLowerCase();
      return email && !existingEmails.has(email);
    });

    const enrichmentDuplicates = enrichedLeads.length - finalLeads.length;
    if (enrichmentDuplicates > 0) {
      console.log(`🔄 Removed ${enrichmentDuplicates} additional duplicates found after enrichment`);
    }

    console.log(`\n🎯 FINAL RESULT: ${finalLeads.length} new, enriched leads ready for outreach!`);
    return finalLeads;

  } catch (error) {
    console.error('❌ Enhanced weekly batch pull failed:', error.message);
    throw error;
  }
}

// Export functions for use in your other files
module.exports = {
  getCampaigns,
  getExistingLeads, 
  filterDuplicateLeads,
  showMyCampaigns,
  enhancedGetWeeklyLeadBatch
};

/**
 * Quick test script to find your campaigns
 * Run this independently to see your campaign IDs
 */
if (require.main === module) {
  // This runs if you execute this file directly
  showMyCampaigns()
    .then(() => {
      console.log('\n✅ Campaign lookup complete!');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Error:', error.message);
      process.exit(1);
    });
}

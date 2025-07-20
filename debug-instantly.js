import { InstantlyManager } from './instantly.js';
import dotenv from 'dotenv';

dotenv.config();

async function debugInstantlyIntegration() {
  const instantly = new InstantlyManager(process.env.INSTANTLY_API_KEY);
  
  console.log('🔍 Debugging Instantly Integration...\n');

  try {
    // Test 1: List all campaigns to verify campaign exists
    console.log('TEST 1: List all campaigns');
    const campaigns = await instantly.listCampaigns();
    console.log(`Found ${campaigns.length} campaigns:`);
    campaigns.forEach(campaign => {
      console.log(`- ${campaign.id}: ${campaign.name} (${campaign.status === 1 ? 'Active' : 'Inactive'})`);
    });

    // Test 2: Get specific campaign details
    const campaignId = '5cf286eb-6adc-45cc-ba82-d5225f91c3a0';
    console.log(`\nTEST 2: Get campaign details for ${campaignId}`);
    
    try {
      const campaignStats = await instantly.getCampaignStats(campaignId);
      console.log('Campaign details:', JSON.stringify(campaignStats, null, 2));
    } catch (error) {
      console.log('❌ Could not get campaign details:', error.message);
    }

    // Test 3: List leads in the campaign
    console.log(`\nTEST 3: List leads in campaign ${campaignId}`);
    try {
      const response = await instantly.client.post('/api/v2/leads/list', {
        filter: {
          campaign: [campaignId]
        },
        limit: 10
      });
      
      if (response.data && response.data.data) {
        console.log(`Found ${response.data.data.length} leads in campaign:`);
        response.data.data.forEach(lead => {
          console.log(`- ${lead.email} (${lead.first_name} ${lead.last_name}) - Status: ${lead.status}`);
        });
      } else {
        console.log('No leads found in this campaign');
      }
    } catch (error) {
      console.log('❌ Could not list campaign leads:', error.response?.data || error.message);
    }

    // Test 4: Try to find a recently added lead
    console.log(`\nTEST 4: Search for a specific lead we just added`);
    try {
      const testEmail = 'email_not_unlocked@domain.com'; // From your log
      const response = await instantly.client.post('/api/v2/leads/list', {
        filter: {
          email: [testEmail]
        },
        limit: 5
      });
      
      if (response.data && response.data.data && response.data.data.length > 0) {
        const lead = response.data.data[0];
        console.log(`Found lead: ${lead.email}`);
        console.log(`Campaign: ${lead.campaign}`);
        console.log(`Status: ${lead.status}`);
        console.log(`Created: ${lead.timestamp_created}`);
      } else {
        console.log(`❌ Lead ${testEmail} not found`);
      }
    } catch (error) {
      console.log('❌ Could not search for specific lead:', error.response?.data || error.message);
    }

    // Test 5: Check if leads were created today
    console.log(`\nTEST 5: Check for leads created today`);
    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const response = await instantly.client.post('/api/v2/leads/list', {
        filter: {
          timestamp_created: {
            gte: `${today}T00:00:00.000Z`
          }
        },
        limit: 20
      });
      
      if (response.data && response.data.data) {
        console.log(`Found ${response.data.data.length} leads created today:`);
        response.data.data.forEach(lead => {
          console.log(`- ${lead.email} in campaign ${lead.campaign} at ${lead.timestamp_created}`);
        });
      } else {
        console.log('No leads created today');
      }
    } catch (error) {
      console.log('❌ Could not search for today\'s leads:', error.response?.data || error.message);
    }

    console.log('\n🔍 Debug complete!');

  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

debugInstantlyIntegration().catch(console.error);

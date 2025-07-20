import { InstantlyManager } from './instantly.js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('🔍 Debugging Instantly Integration...\n');
  const instantly = new InstantlyManager(process.env.INSTANTLY_API_KEY);

  try {
    // Test 1: List campaigns to verify connection
    console.log('TEST 1: List all campaigns');
    const campaigns = await instantly.listCampaigns();
    console.log(`Found ${campaigns.length} campaigns:`);
    
    if (campaigns.length > 0) {
      campaigns.forEach(campaign => {
        console.log(`- ID: ${campaign.id}`);
        console.log(`  Name: ${campaign.name}`);
        console.log(`  Status: ${campaign.status}`);
      });
    }

    // Test 2: Check our specific campaign
    const campaignId = '5cf286eb-6adc-45cc-ba82-d5225f91c3a0';
    console.log(`\nTEST 2: Looking for campaign ${campaignId}`);
    
    const targetCampaign = campaigns.find(c => c.id === campaignId);
    if (targetCampaign) {
      console.log(`✅ Found target campaign: ${targetCampaign.name}`);
    } else {
      console.log(`❌ Campaign ${campaignId} NOT FOUND in your account`);
      console.log('Available campaign IDs:');
      campaigns.forEach(c => console.log(`  - ${c.id}`));
    }

    // Test 3: Try to create a single test lead
    console.log(`\nTEST 3: Creating a test lead`);
    const testLead = {
      campaign: campaignId,
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
      company_name: 'Test Company'
    };

    try {
      const response = await instantly.client.post('/api/v2/leads', testLead);
      console.log('✅ Test lead created successfully:', response.data);
    } catch (error) {
      console.log('❌ Test lead creation failed:', error.response?.data || error.message);
    }

  } catch (error) {
    console.error('❌ Debug failed:', error.response?.data || error.message);
  }
}

main().catch(console.error);

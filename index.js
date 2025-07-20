import { runWellBuiltWebBatch } from './apollo.js';
import { InstantlyManager } from './instantly.js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('🔍 Testing real lead creation...\n');
  
  const instantly = new InstantlyManager(process.env.INSTANTLY_API_KEY);
  const campaignId = '5cf286eb-6adc-45cc-ba82-d5225f91c3a0';

  // Get one real lead from Apollo
  const apolloLeads = await runWellBuiltWebBatch();
  
  if (apolloLeads.length > 0) {
    const testLead = apolloLeads[0];
    console.log('📄 Sample Apollo lead:', {
      firstName: testLead.firstName,
      email: testLead.email,
      companyName: testLead.companyName
    });

    // Test 1: Try with all the data (like our original attempt)
    console.log('\nTEST 1: Full lead data');
    try {
      const fullData = {
        campaign: campaignId,
        email: testLead.email,
        first_name: testLead.firstName,
        last_name: testLead.lastName,
        company_name: testLead.companyName,
        title: testLead.title,
        phone: testLead.phone,
        website: testLead.website,
        city: testLead.city,
        state: testLead.state,
        industry: testLead.industry,
        custom_variables: {
          company_size: testLead.companySize?.toString() || '',
          apollo_id: testLead.apolloId || '',
          pull_date: testLead.pullDate || new Date().toISOString()
        }
      };

      const response = await instantly.client.post('/api/v2/leads', fullData);
      console.log('✅ Full data lead created:', response.data.id);
    } catch (error) {
      console.log('❌ Full data failed:', error.response?.data || error.message);
    }

    // Test 2: Try with minimal data (like our successful test)
    console.log('\nTEST 2: Minimal lead data');
    try {
      const minimalData = {
        campaign: campaignId,
        email: testLead.email.replace('@', '+minimal@'), // Slight variation to avoid duplicate
        first_name: testLead.firstName,
        last_name: testLead.lastName,
        company_name: testLead.companyName
      };

      const response = await instantly.client.post('/api/v2/leads', minimalData);
      console.log('✅ Minimal data lead created:', response.data.id);
    } catch (error) {
      console.log('❌ Minimal data failed:', error.response?.data || error.message);
    }
  }
}

main().catch(console.error);

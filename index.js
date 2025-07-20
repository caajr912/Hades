import { InstantlyManager } from './instantly.js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('🔍 Debugging Instantly Integration...\n');
  console.log('API Key exists:', !!process.env.INSTANTLY_API_KEY);
  console.log('API Key starts with:', process.env.INSTANTLY_API_KEY?.substring(0, 10) + '...');

  const instantly = new InstantlyManager(process.env.INSTANTLY_API_KEY);

  try {
    // Test the basic API connection
    console.log('\nTEST 1: Testing basic API connection');
    
    try {
      const response = await instantly.client.get('/api/v2/campaigns');
      console.log('✅ API Response status:', response.status);
      console.log('✅ Response data type:', typeof response.data);
      console.log('✅ Response data:', JSON.stringify(response.data, null, 2));
    } catch (apiError) {
      console.log('❌ API call failed:', apiError.response?.status);
      console.log('❌ Error data:', apiError.response?.data);
      console.log('❌ Error message:', apiError.message);
    }

    // Test creating a simple lead
    console.log('\nTEST 2: Testing lead creation');
    try {
      const testLead = {
        campaign: '5cf286eb-6adc-45cc-ba82-d5225f91c3a0',
        email: 'debug-test@example.com',
        first_name: 'Debug',
        last_name: 'Test'
      };
      
      const response = await instantly.client.post('/api/v2/leads', testLead);
      console.log('✅ Lead creation response:', response.status);
      console.log('✅ Lead data:', JSON.stringify(response.data, null, 2));
    } catch (leadError) {
      console.log('❌ Lead creation failed:', leadError.response?.status);
      console.log('❌ Lead error data:', leadError.response?.data);
      console.log('❌ Lead error message:', leadError.message);
    }

  } catch (error) {
    console.error('❌ Debug failed:', error.message);
  }
}

main().catch(console.error);

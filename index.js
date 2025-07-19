import { ApolloLeadPuller } from './apollo.js';
import dotenv from 'dotenv';

dotenv.config();

async function debugCombinedFilters() {
  const apollo = new ApolloLeadPuller(process.env.APOLLO_API_KEY);
  
  console.log('🔍 Testing COMBINED filters...\n');

  // Test 1: Size + Email
  try {
    const test1 = {
      page: 1,
      per_page: 10,
      person_locations: ["Louisiana"],
      organization_num_employees_ranges: ["5,10", "11,50"],
      email_status: ["verified"]
    };
    
    const response1 = await apollo.client.post('/mixed_people/search', test1);
    console.log(`TEST 1: Size + Email: ${response1.data.people?.length || 0} results`);
  } catch (error) {
    console.log(`TEST 1 FAILED:`, error.response?.data || error.message);
  }

  // Test 2: Size + Email + Titles
  try {
    const test2 = {
      page: 1,
      per_page: 10,
      person_locations: ["Louisiana"],
      organization_num_employees_ranges: ["5,10", "11,50"],
      email_status: ["verified"],
      person_titles: ["Owner", "CEO", "Manager"]
    };
    
    const response2 = await apollo.client.post('/mixed_people/search', test2);
    console.log(`TEST 2: Size + Email + Titles: ${response2.data.people?.length || 0} results`);
  } catch (error) {
    console.log(`TEST 2 FAILED:`, error.response?.data || error.message);
  }

  // Test 3: Your FULL WellBuiltWeb criteria
  try {
    const fullCriteria = apollo.constructor.getWellBuiltWebSearchBody(1, 10);
    
    const response3 = await apollo.client.post('/mixed_people/search', fullCriteria);
    console.log(`TEST 3: FULL WellBuiltWeb criteria: ${response3.data.people?.length || 0} results`);
    console.log('Full criteria:', JSON.stringify(fullCriteria, null, 2));
  } catch (error) {
    console.log(`TEST 3 FAILED:`, error.response?.data || error.message);
  }

  console.log('\n🔍 Now we know where the issue is!');
}

debugCombinedFilters().catch(console.error);

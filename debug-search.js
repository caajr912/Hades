import { ApolloLeadPuller } from './apollo.js';
import dotenv from 'dotenv';

dotenv.config();

async function debugLouisianaSearch() {
  const apollo = new ApolloLeadPuller(process.env.APOLLO_API_KEY);
  
  console.log('🔍 Debugging Louisiana search criteria...\n');

  // Test 1: Most basic search - just Louisiana
  console.log('TEST 1: Basic Louisiana search');
  try {
    const basicSearch = {
      page: 1,
      per_page: 10,
      person_locations: ["Louisiana"]
    };
    
    const response1 = await apollo.client.post('/mixed_people/search', basicSearch);
    console.log(`✅ Basic Louisiana: ${response1.data.people?.length || 0} results`);
  } catch (error) {
    console.log(`❌ Basic search failed:`, error.response?.data || error.message);
  }

  // Test 2: Add company size filter
  console.log('\nTEST 2: Louisiana + Company Size (5-50 employees)');
  try {
    const sizeSearch = {
      page: 1,
      per_page: 10,
      person_locations: ["Louisiana"],
      organization_num_employees_ranges: ["5,10", "11,50"]
    };
    
    const response2 = await apollo.client.post('/mixed_people/search', sizeSearch);
    console.log(`✅ With company size: ${response2.data.people?.length || 0} results`);
  } catch (error) {
    console.log(`❌ Size search failed:`, error.response?.data || error.message);
  }

  console.log('\n🔍 Debug complete!');
}

debugLouisianaSearch().catch(console.error);

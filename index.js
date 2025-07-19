import { ApolloLeadPuller } from './apollo.js';
import dotenv from 'dotenv';

dotenv.config();

async function debugLouisianaSearch() {
  const apollo = new ApolloLeadPuller(process.env.APOLLO_API_KEY);
  
  console.log('🔍 Debugging Louisiana search...\n');

  try {
    const basicSearch = {
      page: 1,
      per_page: 10,
      person_locations: ["Louisiana"]
    };
    
    const response1 = await apollo.client.post('/mixed_people/search', basicSearch);
    console.log(`✅ Basic Louisiana: ${response1.data.people?.length || 0} results`);
    
    if (response1.data.people?.length > 0) {
      console.log('Sample lead:', response1.data.people[0].first_name, response1.data.people[0].organization?.name);
    }
  } catch (error) {
    console.log(`❌ Failed:`, error.response?.data || error.message);
  }
}

debugLouisianaSearch().catch(console.error);

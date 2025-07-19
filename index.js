import { ApolloLeadPuller } from './apollo.js';
import dotenv from 'dotenv';

dotenv.config();

async function debugLouisianaSearch() {
  const apollo = new ApolloLeadPuller(process.env.APOLLO_API_KEY);
  
  console.log('🔍 Debugging Louisiana search filters...\n');

  // Test 1: Basic Louisiana ✅ (we know this works)
  console.log('TEST 1: ✅ Basic Louisiana: 10 results\n');

  // Test 2: Add company size
  try {
    const sizeSearch = {
      page: 1,
      per_page: 10,
      person_locations: ["Louisiana"],
      organization_num_employees_ranges: ["5,10", "11,50"]
    };
    
    const response2 = await apollo.client.post('/mixed_people/search', sizeSearch);
    console.log(`TEST 2: Company size (5-50): ${response2.data.people?.length || 0} results`);
  } catch (error) {
    console.log(`TEST 2: Company size FAILED:`, error.response?.data || error.message);
  }

  // Test 3: Add verified email
  try {
    const emailSearch = {
      page: 1,
      per_page: 10,
      person_locations: ["Louisiana"],
      email_status: ["verified"]
    };
    
    const response3 = await apollo.client.post('/mixed_people/search', emailSearch);
    console.log(`TEST 3: Verified email: ${response3.data.people?.length || 0} results`);
  } catch (error) {
    console.log(`TEST 3: Verified email FAILED:`, error.response?.data || error.message);
  }

  // Test 4: Add titles
  try {
    const titleSearch = {
      page: 1,
      per_page: 10,
      person_locations: ["Louisiana"],
      person_titles: ["Owner", "CEO", "Manager"]
    };
    
    const response4 = await apollo.client.post('/mixed_people/search', titleSearch);
    console.lo
    

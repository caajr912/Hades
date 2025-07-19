import { ApolloLeadPuller } from './apollo.js';
import dotenv from 'dotenv';

dotenv.config();

async function testIndustryParameters() {
  const apollo = new ApolloLeadPuller(process.env.APOLLO_API_KEY);
  
  console.log('🔍 Testing different industry parameter formats...\n');

  // Test 1: Current approach (organization_keywords)
  console.log('TEST 1: Current organization_keywords');
  try {
    const test1 = {
      page: 1,
      per_page: 5,
      person_locations: ["Louisiana"],
      organization_keywords: ["auto repair", "hvac"]
    };
    
    const response1 = await apollo.client.post('/mixed_people/search', test1);
    console.log(`✅ organization_keywords: ${response1.data.people?.length || 0} results`);
  } catch (error) {
    console.log(`❌ organization_keywords failed:`, error.response?.data || error.message);
  }

  // Test 2: Try organization_industries (structured)
  console.log('\nTEST 2: organization_industries (structured)');
  try {
    const test2 = {
      page: 1,
      per_page: 5,
      person_locations: ["Louisiana"],
      organization_industries: ["Auto Repair", "HVAC", "Plumbing"]
    };
    
    const response2 = await apollo.client.post('/mixed_people/search', test2);
    console.log(`✅ organization_industries: ${response2.data.people?.length || 0} results`);
  } catch (error) {
    console.log(`❌ organization_industries failed:`, error.response?.data || error.message);
  }

  // Test 3: Try SIC codes (government standard)
  console.log('\nTEST 3: SIC codes');
  try {
    const test3 = {
      page: 1,
      per_page: 5,
      person_locations: ["Louisiana"],
      organization_sic_codes: ["7538", "1711"] // Auto repair, HVAC
    };
    
    const response3 = await apollo.client.post('/mixed_people/search', test3);
    console.log(`✅ organization_sic_codes: ${response3.data.people?.length || 0} results`);
  } catch (error) {
    console.log(`❌ organization_sic_codes failed:`, error.response?.data || error.message);
  }

  // Test 4: Try organization_industry_tag_ids (maybe new IDs?)
  console.log('\nTEST 4: organization_industry_tag_ids (new format)');
  try {
    const test4 = {
      page: 1,
      per_page: 5,
      person_locations: ["Louisiana"],
      organization_industry_tag_ids: ["auto-repair", "hvac", "plumbing"]
    };
    
    const response4 = await apollo.client.post('/mixed_people/search', test4);
    console.log(`✅ organization_industry_tag_ids (new): ${response4.data.people?.length || 0} results`);
  } catch (error) {
    console.log(`❌ organization_industry_tag_ids (new) failed:`, error.response?.data || error.message);
  }

  // Test 5: Try company_industry
  console.log('\nTEST 5: company_industry');
  try {
    const test5 = {
      page: 1,
      per_page: 5,
      person_locations: ["Louisiana"],
      company_industry: ["Auto Repair", "HVAC"]
    };
    
    const response5 = await apollo.client.post('/mixed_people/search', test5);
    console.log(`✅ company_industry: ${response5.data.people?.length || 0} results`);
  } catch (error) {
    console.log(`❌ company_industry failed:`, error.response?.data || error.message);
  }

  // Test 6: Try organization_naics_codes (newer classification)
  console.log('\nTEST 6: NAICS codes');
  try {
    const test6 = {
      page: 1,
      per_page: 5,
      person_locations: ["Louisiana"],
      organization_naics_codes: ["811111", "238220"] // Auto repair, HVAC
    };
    
    const response6 = await apollo.client.post('/mixed_people/search', test6);
    console.log(`✅ organization_naics_codes: ${response6.data.people?.length || 0} results`);
  } catch (error) {
    console.log(`❌ organization_naics_codes failed:`, error.response?.data || error.message);
  }

  // Test 7: Try industry_keywords (alternate naming)
  console.log('\nTEST 7: industry_keywords');
  try {
    const test7 = {
      page: 1,
      per_page: 5,
      person_locations: ["Louisiana"],
      industry_keywords: ["auto repair", "hvac"]
    };
    
    const response7 = await apollo.client.post('/mixed_people/search', test7);
    console.log(`✅ industry_keywords: ${response7.data.people?.length || 0} results`);
  } catch (error) {
    console.log(`❌ industry_keywords failed:`, error.response?.data || error.message);
  }

  console.log('\n🔍 Industry parameter testing complete!');
  console.log('Any tests that returned results show valid parameter formats.');
}

testIndustryParameters().catch(console.error);

import { runWellBuiltWebBatch } from './apollo.js';
import { runWellBuiltWebOutreach, markLeadsAsContacted } from './instantly.js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('🔥 Hades Outreach Starting...');
  console.log('🎯 Complete Lead Generation & Email Campaign Pipeline');
  console.log('📍 Louisiana Focus: Building local relationships around Lafayette');
  console.log('-------------------\n');
  
  try {
    // Step 1: Pull leads from Apollo
    console.log('STEP 1: Apollo Lead Generation');
    const apolloLeads = await runWellBuiltWebBatch();
    
    if (apolloLeads.length === 0) {
      console.log('⚠️ No new leads found this week. Pipeline complete.');
      return;
    }

    console.log(`✅ Apollo: ${apolloLeads.length} quality leads pulled\n`);

    // Step 2: Add leads to Instantly email campaign
    console.log('STEP 2: Instantly Email Campaign');
    const instantlyResults = await runWellBuiltWebOutreach(apolloLeads);
    
    console.log(`✅ Instantly: ${instantlyResults.leads_added} leads added to campaign\n`);

    // Step 3: Mark successfully added leads as contacted
    if (instantlyResults.leads_added > 0) {
      console.log('STEP 3: Lead Tracking');
      const successfulLeads = apolloLeads.slice(0, instantlyResults.leads_added);
      await markLeadsAsContacted(successfulLeads);
      console.log('✅ Leads marked as contacted for future deduplication\n');
    }

    // Step 4: Final Summary
    console.log('STEP 4: Pipeline Summary');
    console.log('📊 FINAL RESULTS:');
    console.log(`🎯 Total leads processed: ${apolloLeads.length}`);
    console.log(`📧 Successfully added to campaign: ${instantlyResults.leads_added}`);
    console.log(`❌ Failed to add: ${instantlyResults.leads_failed}`);
    console.log(`📈 Success rate: ${instantlyResults.success_rate}%`);
    console.log(`📊 Campaign now has: ${instantlyResults.campaign_total} total leads`);

    console.log('\n🚀 EMAIL OUTREACH ACTIVE!');
    console.log('📧 Your AI receptionist campaign is now reaching Louisiana prospects');
    console.log('📊 Monitor results at: https://app.instantly.ai/');
    console.log('🎯 Next week: Pipeline will run again with fresh leads');
    console.log('-------------------');

    return {
      apollo_leads: apolloLeads.length,
      instantly_added: instantlyResults.leads_added,
      campaign_total: instantlyResults.campaign_total,
      success_rate: instantlyResults.success_rate
    };

  } catch (error) {
    console.error('❌ Pipeline failed:', error.message);
    console.error('🔧 Check your API keys and try again');
    
    // Log which step failed
    if (error.message.includes('Apollo')) {
      console.error('💡 Issue seems to be with Apollo API - check APOLLO_API_KEY');
    } else if (error.message.includes('Instantly')) {
      console.error('💡 Issue seems to be with Instantly API - check INSTANTLY_API_KEY');
    }
    
    throw error;
  }
}

main().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});

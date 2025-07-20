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
    // Step 1: Pull and enrich leads from Apollo
    console.log('STEP 1: Apollo Lead Generation + Email Enrichment');
    const apolloLeads = await runWellBuiltWebBatch();
    
    if (apolloLeads.length === 0) {
      console.log('⚠️ No new leads found this week. Pipeline complete.');
      return;
    }

    console.log(`✅ Apollo: ${apolloLeads.length} quality leads with real emails\n`);

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

    console.log('🚀 EMAIL OUTREACH ACTIVE WITH REAL EMAIL ADDRESSES!');

  } catch (error) {
    console.error('❌ Pipeline failed:', error.message);
  }
}

main().catch(console.error);

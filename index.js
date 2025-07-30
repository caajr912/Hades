import { runWellBuiltWebBatch } from './apollo.js';
import { runWellBuiltWebOutreachEnhanced, markLeadsAsContacted } from './instantly.js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('🔥 Hades Outreach Starting...');
  console.log('🎯 Complete Lead Generation & Email Campaign Pipeline');
  console.log('🔄 WITH ENHANCED DUPLICATE PREVENTION!');
  console.log('📍 Louisiana Focus: Building local relationships around Lafayette');
  console.log('-------------------\n');
  
  try {
    // Step 1: Pull and enrich leads from Apollo WITH Instantly deduplication
    console.log('STEP 1: Apollo Lead Generation + Instantly Deduplication + Email Enrichment');
    console.log('🔍 This will check existing Instantly leads BEFORE enriching to save Apollo credits...\n');
    
    const apolloResult = await runWellBuiltWebBatch();
    
    if (!apolloResult.leads || apolloResult.leads.length === 0) {
      console.log('⚠️ No new leads found this week.');
      console.log('💡 This could mean:');
      console.log('   - All leads found were already in your Instantly campaign (duplicates)');
      console.log('   - No leads matched your Apollo search criteria');
      console.log('   - Consider expanding search criteria or targeting new markets');
      console.log('\nPipeline complete - no credits wasted! ✅');
      return;
    }

    const apolloLeads = apolloResult.leads;
    console.log(`✅ Apollo: ${apolloLeads.length} NEW quality leads with real emails`);
    console.log(`💰 Duplicates already filtered - credits saved!\n`);

    // Step 2: Add leads to Instantly email campaign (with additional safety check)
    console.log('STEP 2: Instantly Email Campaign');
    console.log('🔄 Adding leads with final duplicate check...\n');
    
    const instantlyResults = await runWellBuiltWebOutreachEnhanced(
      apolloLeads,
      process.env.INSTANTLY_CAMPAIGN_ID
    );
    
    console.log(`✅ Instantly: ${instantlyResults.leads_added} leads added to campaign`);
    
    if (instantlyResults.duplicates_filtered > 0) {
      console.log(`🔄 Additional duplicates caught: ${instantlyResults.duplicates_filtered}`);
      console.log(`💰 Total credits saved: ${instantlyResults.credits_saved || 0}`);
    }
    console.log('');

    // Step 3: Mark successfully added leads as contacted
    if (instantlyResults.leads_added > 0) {
      console.log('STEP 3: Lead Tracking');
      const successfulLeads = apolloLeads.slice(0, instantlyResults.leads_added);
      await markLeadsAsContacted(successfulLeads);
      console.log('✅ Leads marked as contacted for future deduplication\n');
    }

    // Enhanced success summary
    console.log('🎯 PIPELINE COMPLETE - ENHANCED RESULTS:');
    console.log('==========================================');
    console.log(`📊 Total leads processed: ${instantlyResults.leads_processed || apolloLeads.length}`);
    console.log(`🔄 Duplicates prevented: ${instantlyResults.duplicates_filtered || 0}`);
    console.log(`✅ New leads added to campaign: ${instantlyResults.leads_added}`);
    console.log(`💰 Apollo credits saved: ${instantlyResults.credits_saved || 0}`);
    console.log(`📧 Success rate: ${instantlyResults.success_rate}%`);
    console.log(`🎯 Campaign ID: ${instantlyResults.campaign_id}`);
    
    if (instantlyResults.leads_added > 0) {
      console.log('\n🚀 EMAIL OUTREACH ACTIVE WITH REAL EMAIL ADDRESSES!');
      console.log('📧 Your AI receptionist campaign emails will start sending automatically');
      console.log('📊 Monitor progress in your Instantly dashboard');
    } else {
      console.log('\n⚠️ No leads were added - all were duplicates');
      console.log('💡 Consider expanding your target criteria or markets');
    }

  } catch (error) {
    console.error('❌ Pipeline failed:', error.message);
    console.error('🔧 Check your API keys and environment variables');
    
    // Helpful debugging info
    if (error.message.includes('INSTANTLY_API_KEY')) {
      console.error('💡 Make sure INSTANTLY_API_KEY is set in Railway environment');
    }
    if (error.message.includes('APOLLO_API_KEY')) {
      console.error('💡 Make sure APOLLO_API_KEY is set in Railway environment');
    }
    if (error.message.includes('campaign')) {
      console.error('💡 Make sure INSTANTLY_CAMPAIGN_ID is set in Railway environment');
      console.error('💡 Run the campaign discovery script to find your campaign ID');
    }
  }
}

/**
 * Helper function to discover your Instantly campaigns
 * Uncomment and run this first if you need to find your campaign ID
 */
async function discoverCampaigns() {
  try {
    console.log('🔍 Discovering your Instantly campaigns...\n');
    
    const { InstantlyManager } = await import('./instantly.js');
    const instantly = new InstantlyManager(process.env.INSTANTLY_API_KEY);
    const campaigns = await instantly.showMyCampaigns();
    
    if (campaigns.length > 0) {
      console.log('\n📋 Copy one of these IDs to your Railway environment variables:');
      console.log('Variable name: INSTANTLY_CAMPAIGN_ID');
      console.log('Variable value: <one_of_the_campaign_ids_above>');
    }
    
  } catch (error) {
    console.error('❌ Campaign discovery failed:', error.message);
    console.error('💡 Check your INSTANTLY_API_KEY in Railway environment');
  }
}

// Main execution
main().catch(console.error);

// Uncomment this line if you need to discover your campaign IDs first:
discoverCampaigns().catch(console.error);

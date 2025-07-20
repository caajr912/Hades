import { runWellBuiltWebBatch } from './apollo.js';
import { runWellBuiltWebEnrichment } from './clay.js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('🔥 Hades Outreach Starting...');
  console.log('🎯 Complete Lead Generation & Enrichment Pipeline');
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

    // Step 2: Enrich leads with Clay
    console.log('STEP 2: Clay Lead Enrichment');
    const enrichedLeads = await runWellBuiltWebEnrichment(apolloLeads);
    
    console.log(`✅ Clay: ${enrichedLeads.length} leads enriched\n`);

    // Step 3: Summary and next steps
    console.log('STEP 3: Pipeline Summary');
    
    const successfulEnrichments = enrichedLeads.filter(lead => !lead.enrichmentFailed);
    const failedEnrichments = enrichedLeads.filter(lead => lead.enrichmentFailed);
    
    console.log('📊 FINAL RESULTS:');
    console.log(`🎯 Total leads processed: ${apolloLeads.length}`);
    console.log(`✅ Successfully enriched: ${successfulEnrichments.length}`);
    console.log(`❌ Enrichment failures: ${failedEnrichments.length}`);
    console.log(`📈 Enrichment success rate: ${((successfulEnrichments.length / apolloLeads.length) * 100).toFixed(1)}%`);

    // Show top prospects by AI Receptionist score
    if (successfulEnrichments.length > 0) {
      console.log('\n🏆 TOP PROSPECTS (by AI Receptionist Score):');
      
      const topProspects = successfulEnrichments
        .sort((a, b) => (b.aiReceptionistScore || 0) - (a.aiReceptionistScore || 0))
        .slice(0, 5);
      
      topProspects.forEach((lead, index) => {
        console.log(`${index + 1}. ${lead.firstName} ${lead.lastName} - ${lead.companyName}`);
        console.log(`   Score: ${lead.aiReceptionistScore}/100 | Complexity: ${lead.implementationComplexity}`);
        console.log(`   Industry: ${lead.companyIndustry || 'Unknown'} | Size: ${lead.companyEmployeeCount || lead.companySize || 'Unknown'} employees`);
        if (lead.talkingPoints && lead.talkingPoints.length > 0) {
          console.log(`   Key Point: ${lead.talkingPoints[0]}`);
        }
        console.log('');
      });
    }

    // Show enrichment failures for debugging
    if (failedEnrichments.length > 0) {
      console.log('⚠️ ENRICHMENT FAILURES (for debugging):');
      failedEnrichments.slice(0, 3).forEach(lead => {
        console.log(`- ${lead.firstName} ${lead.lastName}: ${lead.enrichmentError}`);
      });
      if (failedEnrichments.length > 3) {
        console.log(`  ... and ${failedEnrichments.length - 3} more`);
      }
      console.log('');
    }

    console.log('🎯 LEADS READY FOR INSTANTLY EMAIL CAMPAIGNS');
    console.log(`📧 ${successfulEnrichments.length} enriched leads ready for outreach`);
    console.log('📋 Next: Build Instantly integration for automated email campaigns');
    console.log('-------------------');

    // Return enriched leads for next step (Instantly)
    return enrichedLeads;

  } catch (error) {
    console.error('❌ Pipeline failed:', error.message);
    console.error('🔧 Check your API keys and try again');
    
    // Log which step failed
    if (error.message.includes('Apollo')) {
      console.error('💡 Issue seems to be with Apollo API - check APOLLO_API_KEY');
    } else if (error.message.includes('Clay')) {
      console.error('💡 Issue seems to be with Clay API - check CLAY_API_KEY');
    }
    
    throw error;
  }
}

main().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});

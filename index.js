import { ApolloLeadPuller, runWellBuiltWebBatch } from './apollo.js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('🔥 Hades Outreach Starting...');
  console.log('🚀 WellBuiltWeb AI Receptionist Lead Pull Starting...');
  console.log('📍 Louisiana Focus: Building local relationships around Lafayette');
  console.log('📅 Target: Small businesses needing phone coverage (5-50 employees)');
  
  try {
    const leads = await runWellBuiltWebBatch();
    console.log(`✅ Success: ${leads.length} Louisiana leads ready`);
    
    if (leads.length > 0) {
      console.log('\n📋 Sample leads:');
      leads.slice(0, 3).forEach((lead, i) => {
        console.log(`${i+1}. ${lead.firstName} ${lead.lastName} - ${lead.title} at ${lead.companyName}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Failed:', error.message);
  }
}

main();


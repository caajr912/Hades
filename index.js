import { runWellBuiltWebBatch } from './apollo.js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('🔥 Hades Outreach Starting...');
  try {
    const leads = await runWellBuiltWebBatch();
    console.log(`✅ Success: ${leads.length} Louisiana leads ready`);
    // ... rest of your code
  } catch (error) {
    console.error('❌ Failed:', error.message);
  }
}

main();

import 'dotenv/config';
import { runPipeline } from './pipeline.js';

const result = await runPipeline();
console.log('Done:', result);


import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { apiKeyManager } from './src/lib/server/api-key-manager.ts';

async function test() {
  const keys = await apiKeyManager.getKeys();
  console.log('Got keys:', keys.length);
  keys.forEach(k => console.log(k.label, k.maskedKey, k.status));
}

test().catch(console.error);


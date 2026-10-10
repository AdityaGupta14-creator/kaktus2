import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { adminSupabase } from './src/lib/server/supabase.js';

async function audit() {
  const { data: pData, error: pErr } = await adminSupabase.from('profiles').select('*').limit(1);
  console.log('profiles sample:', pData, pErr);
  
  const { data: sData, error: sErr } = await adminSupabase.from('subscriptions').select('*').limit(1);
  console.log('subscriptions sample:', sData, sErr);
  
  const { data: payData, error: payErr } = await adminSupabase.from('payments').select('*').limit(1);
  console.log('payments sample:', payData, payErr);
}
audit();

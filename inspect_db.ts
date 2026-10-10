import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xznmqvkhxdttiujzibcr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function inspect() {
  console.log("Fetching tables...");
  const tables = ['profiles', 'projects', 'chat_sessions', 'chat_messages', 'project_components', 'project_connections', 'project_files', 'activity_logs', 'subscriptions'];
  
  for (const table of tables) {
    const { data, error, count } = await supabase.from(table).select('*', { count: 'exact', head: true });
    if (error) {
      console.error(`Table ${table} error:`, error.message);
    } else {
      console.log(`Table ${table} exists. Row count: ${count}`);
    }
  }

  const rpcs = ['sync_workspace_atomic', 'sync_chat_atomic'];
  for (const rpc of rpcs) {
    const { data, error } = await supabase.rpc(rpc, {});
    console.log(`RPC ${rpc} check:`, error ? error.message : "Success");
  }
}

inspect().catch(console.error);

import { adminSupabase } from './src/lib/server/supabase';

async function test() {
  console.log('Fetching projects...');
  const { data, error } = await adminSupabase
    .from('projects')
    .select('id, name, owner_uid')
    .limit(1);

  if (error) {
    console.error('Supabase Error:', error);
  } else {
    console.log('Data:', data);
  }
}

test();

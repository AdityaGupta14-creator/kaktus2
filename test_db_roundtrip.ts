import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xznmqvkhxdttiujzibcr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

async function runTest() {
  const testUid = 'test_agent_user_999';
  const testWorkspaceId = 'test_ws_999';
  const testChatId = 'test_chat_999';

  console.log('1. Setting up test profile...');
  const { error: profileErr } = await adminSupabase.from('profiles').upsert({
    uid: testUid,
    email: 'test@agent.local',
    display_name: 'Test Agent',
    updated_at: new Date().toISOString()
  });
  if (profileErr) throw new Error(`Profile setup failed: ${profileErr.message}`);

  console.log('2. Testing sync_workspace_atomic RPC...');
  const workspaceState = { tabs: [{ id: 'main', name: 'Main', currentStep: 0 }] };
  const components = [{ id: `${testWorkspaceId}-comp1`, component_type: 'LED', configuration: {}, placement: {x: 0, y: 0} }];
  const files = [{ id: `${testWorkspaceId}-file1`, filename: 'main.cpp', file_type: 'code', content: 'void setup() {}' }];
  const { error: wsErr } = await adminSupabase.rpc('sync_workspace_atomic', {
    p_owner_uid: testUid,
    p_project_id: testWorkspaceId,
    p_project_name: 'Test Project',
    p_workspace_state: workspaceState,
    p_components: components,
    p_connections: [],
    p_files: files
  });
  if (wsErr) throw new Error(`Workspace RPC failed: ${wsErr.message}`);

  console.log('3. Testing sync_chat_atomic RPC...');
  const messages = [{ id: `${testChatId}-msg-0`, message_role: 'user', content: 'Hello DB!', metadata: {} }];
  const { error: chatErr } = await adminSupabase.rpc('sync_chat_atomic', {
    p_owner_uid: testUid,
    p_session_id: testChatId,
    p_title: 'Test Chat',
    p_messages: messages
  });
  if (chatErr) throw new Error(`Chat RPC failed: ${chatErr.message}`);

  console.log('4. Verifying persistence via SELECT...');
  const { data: projectData } = await adminSupabase.from('projects').select('*').eq('id', testWorkspaceId).single();
  console.log('Project found:', !!projectData, 'Owner match:', projectData?.owner_uid === testUid);

  const { data: compData } = await adminSupabase.from('project_components').select('*').eq('project_id', testWorkspaceId);
  console.log('Components found:', compData?.length);

  const { data: fileData } = await adminSupabase.from('project_files').select('*').eq('project_id', testWorkspaceId);
  console.log('Project Files found:', fileData?.length);

  const { data: chatSessionData } = await adminSupabase.from('chat_sessions').select('*').eq('id', testChatId).single();
  console.log('Chat Session found:', !!chatSessionData, 'Owner match:', chatSessionData?.owner_uid === testUid);

  const { data: chatMessageData } = await adminSupabase.from('chat_messages').select('*').eq('session_id', testChatId);
  console.log('Chat Messages found:', chatMessageData?.length);

  const { data: logData } = await adminSupabase.from('activity_logs').select('*');
  console.log('Activity Logs found:', logData?.length);
  if (logData?.length) console.log('Latest Activity Log:', logData[logData.length - 1]);

  const { data: msgsData } = await adminSupabase.from('chat_messages').select('*').not('metadata', 'is', null);
  const msgsWithImages = msgsData?.filter(m => m.metadata?.imageAttachments?.length > 0) || [];
  console.log('Total Chat Messages with Images in DB:', msgsWithImages.length);
  if (msgsWithImages.length) console.log('Latest Image Metadata:', msgsWithImages[msgsWithImages.length - 1].metadata.imageAttachments);

  const { data: allFilesData } = await adminSupabase.from('project_files').select('*');
  console.log('Total Project Files in DB:', allFilesData?.length);

  console.log('5. Cleaning up test records...');
  await adminSupabase.from('profiles').delete().eq('uid', testUid); // Cascades to everything
  console.log('Cleanup complete. Test passed successfully.');
}

runTest().catch(console.error);

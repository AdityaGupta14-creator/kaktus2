import 'dotenv/config';
import { checkAndConsumeEntitlement, rollbackEntitlement } from './src/lib/server/usage-meter';
import { adminSupabase } from './src/lib/server/supabase';

async function runTests() {
  console.log('--- Running Stage 4 Tests ---');
  
  // Create a mock user in Supabase for testing
  const mockUid = 'test-user-' + Date.now();
  
  try {
    console.log('1. Testing unauthenticated user...');
    const unauthRes = await checkAndConsumeEntitlement(null, 'gemini-1.5-pro');
    if (unauthRes.allowed) throw new Error('Unauthenticated user should be denied');
    console.log('✅ Unauthenticated check passed.');

    console.log('2. Testing unauthorized/free user without subscription...');
    const freeRes = await checkAndConsumeEntitlement(mockUid, 'gemini-1.5-pro');
    if (freeRes.allowed) throw new Error('Free user should be denied Pro models');
    console.log('✅ Free user check passed.');

    console.log('3. Provisioning mock subscription...');
    const { error: subErr } = await adminSupabase.from('subscriptions').insert({
      user_uid: mockUid,
      plan_id: 'starter',
      status: 'active',
      quota_remaining: 1, // Only 1 quota for testing exhaustion
      expires_at: new Date(Date.now() + 86400000).toISOString()
    });
    if (subErr) throw subErr;

    console.log('4. Testing allowed consumption...');
    const allowedRes = await checkAndConsumeEntitlement(mockUid, 'gemini-1.5-pro');
    if (!allowedRes.allowed) throw new Error('Valid subscription should be allowed');
    console.log('✅ Allowed consumption passed.');

    console.log('5. Testing quota exhaustion...');
    const exhaustedRes = await checkAndConsumeEntitlement(mockUid, 'gemini-1.5-pro');
    if (exhaustedRes.allowed) throw new Error('Exhausted subscription should be denied');
    console.log('✅ Quota exhaustion passed.');

    console.log('6. Testing quota refund/rollback...');
    await rollbackEntitlement(mockUid);
    const restoredRes = await checkAndConsumeEntitlement(mockUid, 'gemini-1.5-pro');
    if (!restoredRes.allowed) throw new Error('Restored quota should be allowed');
    console.log('✅ Refund rollback passed.');

    console.log('7. Testing expired subscription...');
    await adminSupabase.from('subscriptions').update({
      expires_at: new Date(Date.now() - 86400000).toISOString(),
      quota_remaining: 10
    }).eq('user_uid', mockUid);
    const expiredRes = await checkAndConsumeEntitlement(mockUid, 'gemini-1.5-pro');
    if (expiredRes.allowed) throw new Error('Expired subscription should be denied');
    
    const { data: expiredSub } = await adminSupabase.from('subscriptions').select('status').eq('user_uid', mockUid).single();
    if (expiredSub?.status !== 'expired') throw new Error('RPC should auto-expire the subscription status');
    console.log('✅ Expired subscription and auto-expiry passed.');

    console.log('8. Testing concurrent consumption...');
    await adminSupabase.from('subscriptions').update({
      status: 'active',
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      quota_remaining: 5
    }).eq('user_uid', mockUid);

    // Fire 10 concurrent requests for 5 quota
    const concurrentReqs = Array.from({ length: 10 }).map(() => checkAndConsumeEntitlement(mockUid, 'gemini-1.5-pro'));
    const results = await Promise.all(concurrentReqs);
    const successCount = results.filter(r => r.allowed).length;
    if (successCount !== 5) throw new Error(`Concurrency failed: Expected 5 successes, got ${successCount}`);
    console.log('✅ Concurrent consumption passed.');

  } catch (err: any) {
    console.error('❌ Test failed:', err.message);
  } finally {
    // Cleanup
    await adminSupabase.from('subscriptions').delete().eq('user_uid', mockUid);
    console.log('--- Cleanup complete ---');
  }
}

runTests();

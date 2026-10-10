import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { db } from './src/lib/server/firebase-admin.js';
import { adminSupabase } from './src/lib/server/supabase.js';

async function migrate() {
  console.log('Starting API usage migration from Firestore to Supabase...');
  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  try {
    const snapshot = await db.collection('api_usage').get();
    console.log(`Found ${snapshot.size} records in Firestore.`);

    const batchSize = 100;
    let batch = [];

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const sbId = `mig-${doc.id}`; // idempotency key

      batch.push({
        id: sbId,
        user_uid: data.uid,
        endpoint: data.endpoint || null,
        provider: data.provider || null,
        model: data.model || null,
        success: !!data.success,
        failure: !!data.failure,
        error_type: data.errorType || data.error_type || null,
        duration_ms: data.durationMs || 0,
        input_tokens: data.inputTokens || null,
        output_tokens: data.outputTokens || null,
        total_tokens: data.totalTokens || null,
        key_id: data.keyId || null,
        created_at: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString()
      });

      if (batch.length === batchSize) {
        const { error } = await adminSupabase.from('api_usage').upsert(batch, { onConflict: 'id' });
        if (error) {
          console.error('Batch error:', error);
          failed += batch.length;
        } else {
          migrated += batch.length;
        }
        batch = [];
      }
    }

    if (batch.length > 0) {
      const { error } = await adminSupabase.from('api_usage').upsert(batch, { onConflict: 'id' });
      if (error) {
        console.error('Final batch error:', error);
        failed += batch.length;
      } else {
        migrated += batch.length;
      }
    }

    console.log(`Migration complete. Migrated: ${migrated}, Skipped: ${skipped}, Failed: ${failed}`);
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

migrate();

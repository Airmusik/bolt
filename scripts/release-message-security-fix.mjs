import { readFile } from 'node:fs/promises';
import { connectProjectDatabase, readProjectEnvironment } from './db-connection.mjs';

const env = await readProjectEnvironment();
const db = await connectProjectDatabase(env, 'message_security_fix_release');
try {
  await db.query(await readFile('supabase/migrations/20260909002000_fix_message_security_guard.sql', 'utf8'));
  const { rows } = await db.query(`select id, driver_id, owner_id from public.conversations order by created_at desc limit 1`);
  if (!rows[0]) throw new Error('No conversation available for verification');
  const sender = rows[0].owner_id || rows[0].driver_id;
  await db.query('begin');
  await db.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'authenticated', true)`, [sender]);
  await db.query(`update public.site_settings set value = 'false' where key = 'message_email_enabled'`);
  const inserted = await db.query(`insert into public.messages(conversation_id, sender_id, content, type) values ($1, $2, $3, 'text') returning id`, [rows[0].id, sender, 'Security guard release verification']);
  if (inserted.rowCount !== 1) throw new Error('Message guard verification failed');
  await db.query('rollback');
  console.log(JSON.stringify({ migrated: true, messageInsert: true, rolledBack: true }));
} catch (error) {
  await db.query('rollback').catch(() => undefined);
  throw error;
} finally {
  await db.end();
}

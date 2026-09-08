import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { connectProjectDatabase, readProjectEnvironment } from './db-connection.mjs';

const db = await connectProjectDatabase(await readProjectEnvironment(), 'member_updates_release');
try {
  await db.query(await readFile('supabase/migrations/20260908150000_admin_member_updates.sql', 'utf8'));
  const recipient = (await db.query(`select id from auth.users where email_confirmed_at is not null limit 1`)).rows[0];
  assert(recipient, 'No confirmed recipient is available for the rollback test');
  await db.query('begin');
  const notification = (await db.query(`insert into public.notifications(user_id,type,title,body,data) values($1,'admin_announcement','Test update','Rollback-only test',jsonb_build_object('email',true)) returning id`, [recipient.id])).rows[0];
  const queued = (await db.query(`select event_type,status,attempts,payload->>'subject' subject from reminder_private.event_email where notification_id=$1`, [notification.id])).rows[0];
  assert.equal(queued.event_type, 'admin_announcement');
  assert.equal(queued.status, 'sending');
  assert.equal(queued.attempts, 1);
  assert.match(queued.subject, /Test update/);
  await db.query('rollback');
  const rpcReady = (await db.query(`select to_regprocedure('public.admin_send_member_update(text,text,text,boolean)') is not null ready`)).rows[0].ready;
  assert(rpcReady);
  console.log(JSON.stringify({ applied: true, email_queue: 'passed', rollback: 'passed', rpc: 'ready' }));
} catch (error) {
  try { await db.query('rollback'); } catch {}
  throw error;
} finally { await db.end(); }

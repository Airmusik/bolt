import assert from 'node:assert/strict';
import { connectProjectDatabase, readProjectEnvironment } from './db-connection.mjs';

const db = await connectProjectDatabase(await readProjectEnvironment(), 'event_email_test');
try {
  const target = (await db.query("select id from auth.users where lower(email)='emacharia554@gmail.com'")).rows[0];
  assert(target);
  await db.query('begin');
  for (const eventType of ['connection_accepted', 'message']) {
    const notification = (await db.query(
      `insert into public.notifications(user_id,type,title,body,data) values($1,$2,'Test','Test','{}') returning id`,
      [target.id, eventType],
    )).rows[0];
    const queued = (await db.query(
      `select event_type,status,attempts,payload->>'subject' subject from reminder_private.event_email where notification_id=$1`,
      [notification.id],
    )).rows[0];
    assert.equal(queued.event_type, eventType);
    assert.equal(queued.status, 'sending');
    assert.equal(queued.attempts, 1);
    assert.match(queued.subject, /11Drive/);
  }
  await db.query('rollback');
  const infrastructure = (await db.query(`select
    exists(select 1 from pg_trigger where tgname='queue_event_email_on_notification' and not tgisinternal) trigger_ready,
    exists(select 1 from cron.job where jobname='event-email-delivery' and active) retry_ready`)).rows[0];
  assert(infrastructure.trigger_ready && infrastructure.retry_ready);
  console.log(JSON.stringify({ trigger: 'passed', retry_job: 'active', rollback: 'passed' }));
} catch (error) {
  try { await db.query('rollback'); } catch {}
  throw error;
} finally { await db.end(); }

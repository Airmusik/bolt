import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { readProjectEnvironment, connectProjectDatabase } from './db-connection.mjs';

const db = await connectProjectDatabase(await readProjectEnvironment(), 'contact_continuity_upgrade');
try {
  await db.query(await readFile('supabase/migrations/20260909010000_contact_continuity_and_guest_email.sql', 'utf8'));

  const member = (await db.query("select id from profiles where role in ('driver','owner') order by created_at limit 1")).rows[0];
  assert.ok(member?.id, 'A member is required for the transactional continuity check');

  await db.query('BEGIN');
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [member.id]);
  await db.query('SET LOCAL ROLE authenticated');
  const first = (await db.query("select send_member_support_message('Support continuity test one') id")).rows[0].id;
  const second = (await db.query("select send_member_support_message('Support continuity test two') id")).rows[0].id;
  assert.equal(first, second, 'Successive member messages must reuse one support thread');
  const count = (await db.query("select count(*)::int total from contact_message_entries where contact_message_id=$1 and body like 'Support continuity test %'", [first])).rows[0].total;
  assert.equal(count, 2);
  await db.query('ROLLBACK');

  const checks = await db.query(`
    select
      to_regprocedure('public.send_member_support_message(text)') is not null as member_rpc,
      to_regprocedure('public.dispatch_support_email(uuid)') is not null as dispatcher,
      exists(select 1 from cron.job where jobname='support-email-delivery') as retry_job,
      exists(select 1 from pg_trigger where tgname='queue_support_email_on_contact_entry' and not tgisinternal) as email_trigger
  `);
  assert.deepEqual(checks.rows[0], { member_rpc: true, dispatcher: true, retry_job: true, email_trigger: true });
  console.log('Contact continuity and guest email delivery are live; transactional checks passed.');
} finally {
  await db.query('ROLLBACK').catch(() => {});
  await db.end();
}

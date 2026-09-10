import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { connectProjectDatabase, readProjectEnvironment } from './db-connection.mjs';

const db = await connectProjectDatabase(await readProjectEnvironment(), 'member_update_links_release');
try {
  await db.query('BEGIN');
  await db.query(await readFile('supabase/migrations/20260910090000_member_update_email_destination.sql', 'utf8'));
  const id = '00000000-0000-0000-0000-000000000100';
  // Render a payload only: no notification insertion, queue dispatch, or email.
  const row = (await db.query(`SELECT reminder_private.member_update_email_payload('preview@example.invalid','Release check','No email is sent by this check.',$1::uuid) payload, (SELECT COALESCE(NULLIF(trim(value),''),'11Drive') FROM site_settings WHERE key='site_name') brand`, [id])).rows[0];
  assert.equal(row.payload.subject, `${row.brand || '11Drive'} Updates`);
  assert.ok(row.payload.text.includes(`/updates?update=${id}`));
  assert.ok(row.payload.html.includes(`/updates?update=${id}`));
  assert.ok(!row.payload.html.includes('/chat'));
  const routes = (await db.query(`SELECT count(*)::int invalid FROM notifications WHERE type='admin_announcement' AND data->>'path' IS DISTINCT FROM '/updates'`)).rows[0];
  assert.equal(routes.invalid, 0);
  await db.query('COMMIT');
  console.log(JSON.stringify({ applied: true, subject: row.payload.subject, destination: '/updates?update=<notification-id>', queued_emails_dispatched_by_test: 0 }));
} catch (error) { await db.query('ROLLBACK'); throw error; }
finally { await db.end(); }

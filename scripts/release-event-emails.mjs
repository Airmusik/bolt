import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { connectProjectDatabase, readProjectEnvironment } from './db-connection.mjs';

const db = await connectProjectDatabase(await readProjectEnvironment(), 'event_email_release');
try {
  await db.query(await readFile('supabase/migrations/20260908120000_accepted_connection_and_message_email.sql', 'utf8'));
  const target = 'emacharia554@gmail.com';
  const user = (await db.query('select id, email_confirmed_at is not null confirmed from auth.users where lower(email)=lower($1)', [target])).rows[0];
  assert(user, 'The requested test email is not registered');
  assert(user.confirmed, 'The requested test email is not confirmed');
  const config = (await db.query('select from_email, site_url from reminder_private.email_config where id')).rows[0];
  const delivery = await db.query(`
    select net.http_post(
      url := 'https://api.resend.com/emails',
      body := jsonb_build_object(
        'from', '11Drive <' || $2::text || '>', 'to', jsonb_build_array($1::text),
        'subject', $3::text,
        'text', $4::text,
        'html', reminder_private.event_email_html($5::text,$4::text,$6::text,$7::text,'11Drive',$8::text)
      ),
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || btrim(s.decrypted_secret, E' \\r\\n\\t'),
        'Content-Type', 'application/json'
      )
    ) request_id
    from vault.decrypted_secrets s where s.name='document_reminder_resend_key'
  `, [target, config.from_email, process.argv[2] || '11Drive email notification test', process.argv[3] || 'This confirms that instant 11Drive email notifications are working.', process.argv[4] || 'Email notifications are active', 'Open 11Drive', '/', config.site_url]);
  console.log(JSON.stringify({ applied: true, target, request_id: delivery.rows[0].request_id }));
} finally { await db.end(); }

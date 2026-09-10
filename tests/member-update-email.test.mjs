import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const migration = readFileSync('supabase/migrations/20260910090000_member_update_email_destination.sql', 'utf8');

test('member-update email targets Updates, uses current branding and preserves other delivery types', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE SCHEMA reminder_private;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT '00000000-0000-0000-0000-000000000001'::uuid$$;
      CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS $$SELECT COALESCE(current_setting('test.admin',true),'false')='true'$$;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
      CREATE TABLE profiles(id uuid PRIMARY KEY,role text,is_suspended boolean DEFAULT false);
      CREATE TABLE site_settings(key text PRIMARY KEY,value text);
      CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,type text,title text,body text,data jsonb,read boolean DEFAULT false);
      CREATE TABLE reminder_private.email_config(id boolean PRIMARY KEY,from_email text,site_url text);
      CREATE TABLE reminder_private.event_email(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),notification_id uuid UNIQUE,user_id uuid,event_type text,payload jsonb,status text DEFAULT 'queued',attempts integer DEFAULT 0);
      CREATE TABLE reminder_private.member_update_audit(id uuid,admin_id uuid,audience text,title text,body text,email_enabled boolean,recipient_count integer);
      CREATE TABLE dispatched(id uuid);
      CREATE FUNCTION public.dispatch_event_email(p_id uuid) RETURNS void LANGUAGE sql AS $$INSERT INTO dispatched VALUES(p_id)$$;
      CREATE FUNCTION reminder_private.email_html_escape(value text) RETURNS text LANGUAGE sql AS $$SELECT replace(replace(replace(replace(COALESCE(value,''),'&','&amp;'),'<','&lt;'),'>','&gt;'), '"','&quot;')$$;
      INSERT INTO site_settings VALUES('site_name','11Drive');
      INSERT INTO reminder_private.email_config VALUES(true,'support@example.invalid','https://www.11drive.com/');
      INSERT INTO auth.users VALUES('00000000-0000-0000-0000-000000000011','driver@example.invalid',now()),('00000000-0000-0000-0000-000000000012','owner@example.invalid',now()),('00000000-0000-0000-0000-000000000013','unconfirmed@example.invalid',null);
      INSERT INTO profiles VALUES('00000000-0000-0000-0000-000000000011','driver',false),('00000000-0000-0000-0000-000000000012','owner',false),('00000000-0000-0000-0000-000000000013','driver',false);
      INSERT INTO notifications(id,user_id,type,title,body,data,read) VALUES('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000011','admin_announcement','Old announcement','Old body','{"path":"/notifications"}',true);
      INSERT INTO reminder_private.event_email(notification_id,user_id,event_type,payload) SELECT id,user_id,type,'{"to":["driver@example.invalid"],"subject":"Old subject"}'::jsonb FROM notifications;
    `);
    const emailSource = readFileSync('supabase/migrations/20260908120000_accepted_connection_and_message_email.sql', 'utf8');
    await db.exec(emailSource.slice(emailSource.indexOf('CREATE OR REPLACE FUNCTION reminder_private.event_email_html'), emailSource.indexOf('CREATE OR REPLACE FUNCTION public.dispatch_event_email')));
    await db.exec(migration);
    await db.exec(`CREATE TRIGGER queue_test AFTER INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION reminder_private.queue_event_email();`);
    let row = (await db.query(`SELECT e.payload, n.data, n.read FROM reminder_private.event_email e JOIN notifications n ON n.id=e.notification_id`)).rows[0];
    assert.equal(row.data.path, '/updates'); assert.equal(row.read, true);
    assert.equal(row.payload.subject, '11Drive Updates');
    assert.match(row.payload.html, /https:\/\/www\.11drive\.com\/updates\?update=00000000-0000-0000-0000-000000000100/);
    await assert.rejects(db.query(`SELECT admin_send_member_update('all','Maintenance','Details here',true)`), /Admin access required/);
    await db.exec(`SELECT set_config('test.admin','true',false)`);
    assert.equal((await db.query(`SELECT admin_send_member_update('all','Maintenance <test>','Read the latest news.',true) count`)).rows[0].count, 3);
    const payloads = (await db.query(`SELECT e.payload,n.id FROM reminder_private.event_email e JOIN notifications n ON n.id=e.notification_id WHERE n.title='Maintenance <test>'`)).rows;
    assert.equal(payloads.length, 2, 'unconfirmed addresses do not receive email');
    for (const { payload, id } of payloads) {
      assert.equal(payload.subject, '11Drive Updates');
      assert.ok(payload.text.includes(`/updates?update=${id}`));
      assert.ok(payload.html.includes(`/updates?update=${id}`));
      assert.match(payload.html, /Maintenance &lt;test&gt;/);
      assert.match(payload.html, /<h1[^>]*>11Drive Updates<\/h1>/);
      assert.doesNotMatch(payload.html, /\/notifications|\/chat|<test>/);
    }
    const count = (await db.query(`SELECT count(*)::int total FROM reminder_private.event_email`)).rows[0].total;
    await db.query(`SELECT admin_send_member_update('driver','In-app only','No mail should be sent.',false)`);
    assert.equal((await db.query(`SELECT count(*)::int total FROM reminder_private.event_email`)).rows[0].total, count);
    await db.exec(`UPDATE site_settings SET value='Next & Drive' WHERE key='site_name'`);
    const renamed = (await db.query(`SELECT reminder_private.member_update_email_payload('preview@example.invalid','New announcement','Body','00000000-0000-0000-0000-000000000101') payload`)).rows[0].payload;
    assert.equal(renamed.subject, 'Next & Drive Updates'); assert.match(renamed.html, /Next &amp; Drive Updates/);
    // A repeat migration must not alter attempted/sent payloads or dispatch mail.
    await db.exec(`UPDATE reminder_private.event_email SET attempts=1,status='accepted'`);
    const before = (await db.query(`SELECT payload FROM reminder_private.event_email ORDER BY id`)).rows;
    const dispatched = (await db.query(`SELECT count(*)::int n FROM dispatched`)).rows[0].n;
    await db.exec(migration);
    assert.deepEqual((await db.query(`SELECT payload FROM reminder_private.event_email ORDER BY id`)).rows, before);
    assert.equal((await db.query(`SELECT count(*)::int n FROM dispatched`)).rows[0].n, dispatched);
    await db.exec(`INSERT INTO notifications(user_id,type,title,body,data) VALUES('00000000-0000-0000-0000-000000000011','reinstatement','Account reinstated','Welcome back','{"path":"/dashboard"}'),('00000000-0000-0000-0000-000000000011','message','Message','Private message','{}');`);
    row = (await db.query(`SELECT payload FROM reminder_private.event_email WHERE event_type='reinstatement'`)).rows[0];
    assert.equal(row.payload.subject, 'Account reinstated — Next & Drive'); assert.match(row.payload.html, /\/dashboard/);
    assert.equal((await db.query(`SELECT payload FROM reminder_private.event_email WHERE event_type='message'`)).rows[0].payload, null);
    assert.equal((await db.query(`SELECT has_function_privilege('authenticated','reminder_private.member_update_email_payload(text,text,text,uuid)','EXECUTE') allowed`)).rows[0].allowed, false);
  } finally { await db.close(); }
});

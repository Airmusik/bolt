import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('document lifecycle: single submission, review, expiry, renewal, reminders and admin-only visibility', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO authenticated,anon;
      CREATE TABLE profiles(id uuid PRIMARY KEY,role text,full_name text DEFAULT 'Test User',email text DEFAULT 'member@example.test',is_suspended boolean DEFAULT false,onboarding_completed boolean DEFAULT true,is_verified boolean DEFAULT false,verification_status text DEFAULT 'unverified',platform_history_approved boolean DEFAULT false,platform_history_submitted boolean DEFAULT false,created_at timestamptz DEFAULT now(),contracts_completed integer DEFAULT 0,rating numeric DEFAULT 5,rating_count integer DEFAULT 0);
      CREATE FUNCTION is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin') $$;
      CREATE TABLE driver_platform_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),driver_id uuid REFERENCES profiles(id) ON DELETE CASCADE,platform text DEFAULT 'uber',months_active integer DEFAULT 0,trips integer DEFAULT 0,proof_url text,approved boolean DEFAULT false,created_at timestamptz DEFAULT now());
      CREATE TABLE vehicles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid REFERENCES profiles(id),deleted_at timestamptz);
      CREATE TABLE documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,vehicle_id uuid REFERENCES vehicles(id),type text,label text,file_url text,verified boolean DEFAULT false,rejected boolean DEFAULT false,expiry_date date);
      CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES profiles(id),type text,title text,body text,data jsonb);
      CREATE TABLE site_settings(key text PRIMARY KEY,value text);
      CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
      CREATE SCHEMA net; CREATE SCHEMA vault; CREATE SCHEMA cron;
      CREATE TABLE net.calls(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,url text,body jsonb,headers jsonb);
      CREATE TABLE net._http_response(id bigint,status_code integer,timed_out boolean,error_msg text);
      CREATE TABLE net.http_request_queue(id bigint);
      CREATE TABLE vault.decrypted_secrets(name text,decrypted_secret text);
      CREATE FUNCTION net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer) RETURNS bigint LANGUAGE sql AS $$ INSERT INTO net.calls(url,body,headers) VALUES($1,$2,$3) RETURNING id $$;
      CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
      CREATE FUNCTION derive_driver_history_state() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
      CREATE FUNCTION refresh_driver_history_state() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
      CREATE TRIGGER derive_driver_history_state BEFORE INSERT OR UPDATE OF platform_history_approved,platform_history_submitted,role ON profiles FOR EACH ROW EXECUTE FUNCTION derive_driver_history_state();
      CREATE TRIGGER refresh_driver_history_state AFTER INSERT OR UPDATE OR DELETE ON driver_platform_history FOR EACH ROW EXECUTE FUNCTION refresh_driver_history_state();
      ALTER TABLE profiles ENABLE ROW LEVEL SECURITY; CREATE POLICY readable ON profiles FOR SELECT USING(true); CREATE POLICY own_update ON profiles FOR UPDATE USING(id=auth.uid() OR is_admin());
      ALTER TABLE driver_platform_history ENABLE ROW LEVEL SECURITY;
      CREATE POLICY own_history ON driver_platform_history FOR ALL USING(driver_id=auth.uid() OR is_admin()) WITH CHECK(driver_id=auth.uid() OR is_admin());
      GRANT SELECT,UPDATE ON profiles TO authenticated; GRANT SELECT ON profiles TO anon;
      GRANT SELECT,INSERT,UPDATE,DELETE ON driver_platform_history,documents,vehicles TO authenticated;
      INSERT INTO profiles(id,role) VALUES('10000000-0000-4000-8000-000000000001','admin'),('10000000-0000-4000-8000-000000000002','driver'),('10000000-0000-4000-8000-000000000003','owner');
    `);
    for (const name of ['20260902200000_document_review_lifecycle.sql','20260902201000_document_expiry_reminders.sql']) await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
    // External extension/network APIs are replaced by local fixtures; never send mail.
    const worker=(await readFile(new URL('../supabase/migrations/20260902202000_document_email_worker.sql',import.meta.url),'utf8')).replace(/^CREATE EXTENSION.*;$/gm,'');
    await db.exec(worker);
    const admin='10000000-0000-4000-8000-000000000001', driver='10000000-0000-4000-8000-000000000002', owner='10000000-0000-4000-8000-000000000003';
    const asUser=async(id,role='authenticated')=>{ await db.exec('RESET ROLE'); await db.query("SELECT set_config('test.uid',$1,false)",[id]); await db.exec(`SET ROLE ${role}`); };
    const row=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
    await asUser(driver);
    const h=await row('INSERT INTO driver_platform_history(driver_id) VALUES($1) RETURNING *',[driver]);
    await assert.rejects(db.query('SELECT submit_profile_verification()'),/months active/);
    await db.query("UPDATE driver_platform_history SET months_active=12,proof_url='private-first' WHERE id=$1",[h.id]);
    const unused=await row('INSERT INTO driver_platform_history(driver_id) VALUES($1) RETURNING id',[driver]);
    await db.query('SELECT remove_history_draft($1)',[unused.id]);
    await db.query('SELECT submit_profile_verification()');
    const submitted=await row('SELECT * FROM driver_platform_history WHERE id=$1',[h.id]);
    assert.equal(submitted.review_status,'pending');
    await db.query('SELECT submit_profile_verification()');
    for (const [sql,args] of [
      ["UPDATE driver_platform_history SET proof_url='replacement' WHERE id=$1",[h.id]],
      ['DELETE FROM driver_platform_history WHERE id=$1',[h.id]],
      ['INSERT INTO driver_platform_history(driver_id) VALUES($1)',[driver]],
      ["UPDATE driver_platform_history SET review_status='draft' WHERE id=$1",[h.id]],
      ['SELECT prepare_history_renewal($1)',[h.id]],
    ]) await assert.rejects(db.query(sql,args),/review|retained/);
    await assert.rejects(db.query("SELECT review_platform_history($1,'approved',NULL,$2)",[h.id,submitted.submitted_at]),/Administrator/);
    await asUser(admin);
    await db.query("SELECT review_platform_history($1,'rejected','Upload recent history',$2)",[h.id,submitted.submitted_at]);
    await asUser(driver);
    await db.query('SELECT prepare_history_renewal($1)',[h.id]);
    assert.equal((await row('SELECT count(*)::int AS n FROM platform_history_versions')).n,1);
    await db.query("UPDATE driver_platform_history SET months_active=13,proof_url='private-second' WHERE id=$1",[h.id]);
    await db.query('SELECT submit_profile_verification()');
    const revised=await row('SELECT * FROM driver_platform_history WHERE id=$1',[h.id]);
    await asUser(admin);
    await assert.rejects(db.query("SELECT review_platform_history($1,'approved',NULL,$2)",[h.id,submitted.submitted_at]),/changed/);
    await db.query("SELECT review_platform_history($1,'approved',NULL,$2)",[h.id,revised.submitted_at]);
    await db.query("SELECT review_platform_history($1,'approved',NULL,$2)",[h.id,revised.submitted_at]);
    const approved=await row("SELECT *,expires_at=reviewed_at+interval '6 months' AS exact FROM driver_platform_history WHERE id=$1",[h.id]);
    assert.equal(approved.exact,true);
    await asUser(driver);
    await assert.rejects(db.query('SELECT prepare_history_renewal($1)',[h.id]),/after expiry/);
    await assert.rejects(db.query('INSERT INTO driver_platform_history(driver_id) VALUES($1)',[driver]),/still valid/);
    await assert.rejects(db.query("UPDATE driver_platform_history SET expires_at=now()+interval '1 year' WHERE id=$1",[h.id]),/Renew/);
    await assert.rejects(db.query('SELECT process_document_expiry_reminders()'),/permission denied/);
    await assert.rejects(db.query('SELECT * FROM reminder_private.deliveries'),/permission denied/);
    await assert.rejects(db.query('SELECT admin_expired_documents()'),/Administrator/);
    await assert.rejects(db.query("UPDATE profiles SET document_listing_visibility='private' WHERE id=$1",[driver]),/Only admins/);
    // Simulate time passing in an isolated test database, never on production.
    await asUser(admin,'postgres');
    await db.exec("SET app.history_transition='on'");
    await db.query("UPDATE driver_platform_history SET expires_at=now()+interval '29 days' WHERE id=$1",[h.id]);
    await db.exec("SET app.history_transition='off'");
    assert.equal((await row('SELECT process_document_expiry_reminders() n')).n,1);
    assert.equal((await row('SELECT process_document_expiry_reminders() n')).n,0);
    const cycle=await row('SELECT expires_at FROM driver_platform_history WHERE id=$1',[h.id]);
    assert.equal((await row('SELECT count(*)::int n FROM reminder_private.deliveries WHERE expires_at=$1',[cycle.expires_at])).n,1);
    await db.query('SELECT dispatch_document_reminder_email()');
    assert.equal((await row('SELECT count(*)::int n FROM net.calls')).n,0,'disabled email never sends');
    await db.query("INSERT INTO auth.users VALUES($1,'registered@example.test')",[driver]);
    await db.exec("INSERT INTO vault.decrypted_secrets VALUES('document_reminder_resend_key','fake-test-key'); UPDATE reminder_private.email_config SET enabled=true,from_email='sender@example.test'; INSERT INTO site_settings VALUES('site_name','Renamed Site'),('admin_contact_email','new-support@example.test');");
    await db.query('SELECT dispatch_document_reminder_email()');
    const delivery=await row('SELECT * FROM net.calls ORDER BY id DESC LIMIT 1');
    assert.deepEqual(delivery.body.to,['registered@example.test']);
    assert.equal(delivery.body.reply_to,'new-support@example.test');
    assert.match(delivery.body.subject,/Renamed Site/);
    assert.ok(!delivery.body.text.includes('private-second'),'no proof URL emailed');
    await db.query('INSERT INTO net._http_response(id,status_code) VALUES($1,503)',[delivery.id]);
    await db.query('SELECT dispatch_document_reminder_email()');
    await db.query("UPDATE reminder_private.deliveries SET next_attempt_at=now() WHERE email_status='queued'");
    await db.query('SELECT dispatch_document_reminder_email()');
    const retry=await row('SELECT * FROM net.calls ORDER BY id DESC LIMIT 1');
    assert.equal(retry.headers['Idempotency-Key'],delivery.headers['Idempotency-Key']);
    assert.deepEqual(retry.body,delivery.body);
    await db.query('INSERT INTO net._http_response(id,status_code) VALUES($1,200)',[retry.id]);
    await db.query('SELECT dispatch_document_reminder_email()');
    assert.equal((await row("SELECT count(*)::int n FROM reminder_private.deliveries WHERE email_status='accepted'")).n,1);
    await db.exec("SET app.history_transition='on'");
    await db.query("UPDATE driver_platform_history SET expires_at=now()-interval '1 second' WHERE id=$1",[h.id]);
    await db.exec("SET app.history_transition='off'");
    await db.query('SELECT process_document_expiry_reminders()');
    assert.equal((await row('SELECT platform_history_approved FROM profiles WHERE id=$1',[driver])).platform_history_approved,false);
    assert.equal((await row('SELECT admin_expired_documents() d')).d.length,1);
    await db.query("SELECT admin_document_listing_action($1,NULL,'private')",[driver]);
    await asUser(owner);
    assert.equal((await db.query('SELECT * FROM profiles WHERE id=$1',[driver])).rows.length,0);
    await asUser(admin);
    await assert.rejects(db.query("SELECT admin_document_listing_action($1,NULL,'public')",[driver]),/Submit or renew/);
    await asUser(driver);
    await db.query('SELECT prepare_history_renewal($1)',[h.id]);
    await db.query("UPDATE driver_platform_history SET proof_url='fresh-renewal' WHERE id=$1",[h.id]);
    await db.query('SELECT submit_profile_verification()');
    await asUser(admin,'postgres');
    await db.query('SELECT process_document_expiry_reminders()');
    assert.equal((await row("SELECT count(*)::int n FROM reminder_private.deliveries WHERE email_status='queued'")).n,0);
    const renewal=await row('SELECT * FROM driver_platform_history WHERE id=$1',[h.id]);
    await db.query("SELECT review_platform_history($1,'approved',NULL,$2)",[h.id,renewal.submitted_at]);
    await db.query("SELECT admin_document_listing_action($1,NULL,'public')",[driver]);
    await asUser(owner);
    assert.equal((await db.query('SELECT id FROM profiles WHERE id=$1',[driver])).rows.length,1);
  } finally { await db.close(); }
});

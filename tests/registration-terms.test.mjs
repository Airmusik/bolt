import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('registration acceptance is required, versioned, private and immutable; support is not reportable', async () => {
  const db=new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,raw_user_meta_data jsonb DEFAULT '{}');
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      GRANT USAGE ON SCHEMA auth TO authenticated;
      CREATE TABLE profiles(id uuid PRIMARY KEY,role text);
      CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin') $$;
      CREATE TABLE site_settings(key text PRIMARY KEY,value text);
      INSERT INTO site_settings VALUES ('site_name','Test Platform'),('admin_contact_email','support@example.test'),('admin_contact_phone','Test phone');
      CREATE TABLE conversations(id uuid PRIMARY KEY,admin_id uuid,driver_id uuid,owner_id uuid);
      CREATE TABLE reports(id uuid DEFAULT gen_random_uuid(),reported_id uuid,target_type text,target_id uuid);
      GRANT INSERT ON reports TO authenticated;
    `);
    const user='11111111-1111-1111-1111-111111111111', admin='22222222-2222-2222-2222-222222222222', other='33333333-3333-3333-3333-333333333333';
    await db.query('INSERT INTO auth.users(id) VALUES($1)',[admin]);
    for (const file of ['20260902170000_support_reports_and_registration_terms.sql','20260902171000_registration_terms_document.sql']) await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    const document=JSON.parse(await readFile(new URL('../src/content/terms-2026-09-02.json',import.meta.url),'utf8'));
    assert.deepEqual((await db.query('SELECT document FROM registration_terms_documents')).rows[0].document,document);
    assert.equal((await db.query('SELECT * FROM registration_terms_acceptances')).rows.length,0,'no invented historical acceptance');
    await db.exec('UPDATE registration_terms_policy SET enforce_acceptance=true');
    await assert.rejects(db.query('INSERT INTO auth.users(id) VALUES($1)',[user]),/Accept the current/);
    for (const metadata of [{terms_accepted:false,terms_version:document.version},{terms_accepted:'true',terms_version:document.version},{terms_accepted:true,terms_version:'old'}]) {
      await assert.rejects(db.query('INSERT INTO auth.users(id,raw_user_meta_data) VALUES($1,$2)',[user,JSON.stringify(metadata)]),/Accept the current/);
    }
    await db.query('INSERT INTO auth.users(id,raw_user_meta_data) VALUES($1,$2)',[user,JSON.stringify({terms_accepted:true,terms_version:document.version,accepted_at:'2000-01-01'})]);
    const receipt=(await db.query('SELECT * FROM registration_terms_acceptances')).rows[0];
    assert.equal(receipt.version,document.version); assert.equal(receipt.site_name,'Test Platform');
    assert.ok(new Date(receipt.accepted_at).getFullYear()>2020,'server time, not supplied time');
    await db.query('UPDATE auth.users SET raw_user_meta_data=$1 WHERE id=$2',[JSON.stringify({terms_version:'spoofed'}),user]);
    await db.exec("UPDATE site_settings SET value='Renamed Platform' WHERE key='site_name'");
    assert.deepEqual((await db.query('SELECT * FROM registration_terms_acceptances')).rows[0],receipt,'metadata and branding edits cannot rewrite acceptance');
    await db.query("INSERT INTO profiles VALUES($1,'driver'),($2,'admin'),($3,'owner')",[user,admin,other]);
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user]); await db.exec('SET ROLE authenticated');
    assert.equal((await db.query('SELECT * FROM registration_terms_acceptances')).rows.length,1);
    await assert.rejects(db.exec("UPDATE registration_terms_acceptances SET version='other'"),/permission denied/);
    await assert.rejects(db.query("INSERT INTO reports(reported_id,target_type,target_id) VALUES($1,'user',$1)",[admin]),/not a reportable member/);
    await db.query("INSERT INTO reports(reported_id,target_type,target_id) VALUES($1,'user',$1)",[other]);
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[other]);
    assert.equal((await db.query('SELECT * FROM registration_terms_acceptances')).rows.length,0);
    await db.exec('RESET ROLE; SET ROLE anon');
    assert.equal((await db.query('SELECT check_registration_terms($1) AS ok',[document.version])).rows[0].ok,true);
    assert.equal((await db.query("SELECT check_registration_terms('old') AS ok")).rows[0].ok,false);
    await assert.rejects(db.exec('SELECT * FROM registration_terms_acceptances'),/permission denied/);
  } finally { await db.close(); }
});

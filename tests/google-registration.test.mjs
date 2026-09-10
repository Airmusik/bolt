import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { auditIsolatedPolicies } from '../scripts/audit-isolated-policies.mjs';

const snapshot = JSON.parse(await readFile(new URL('./fixtures/access-control-baseline.json', import.meta.url), 'utf8'));
const migration = await readFile(new URL('../supabase/migrations/20260902220000_google_registration.sql', import.meta.url), 'utf8');
const accessMigration = await readFile(new URL('../supabase/migrations/20260902210000_access_control_audit_fixes.sql', import.meta.url), 'utf8');
const document = JSON.parse(await readFile(new URL('../src/content/terms-2026-09-02.json', import.meta.url), 'utf8'));
const google = '90000000-0000-4000-8000-000000000001';
const secondGoogle = '90000000-0000-4000-8000-000000000002';
const fakeAuth = `CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb DEFAULT '{}',raw_user_meta_data jsonb DEFAULT '{}');
  CREATE TRIGGER trg_create_profile_on_signup AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  CREATE TRIGGER trg_record_registration_terms AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.record_registration_terms();`;

test('Google membership completion is atomic, validated and cannot bypass registration or change existing roles', async t => {
  await auditIsolatedPolicies(snapshot, { migrations: [accessMigration, fakeAuth, migration], onlyVerify: true, verify: async (db, ids) => {
    await db.query('INSERT INTO registration_terms_documents(version,document) VALUES($1,$2)', [document.version, JSON.stringify(document)]);
    await db.query('INSERT INTO registration_terms_policy(singleton,version,enforce_acceptance) VALUES(true,$1,true)', [document.version]);
    await db.exec("INSERT INTO site_settings(key,value) VALUES('site_name','Example Brand'),('admin_contact_email','help@example.test'),('admin_contact_phone','+254700000000') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
    const count = async sql => Number((await db.query(sql)).rows[0].count);
    const asUser = async (id, role = 'authenticated') => {
      await db.exec('RESET ROLE');
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true)", [id, role]);
      await db.exec(`SET LOCAL ROLE ${role}`);
    };
    const newGoogle = async (id = google, confirmed = true) => {
      await db.exec('RESET ROLE');
      await db.query(`INSERT INTO auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
        VALUES($1,$2,$3,'{"provider":"google"}','{"full_name":"Google Member","role":"admin","terms_accepted":true}')`,
      [id, `${id}@example.test`, confirmed ? new Date().toISOString() : null]);
      await asUser(id);
    };
    const complete = (values = {}) => {
      const p = { role: 'driver', name: 'Google Member', phone: '+254712345678', location: 'Ongata Rongai', languages: ['English', 'Swahili'], version: document.version, accept: true, ...values };
      return db.query('SELECT complete_google_registration($1,$2,$3,$4,$5,$6,$7) AS id', [p.role,p.name,p.phone,p.location,p.languages,p.version,p.accept]);
    };
    const denied = async (fn, pattern) => {
      await db.exec('SAVEPOINT expected_denial');
      try { await assert.rejects(fn, pattern || (error => ['42501','P0001'].includes(error.code))); }
      finally { await db.exec('ROLLBACK TO SAVEPOINT expected_denial; RELEASE SAVEPOINT expected_denial'); }
    };
    const check = async (name, fn) => t.test(name, async () => {
      await db.exec('BEGIN');
      try { await fn(); } finally { await db.exec('ROLLBACK'); }
    });
    await check('Google authentication alone does not create a public profile or imply terms acceptance', async () => {
      await newGoogle();
      assert.equal((await db.query('SELECT google_registration_pending() AS pending')).rows[0].pending, true);
      assert.equal((await db.query('SELECT * FROM get_my_profile()')).rows.length, 0);
      assert.equal(await count('SELECT count(*) FROM registration_terms_acceptances'), 0);
      await denied(() => db.query("INSERT INTO profiles(id,role,full_name) VALUES($1,'owner','Bypass Member')", [google]));
      await denied(() => db.query("INSERT INTO profiles(id,role,full_name) VALUES($1,'owner','Bypass Member') ON CONFLICT(id) DO UPDATE SET full_name=excluded.full_name", [google]));
    });
    await check('driver completes once, keeps authenticated email and remains subject to driver onboarding', async () => {
      await newGoogle();
      assert.equal((await complete()).rows[0].id, google);
      const p = (await db.query('SELECT * FROM get_my_profile()')).rows[0];
      assert.equal(p.role, 'driver'); assert.equal(p.email, `${google}@example.test`);
      assert.equal(p.phone, '+254712345678'); assert.equal(p.onboarding_completed, false);
      assert.equal(p.is_verified, false);
      assert.equal((await db.query('SELECT google_registration_pending() AS pending')).rows[0].pending, false);
      const receipt = (await db.query('SELECT * FROM registration_terms_acceptances')).rows[0];
      assert.equal(receipt.version, document.version); assert.equal(receipt.site_name, 'Example Brand');
      assert.ok(new Date(receipt.accepted_at).getFullYear() >= 2026);
      await denied(() => complete({ role: 'owner' }), /already complete/);
      assert.equal((await db.query('SELECT role FROM get_my_profile()')).rows[0].role, 'driver');
    });
    await check('owners choose their correct role and no password is required', async () => {
      await newGoogle(); await complete({ role: 'owner' });
      const p = (await db.query('SELECT * FROM get_my_profile()')).rows[0];
      assert.equal(p.role, 'owner'); assert.equal(p.onboarding_completed, true);
    });
    await check('all required fields, role allowlist, distinct languages and terms are enforced by the database', async () => {
      await newGoogle();
      for (const values of [{ role: 'admin' },{ role: null },{ name: 'Single' },{ name: 'A B' },{ name: null },{ phone: 'bad' },{ phone: null },{ location: '' },{ languages: ['English',' english '] },{ languages: null },{ version: 'old' },{ version: null },{ accept: false },{ accept: null }]) {
        await denied(() => complete(values));
      }
      assert.equal((await db.query('SELECT * FROM get_my_profile()')).rows.length, 0);
      assert.equal(await count('SELECT count(*) FROM registration_terms_acceptances'), 0);
      await complete();
    });
    await check('duplicate phone is rejected without leaving half-created membership or acceptance', async () => {
      await newGoogle(); await complete();
      await newGoogle(secondGoogle);
      await denied(() => complete(), /phone number is already registered/);
      assert.equal((await db.query('SELECT * FROM get_my_profile()')).rows.length, 0);
      assert.equal(await count('SELECT count(*) FROM registration_terms_acceptances'), 0);
      await complete({ phone: '+254723456789' });
    });
    await check('anonymous and unconfirmed sessions cannot complete Google registration', async () => {
      await newGoogle(google, false);
      await denied(() => complete(), /confirmed Google/);
      await asUser('', 'anon');
      await denied(() => complete());
    });
    await check('existing Google/member/admin profiles cannot be overwritten by completion', async () => {
      for (const id of [ids.owner, ids.driver, ids.admin]) {
        await db.exec('RESET ROLE');
        await db.query("INSERT INTO auth.users(id,email,email_confirmed_at,raw_app_meta_data) VALUES($1,'existing@example.test',now(),'{\"provider\":\"google\"}')", [id]);
        await asUser(id);
        const before = (await db.query('SELECT role,full_name FROM get_my_profile()')).rows[0];
        await denied(() => complete(), /already complete/);
        assert.deepEqual((await db.query('SELECT role,full_name FROM get_my_profile()')).rows[0], before);
      }
    });
    await check('email signup still creates its profile and receipt; fake Google user metadata cannot skip acceptance', async () => {
      await denied(() => db.query("INSERT INTO auth.users(id,raw_app_meta_data,raw_user_meta_data) VALUES($1,'{\"provider\":\"email\"}','{\"provider\":\"google\"}')", [google]), /Accept the current/);
      await db.query("INSERT INTO auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) VALUES($1,'email@example.test',now(),'{\"provider\":\"email\"}',$2)", [google, JSON.stringify({role:'owner', full_name:'Email Member', phone:'+254712345678',location:'Rongai',languages:['English','Swahili'],terms_accepted:true,terms_version:document.version})]);
      await asUser(google);
      assert.equal((await db.query('SELECT role FROM get_my_profile()')).rows[0].role, 'owner');
      assert.equal(await count('SELECT count(*) FROM registration_terms_acceptances'), 1);
      await denied(() => complete(), /confirmed Google/);
    });
    await check('terms receipt uses current admin branding and clients cannot forge or rewrite it', async () => {
      await db.exec("UPDATE site_settings SET value='Updated Brand' WHERE key='site_name'");
      await newGoogle(); await complete();
      assert.equal((await db.query('SELECT site_name FROM registration_terms_acceptances')).rows[0].site_name, 'Updated Brand');
      await denied(() => db.exec("UPDATE registration_terms_acceptances SET version='old'"));
      await denied(() => db.query("INSERT INTO registration_terms_acceptances(user_id,version,site_name,support_email,support_phone) VALUES($1,$2,'Fake','','')", [secondGoogle,document.version]));
    });
  }});
});

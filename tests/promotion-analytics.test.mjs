import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('promotion tracking: privacy, deduplication, expiry, and listing preservation', async () => {
  const db = new PGlite();
  const owner = '10000000-0000-4000-8000-000000000001';
  const viewer = '10000000-0000-4000-8000-000000000002';
  const admin = '10000000-0000-4000-8000-000000000003';
  const car = '20000000-0000-4000-8000-000000000001';
  const campaign = '30000000-0000-4000-8000-000000000001';
  const visitor = '40000000-0000-4000-8000-000000000001';
  const asUser = async id => db.query("SELECT set_config('request.uid',$1,false)", [id]);
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.uid',true),'')::uuid $$;
      CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(auth.uid()='${admin}'::uuid,false) $$;
      CREATE TABLE profiles(id uuid PRIMARY KEY,role text,is_suspended boolean DEFAULT false,document_listing_visibility text DEFAULT 'public',onboarding_completed boolean DEFAULT true);
      CREATE TABLE vehicles(id uuid PRIMARY KEY,status text DEFAULT 'active',approval_status text DEFAULT 'approved',deleted_at timestamptz,document_listing_visibility text DEFAULT 'public');
      CREATE TABLE promotion_settings(id boolean,enabled boolean);
      CREATE TABLE promotion_requests(id uuid PRIMARY KEY,user_id uuid,kind text,vehicle_id uuid,status text,starts_at timestamptz,expires_at timestamptz);
      INSERT INTO profiles(id,role) VALUES('${owner}','owner'),('${viewer}','driver'),('${admin}','admin');
      INSERT INTO vehicles(id) VALUES('${car}');
      INSERT INTO promotion_settings VALUES(true,true);
      INSERT INTO promotion_requests VALUES('${campaign}','${owner}','listing','${car}','active',now()-interval '1 day',now()+interval '1 day');
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/20260903000000_promotion_analytics.sql', import.meta.url), 'utf8'));
    const record = () => db.query('SELECT record_promotion_event($1,$2,$3)', [campaign, visitor, 'click']);
    await asUser(owner); await record();
    await asUser(admin); await record();
    assert.equal((await db.query('SELECT count(*)::int AS n FROM promotion_events')).rows[0].n, 0);
    await asUser(''); await record(); await record();
    assert.equal((await db.query('SELECT count(*)::int AS n FROM promotion_events')).rows[0].n, 2);
    await asUser(viewer);
    assert.equal((await db.query('SELECT * FROM promotion_analytics()')).rows.length, 0);
    await asUser(owner);
    const metrics = (await db.query('SELECT * FROM promotion_analytics()')).rows[0];
    assert.equal(Number(metrics.reach), 1); assert.equal(Number(metrics.clicks), 1);
    await asUser(admin);
    assert.equal((await db.query('SELECT * FROM promotion_analytics()')).rows.length, 1);
    await db.exec('SET ROLE authenticated');
    await assert.rejects(db.query('SELECT * FROM promotion_events'), /permission denied/);
    await db.exec('RESET ROLE');
    for (const change of ["UPDATE promotion_settings SET enabled=false", "UPDATE vehicles SET approval_status='pending'", "UPDATE profiles SET is_suspended=true WHERE role='owner'", "UPDATE vehicles SET document_listing_visibility='private'"]) {
      await db.exec('BEGIN'); await db.exec(change);
      assert.equal((await db.query('SELECT * FROM live_promotions()')).rows.length, 0);
      assert.equal((await db.query('SELECT * FROM active_promotion_targets()')).rows.length, 0);
      await db.exec('ROLLBACK');
    }
    await db.exec("UPDATE promotion_requests SET expires_at=now()");
    assert.equal((await db.query('SELECT * FROM live_promotions()')).rows.length, 0);
    assert.equal((await db.query('SELECT * FROM active_promotion_targets()')).rows.length, 0);
    await asUser('');
    await db.query('SELECT record_promotion_event($1,$2,$3)', [campaign, viewer, 'click']);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM promotion_events')).rows[0].n, 2);
    assert.equal((await db.query('SELECT status FROM vehicles')).rows[0].status, 'active');
    assert.equal((await db.query('SELECT * FROM promotion_requests')).rows.length, 1);
  } finally { await db.close(); }
});

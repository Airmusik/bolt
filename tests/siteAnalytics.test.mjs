import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import handler from '../api/analytics.js';

test('analytics aggregation is admin-only; visits are validated, deduplicated and counted separately from presence', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY, last_sign_in_at timestamptz);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT null::uuid';
      CREATE TABLE profiles(id uuid, role text, created_at timestamptz);
      CREATE TABLE vehicles(created_at timestamptz);
      CREATE TABLE connections(created_at timestamptz);
      CREATE FUNCTION is_admin() RETURNS boolean LANGUAGE sql AS 'SELECT false';`);
    await db.exec(readFileSync(new URL('../supabase/migrations/20260904010000_site_analytics.sql', import.meta.url), 'utf8'));
    await assert.rejects(db.query(`SELECT admin_site_analytics(current_date,current_date)`), /Administrator access/);
    const session = '00000000-0000-4000-8000-000000000001';
    await db.query(`SELECT record_site_visit($1,'/browse-cars',true,'KE')`, [session]);
    await db.query(`SELECT record_site_visit($1,'/browse-cars',true,'KE')`, [session]);
    await db.query(`SELECT record_site_visit($1,'/chat/private-id?token=secret',true,'KE')`, [session]);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM site_visits')).rows[0].count, 1);
    await db.exec(`UPDATE site_visits SET created_at=now()-interval '2 minutes'`);
    await db.query(`SELECT record_site_visit($1,'/browse-cars',false,'KE')`, [session]);
    await db.exec(`CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean LANGUAGE sql AS 'SELECT true';`);
    const report = (await db.query(`SELECT admin_site_analytics(current_date-1,current_date) AS report`)).rows[0].report;
    assert.equal(report.views, 1); assert.equal(report.sessions, 1); assert.equal(report.countries[0].country, 'KE');
    await db.query(`SELECT record_site_visit($1,'/browse-cars',true,'KE')`, ['00000000-0000-4000-8000-000000000002']);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM site_visits')).rows[0].count, 2);
    await assert.rejects(db.query(`SELECT admin_site_analytics(current_date,current_date-1)`), /valid range/);
    await db.exec('SET ROLE anon');
    await assert.rejects(db.query('SELECT * FROM site_visits'), /permission denied/);
  } finally { await db.close(); }
});

test('collection endpoint refuses cross-origin writes and non-POST requests', async () => {
  const res = { code: 0, setHeader() {}, status(code) { this.code = code; return this; }, end() {} };
  await handler({ method: 'GET', headers: {} }, res); assert.equal(res.code, 405);
  await handler({ method: 'POST', headers: { origin: 'https://example.org' } }, res); assert.equal(res.code, 403);
});

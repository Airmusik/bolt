import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('photo and document security checks use their own row fields and keep upload limits', async () => {
  const db = new PGlite();
  const owner = '10000000-0000-4000-8000-000000000001';
  const other = '10000000-0000-4000-8000-000000000002';
  const vehicle = '20000000-0000-4000-8000-000000000001';
  const otherVehicle = '20000000-0000-4000-8000-000000000002';
  try {
    await db.exec(`
      CREATE TABLE site_settings(key text PRIMARY KEY, value text);
      CREATE TABLE vehicles(id uuid PRIMARY KEY, owner_id uuid);
      CREATE TABLE vehicle_photos(id uuid DEFAULT gen_random_uuid(), vehicle_id uuid REFERENCES vehicles(id), approved boolean DEFAULT false, created_at timestamptz DEFAULT now());
      CREATE TABLE documents(id uuid DEFAULT gen_random_uuid(), user_id uuid, created_at timestamptz DEFAULT now());
      CREATE TABLE security_events(user_id uuid, event_type text, severity text, summary text, details jsonb);
      CREATE FUNCTION security_setting_on(k text, fallback boolean) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce((SELECT value='true' FROM site_settings WHERE key=k),fallback) $$;
      CREATE FUNCTION add_security_event(u uuid,t text,s text,m text,d jsonb) RETURNS void LANGUAGE sql AS $$ INSERT INTO security_events VALUES(u,t,s,m,d) $$;
    `);
    await db.query('INSERT INTO vehicles VALUES($1,$2),($3,$4)', [vehicle, owner, otherVehicle, other]);
    const original = await readFile(new URL('../supabase/migrations/20260908230000_security_centre.sql', import.meta.url), 'utf8');
    const start = original.indexOf('CREATE OR REPLACE FUNCTION public.security_upload_monitor()');
    const end = original.indexOf('CREATE OR REPLACE FUNCTION public.register_security_device', start);
    assert.ok(start >= 0 && end > start);
    await db.exec(original.slice(start, end));
    await assert.rejects(db.query('INSERT INTO vehicle_photos(vehicle_id) VALUES($1)', [vehicle]), /record "new" has no field "user_id"/);

    await db.exec(await readFile(new URL('../supabase/migrations/20260909010000_fix_vehicle_upload_security_guard.sql', import.meta.url), 'utf8'));
    assert.equal((await db.query('INSERT INTO vehicle_photos(vehicle_id) VALUES($1) RETURNING approved', [vehicle])).rows[0].approved, false);
    await db.query('INSERT INTO documents(user_id) VALUES($1)', [owner]);
    // Alternate table types within the same session to exercise cached trigger plans.
    await db.query('INSERT INTO vehicle_photos(vehicle_id) VALUES($1)', [otherVehicle]);
    await db.query('INSERT INTO documents(user_id) VALUES($1)', [other]);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM security_events')).rows[0].count, 0);

    await db.query("INSERT INTO vehicle_photos(vehicle_id,created_at) VALUES($1,now()-interval '2 hours')", [vehicle]);
    await db.query('INSERT INTO vehicle_photos(vehicle_id) SELECT $1 FROM generate_series(1,19)', [vehicle]);
    await db.query('INSERT INTO vehicle_photos(vehicle_id) VALUES($1)', [vehicle]);
    const alert = (await db.query('SELECT * FROM security_events')).rows[0];
    assert.equal(alert.user_id, owner);
    assert.deepEqual(alert.details, { count: 20, area: 'vehicle_photos' });

    await db.exec("INSERT INTO site_settings VALUES('security_auto_restrictions','true')");
    await assert.rejects(db.query('INSERT INTO vehicle_photos(vehicle_id) VALUES($1)', [vehicle]), /Uploads are temporarily paused/);
    await db.query('INSERT INTO vehicle_photos(vehicle_id) VALUES($1)', [otherVehicle]);
    await db.query('INSERT INTO documents(user_id) SELECT $1 FROM generate_series(1,19)', [owner]);
    await assert.rejects(db.query('INSERT INTO documents(user_id) VALUES($1)', [owner]), /Uploads are temporarily paused/);
    await db.exec("INSERT INTO site_settings VALUES('security_upload_validation','false')");
    await db.query('INSERT INTO vehicle_photos(vehicle_id) VALUES($1)', [vehicle]);
    await db.query('INSERT INTO documents(user_id) VALUES($1)', [owner]);
  } finally {
    await db.close();
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Isolated PostgreSQL engine: no network, real member records or payments.
// The fixture models the pre-existing tables/functions needed by these migrations.
test('listing, private standing, promotion and driver approval database workflows', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO authenticated,anon;
      CREATE TABLE profiles(id uuid PRIMARY KEY, role text DEFAULT 'owner', full_name text DEFAULT 'Test Member', email text DEFAULT 'private@example.test', phone text DEFAULT 'private', avatar_url text,bio text,location text DEFAULT 'Nairobi',preferred_locations text[],availability text DEFAULT 'available',languages text[],age integer,driving_experience_years integer DEFAULT 1,platforms_worked text[],is_verified boolean DEFAULT false,verification_status text DEFAULT 'unverified',is_suspended boolean DEFAULT false,rating numeric DEFAULT 5,rating_count integer DEFAULT 0,onboarding_completed boolean DEFAULT true,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      CREATE FUNCTION is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin') $$;
      CREATE TABLE vehicles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid REFERENCES profiles(id), make text DEFAULT 'Toyota',model text DEFAULT 'Vitz',status text DEFAULT 'active',approval_status text DEFAULT 'approved',created_at timestamptz DEFAULT now());
      CREATE TABLE vehicle_photos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),vehicle_id uuid REFERENCES vehicles(id),position integer,approved boolean);
      CREATE TABLE vehicle_issues(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),vehicle_id uuid REFERENCES vehicles(id));
      CREATE TABLE connections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),requester_id uuid REFERENCES profiles(id),recipient_id uuid REFERENCES profiles(id),vehicle_id uuid,status text DEFAULT 'pending');
      CREATE TABLE applications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),driver_id uuid,owner_id uuid,vehicle_id uuid,status text DEFAULT 'pending');
      CREATE TABLE conversations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),vehicle_id uuid,connection_id uuid);
      CREATE TABLE site_settings(key text PRIMARY KEY,value text);
      CREATE TABLE reports(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),reported_id uuid,reporter_id uuid,reason text,description text,status text,created_at timestamptz DEFAULT now());
      CREATE TABLE reviews(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),reviewee_id uuid,rating numeric);
      CREATE TABLE user_warnings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,message text,report_reason text,report_description text,created_at timestamptz DEFAULT now());
      CREATE TABLE notifications(id uuid DEFAULT gen_random_uuid(),user_id uuid,type text,title text,body text,data jsonb);
      CREATE TABLE driver_platform_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),driver_id uuid REFERENCES profiles(id),approved boolean DEFAULT false,proof_url text,months_active integer DEFAULT 0);
      CREATE FUNCTION request_connection(p_recipient_id uuid,p_message text DEFAULT NULL,p_vehicle_id uuid DEFAULT NULL) RETURNS connections LANGUAGE plpgsql SECURITY DEFINER AS $$ DECLARE r connections%ROWTYPE; BEGIN INSERT INTO connections(requester_id,recipient_id,vehicle_id) VALUES(auth.uid(),p_recipient_id,p_vehicle_id) RETURNING * INTO r; RETURN r; END $$;
      CREATE FUNCTION set_my_availability(p_available boolean) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN UPDATE profiles SET availability=CASE WHEN p_available THEN 'available' ELSE 'unavailable' END WHERE id=auth.uid(); RETURN 0; END $$;
      GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
      GRANT SELECT ON vehicles,vehicle_photos,vehicle_issues TO anon;
      GRANT SELECT(id,role,full_name,avatar_url,bio,location,preferred_locations,availability,languages,age,driving_experience_years,platforms_worked,is_verified,verification_status,is_suspended,rating,rating_count,onboarding_completed,created_at,updated_at) ON profiles TO anon;
    `);
    for (const name of ['20260902160000_listing_controls_and_promotions.sql', '20260902162000_driver_history_connection_gate.sql', '20260902163000_promoted_discovery.sql', '20260902164000_driver_discovery_approval.sql']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
    }
    const admin = '10000000-0000-4000-8000-000000000001', owner = '10000000-0000-4000-8000-000000000002', driver = '10000000-0000-4000-8000-000000000003', other = '10000000-0000-4000-8000-000000000004';
    const asUser = async (id, role = 'authenticated') => { await db.exec('RESET ROLE'); await db.query("SELECT set_config('test.uid',$1,false)",[id]); await db.exec(`SET ROLE ${role}`); };
    const scalar = async (sql, args = []) => (await db.query(sql,args)).rows[0]?.value;
    await db.query("INSERT INTO profiles(id,role) VALUES ($1,'admin'),($2,'owner'),($3,'driver'),($4,'owner')",[admin,owner,driver,other]);
    await asUser(owner);
    const cars = (await db.query('INSERT INTO vehicles(owner_id) SELECT $1 FROM generate_series(1,3) RETURNING id',[owner])).rows.map(r => r.id);
    assert.deepEqual(await scalar('SELECT my_listing_capacity() AS value'), { used: 3, limit: 3 });
    await assert.rejects(db.query('INSERT INTO vehicles(owner_id) VALUES ($1)',[owner]), /Listing limit reached/);
    await assert.rejects(db.query('INSERT INTO owner_listing_limits(owner_id,max_listings) VALUES ($1,10)',[owner]), /row-level security/);
    await asUser(admin);
    await db.query('INSERT INTO owner_listing_limits(owner_id,max_listings) VALUES ($1,4)',[owner]);
    await asUser(owner);
    await db.query('INSERT INTO vehicles(owner_id) VALUES ($1)',[owner]);
    await assert.rejects(db.query('UPDATE vehicles SET deleted_at=now() WHERE id=$1',[cars[0]]), /delete listing action/);
    await db.query('INSERT INTO conversations(vehicle_id) VALUES ($1)',[cars[0]]);
    await db.query('SELECT delete_my_vehicle($1)',[cars[0]]);
    assert.equal(await scalar('SELECT count(*)::int AS value FROM conversations WHERE vehicle_id=$1',[cars[0]]),1);
    assert.equal((await scalar('SELECT my_listing_capacity() AS value')).used,3);
    await assert.rejects(db.query('UPDATE vehicles SET status=\'active\' WHERE id=$1',[cars[0]]), /deleted/);
    await assert.rejects(db.query('INSERT INTO applications(driver_id,vehicle_id) VALUES($1,$2)',[driver,cars[0]]), /platform history|no longer available/);

    await asUser(driver);
    await assert.rejects(db.query('SELECT request_connection($1)',[owner]), /Submit your recent platform history/);
    await assert.rejects(db.query('SELECT set_my_availability(false)'), /Submit your recent platform history/);
    await assert.rejects(db.query('SELECT set_my_availability_before_history_gate(false)'), /permission denied/);
    await assert.rejects(db.query("UPDATE profiles SET availability='unavailable' WHERE id=$1",[driver]), /locked/);
    const proof = (await db.query("INSERT INTO driver_platform_history(driver_id,months_active,proof_url) VALUES ($1,12,'private-proof') RETURNING id",[driver])).rows[0].id;
    await assert.rejects(db.query('SELECT request_connection($1)',[owner]), /awaiting admin approval/);
    await asUser(admin);
    await db.query('UPDATE driver_platform_history SET approved=true WHERE id=$1',[proof]);
    await asUser(driver);
    const connection = (await db.query('SELECT (request_connection($1)).id AS id',[owner])).rows[0].id;
    await db.query("UPDATE connections SET status='accepted',vehicle_id=$2 WHERE id=$1",[connection,cars[1]]);
    await db.query('INSERT INTO conversations(vehicle_id,connection_id) VALUES($1,$2)',[cars[1],connection]);
    await asUser(owner);
    await assert.rejects(db.query('SELECT delete_my_vehicle($1)',[cars[1]]),/End the active connection/);
    await asUser(admin);
    await db.query('UPDATE driver_platform_history SET approved=false WHERE id=$1',[proof]);
    await asUser(driver);
    await assert.rejects(db.query("INSERT INTO connections(requester_id,recipient_id,status) VALUES($1,$2,'accepted')",[driver,other]), /awaiting admin approval/);
    await db.query("UPDATE connections SET status='ended' WHERE id=$1",[connection]);

    await asUser(owner);
    await assert.rejects(db.query("SELECT request_promotion('listing',$1)",[cars[1]]), /not currently available/);
    await db.query('UPDATE promotion_settings SET enabled=true');
    assert.equal(await scalar('SELECT enabled AS value FROM promotion_settings'),false);
    await asUser(admin);
    await db.exec("UPDATE promotion_settings SET enabled=true,listing_price=400.50,profile_price=250,duration_days=7,payment_method='Test transfer',payment_instructions='Test account. No real payment.'");
    await asUser(owner);
    const promotion = (await db.query("SELECT (request_promotion('listing',$1)).*",[cars[1]])).rows[0];
    assert.equal(Number(promotion.amount),400.5);
    assert.equal(promotion.status,'awaiting_payment');
    assert.equal((await db.query("SELECT (request_promotion('listing',$1)).id AS id",[cars[1]])).rows[0].id,promotion.id);
    await assert.rejects(db.query("UPDATE promotion_requests SET status='active' WHERE id=$1",[promotion.id]),/permission denied/);
    await db.query('SELECT submit_promotion_payment($1,$2)',[promotion.id,'TEST-PAID-1']);
    await db.query('SELECT submit_promotion_payment($1,$2)',[promotion.id,'TEST-PAID-1']); // idempotent retry
    await asUser(other);
    assert.equal((await db.query('SELECT * FROM promotion_requests')).rows.length,0);
    await assert.rejects(db.query("SELECT review_promotion($1,'approve')",[promotion.id]), /Administrator/);
    await asUser(admin);
    await db.query("SELECT review_promotion($1,'approve')",[promotion.id]);
    await asUser('', 'anon');
    const publicCars = await scalar('SELECT discover_vehicles(1) AS value');
    assert.equal(publicCars[0].id,cars[1]); assert.equal(publicCars[0].sponsored,true);
    assert.ok(!('email' in publicCars[0].owner)); assert.ok(!('phone' in publicCars[0].owner));
    const publicDrivers = await scalar('SELECT discover_drivers(10) AS value');
    assert.ok(!('email' in publicDrivers[0])); assert.equal(publicDrivers[0].platform_history_approved,false);
    assert.deepEqual(await scalar('SELECT discover_drivers(10,true) AS value'),[]);
    await assert.rejects(db.query('SELECT * FROM promotion_requests'), /permission denied/);
    await asUser(admin,'postgres');
    await db.query("UPDATE promotion_requests SET expires_at=now()-interval '1 second' WHERE id=$1",[promotion.id]);
    assert.equal((await db.query('SELECT * FROM active_promotion_targets()')).rows.length,0);

    await db.query("INSERT INTO reports(reported_id,reporter_id,reason,description,status) VALUES($1,$2,'Conduct','Private incident','resolved')",[owner,driver]);
    await db.query("INSERT INTO user_warnings(user_id,message,report_reason) VALUES($1,'Three warnings may lead to suspension','Conduct')",[owner]);
    await asUser(owner);
    const standing = await scalar('SELECT my_account_standing() AS value');
    assert.equal(standing.reports.length,1); assert.equal(standing.warnings.length,1);
    assert.ok(!('reporter_id' in standing.reports[0]));
    await asUser(other);
    assert.equal((await scalar('SELECT my_account_standing() AS value')).warnings.length,0);
  } finally { await db.close(); }
});

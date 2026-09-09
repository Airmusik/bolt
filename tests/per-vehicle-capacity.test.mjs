import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('owners manage individual live cars while drivers and cars keep single-connection capacity', async (t) => {
  const db = new PGlite();
  const owner='10000000-0000-4000-8000-000000000001', otherOwner='10000000-0000-4000-8000-000000000002';
  const drivers=[3,4,5,6,7].map(n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0'));
  const asUser=async id=>{await db.exec('RESET ROLE');await db.query("SELECT set_config('test.uid',$1,false)",[id]);await db.exec('SET ROLE authenticated');};
  const val=async (sql,args=[]) => (await db.query(sql,args)).rows[0];
  const car=async id=>val('SELECT * FROM vehicles WHERE id=$1',[id]);
  const member=async id=>val('SELECT * FROM profiles WHERE id=$1',[id]);
  const request=async (driver,vehicle)=>{await asUser(driver);return (await val('SELECT (request_connection($1,NULL,$2)).id',[owner,vehicle])).id;};
  const accept=async id=>{await asUser(owner);return (await val("SELECT transition_connection($1,'accepted') AS id",[id])).id;};
  try {
    await db.exec(await readFile(new URL('./fixtures/per-vehicle-baseline.sql',import.meta.url),'utf8'));
    await db.query("INSERT INTO profiles(id,role) VALUES ($1,'owner'),($2,'owner')",[owner,otherOwner]);
    for(const id of drivers) await db.query("INSERT INTO profiles(id,role) VALUES ($1,'driver')",[id]);
    const cars=(await db.query('INSERT INTO vehicles(owner_id) SELECT $1 FROM generate_series(1,5) RETURNING id',[owner])).rows.map(r=>r.id);
    await db.exec(await readFile(new URL('../supabase/migrations/20260909160000_per_vehicle_listing_availability.sql',import.meta.url),'utf8'));
    let first, firstChat, second, competing, app, appChat;
    await t.test('live toggle enforces ownership, approval and admin privacy',async()=>{
      await asUser(otherOwner);
      await assert.rejects(db.query('SELECT set_my_vehicle_live($1,false)',[cars[0]]),/Listing not found/);
      await asUser(owner);
      await db.query("UPDATE vehicles SET approval_status='pending' WHERE id=$1",[cars[4]]);
      await db.query('SELECT set_my_vehicle_live($1,false)',[cars[4]]);
      await assert.rejects(db.query('SELECT set_my_vehicle_live($1,true)',[cars[4]]),/admin approval/);
      await db.query("UPDATE vehicles SET approval_status='approved',document_listing_visibility='private' WHERE id=$1",[cars[4]]);
      await assert.rejects(db.query('SELECT set_my_vehicle_live($1,true)',[cars[4]]),/Contact support/);
      await db.query("UPDATE vehicles SET document_listing_visibility='public' WHERE id=$1",[cars[4]]);
      await db.query('SELECT set_my_vehicle_live($1,true)',[cars[4]]);
      assert.equal((await car(cars[4])).status,'active');
      await db.query('SELECT set_my_vehicle_live($1,false)',[cars[4]]);
      await assert.rejects(request(drivers[0],cars[4]),/not live/);
    });
    await t.test('acceptance reserves one car and driver, not the owner',async()=>{
      first=await request(drivers[0],cars[0]); firstChat=await accept(first);
      assert.equal((await car(cars[0])).status,'closed');
      assert.equal((await car(cars[1])).status,'active');
      assert.equal((await member(drivers[0])).availability,'busy');
      assert.equal((await member(owner)).availability,'available');
      competing=await request(drivers[2],cars[1]);
      second=await request(drivers[1],cars[1]); await accept(second);
      assert.equal((await val("SELECT count(*)::int AS n FROM connections WHERE status='accepted'")).n,2);
      await assert.rejects(accept(competing),/car is already on a connection/);
    });
    await t.test('busy driver cannot evade capacity or select another owner\'s car',async()=>{
      await asUser(drivers[0]);
      await db.query("UPDATE profiles SET availability='available' WHERE id=$1",[drivers[0]]);
      await assert.rejects(db.query('SELECT request_connection($1,NULL,$2)',[otherOwner,cars[2]]),/already on a connection|must belong/);
      await asUser(drivers[4]);
      await assert.rejects(db.query('SELECT request_connection($1,NULL,$2)',[otherOwner,cars[2]]),/must belong/);
      await assert.rejects(db.query('SELECT request_connection($1)',[owner]),/Choose a live car/);
      await db.query('UPDATE profiles SET platform_history_approved=false WHERE id=$1',[drivers[4]]);
      await assert.rejects(request(drivers[4],cars[2]),/platform history/);
      await db.query('UPDATE profiles SET platform_history_approved=true WHERE id=$1',[drivers[4]]);
    });
    await t.test('applications and connections share capacity without limiting other cars',async()=>{
      const pending=await request(drivers[3],cars[2]);
      await asUser(drivers[2]);
      app=(await val('INSERT INTO applications(driver_id,owner_id,vehicle_id) VALUES($1,$2,$3) RETURNING id',[drivers[2],owner,cars[2]])).id;
      await asUser(owner); appChat=(await val("SELECT transition_application($1,'accepted') AS id",[app])).id;
      assert.equal((await car(cars[2])).status,'closed');
      assert.equal((await member(drivers[2])).availability,'busy');
      await assert.rejects(accept(pending),/car is already on a connection/);
      await asUser(drivers[3]);
      await assert.rejects(db.query('INSERT INTO applications(driver_id,owner_id,vehicle_id) VALUES($1,$2,$3)',[drivers[3],owner,cars[0]]),/car is already on a connection/);
    });
    await t.test('pause is local, existing chats survive, booked car cannot be republished',async()=>{
      await asUser(owner);
      await db.query('SELECT set_my_vehicle_live($1,false)',[cars[3]]);
      await db.query('SELECT set_my_vehicle_live($1,false)',[cars[0]]);
      assert.equal((await val('SELECT closed_at FROM conversations WHERE id=$1',[firstChat])).closed_at,null);
      assert.equal((await val('SELECT status FROM connections WHERE id=$1',[second])).status,'accepted');
      await assert.rejects(db.query('SELECT set_my_vehicle_live($1,true)',[cars[0]]),/active connection/);
      await assert.rejects(db.query("UPDATE vehicles SET status='active' WHERE id=$1",[cars[0]]),/active connection/);
      await assert.rejects(db.query('SELECT set_my_availability(true)'),/Manage each car/);
      assert.equal((await val('SELECT status FROM connections WHERE id=$1',[second])).status,'accepted');
    });
    await t.test('ending one arrangement preserves all histories and requires deliberate relisting',async()=>{
      await asUser(drivers[0]); await db.query('SELECT end_connection($1)',[first]);
      assert.ok((await val('SELECT closed_at FROM conversations WHERE id=$1',[firstChat])).closed_at);
      assert.equal((await member(drivers[0])).availability,'available');
      assert.equal((await car(cars[0])).status,'closed');
      assert.equal((await val('SELECT status FROM connections WHERE id=$1',[second])).status,'accepted');
      await asUser(owner); await db.query('SELECT set_my_vehicle_live($1,true)',[cars[0]]);
      assert.equal((await car(cars[0])).status,'active');
      await db.query("SELECT transition_application($1,'completed')",[app]);
      assert.ok((await val('SELECT closed_at FROM conversations WHERE id=$1',[appChat])).closed_at);
      assert.equal((await car(cars[2])).status,'closed');
      assert.equal((await member(drivers[2])).availability,'available');
    });
    await t.test('inner helpers cannot be invoked to bypass safeguards',async()=>{
      await asUser(owner);
      await assert.rejects(db.query('SELECT request_connection_before_history_gate($1,NULL,$2)',[drivers[4],cars[0]]),/permission denied/);
      await assert.rejects(db.query('SELECT refresh_member_availability($1)',[drivers[1]]),/permission denied/);
      await db.exec('RESET ROLE'); await db.query("SELECT set_config('test.uid','',false)");
      await assert.rejects(db.query('SELECT set_my_vehicle_live($1,true)',[cars[0]]),/Sign in/);
      await assert.rejects(db.query("SELECT transition_connection($1,'accepted')",[competing]),/Authentication required/);
    });
  } finally { await db.close(); }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
test('error reporting is bounded, private, admin-only to read, and cannot restrict accounts',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE profiles(id uuid,role text,is_suspended boolean);CREATE TABLE notifications(user_id uuid,type text,title text,body text,data jsonb);INSERT INTO profiles VALUES('00000000-0000-0000-0000-000000000001','admin',false);CREATE FUNCTION is_admin() RETURNS boolean LANGUAGE sql AS 'SELECT false';`);
    await db.exec(readFileSync('supabase/migrations/20260910100000_launch_diagnostics.sql','utf8'));
    await db.exec('SET ROLE anon');
    await assert.rejects(db.query('SELECT * FROM operations_private.client_diagnostics'),/permission denied/);
    await db.query("SELECT record_client_diagnostic('/chat/private-id','render','chrome','123abcd')");
    await db.query("SELECT record_client_diagnostic('/chat/detail','render','chrome','123abcd')");
    await db.query("SELECT record_client_diagnostic('/chat/detail','render','chrome','123abcd')");
    await db.exec('RESET ROLE');
    assert.equal((await db.query('SELECT hits FROM operations_private.client_diagnostics')).rows[0].hits,2);
    assert.equal((await db.query('SELECT count(*)::int n FROM notifications')).rows[0].n,1);
    await db.exec('SET ROLE authenticated');
    await assert.rejects(db.query('SELECT admin_client_diagnostics()'),/Administrator access/);
    await db.exec('RESET ROLE; UPDATE operations_private.client_diagnostics SET hits=1000');
    await db.query("SELECT record_client_diagnostic('/settings','runtime','safari','123abcd')");
    assert.equal((await db.query('SELECT count(*)::int n FROM operations_private.client_diagnostics')).rows[0].n,1);
    await db.exec("CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean LANGUAGE sql AS 'SELECT true'");
    const result=(await db.query('SELECT admin_client_diagnostics() result')).rows[0].result;
    assert.equal(result[0].hits,1000);assert.equal(result[0].route,'/chat/detail');
  } finally {await db.close();}
});

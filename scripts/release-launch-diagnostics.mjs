import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { readProjectEnvironment,connectProjectDatabase } from './db-connection.mjs';
if (!process.argv.includes('--apply')) throw new Error('Pass --apply only for an authorised diagnostics deployment.');
const sql=await readFile('supabase/migrations/20260910100000_launch_diagnostics.sql','utf8');
const db=await connectProjectDatabase(await readProjectEnvironment(),'release_launch_diagnostics');
try {
  await db.query('BEGIN');
  await db.query("SET LOCAL lock_timeout='5s'");
  await db.query(sql);
  const permissions=(await db.query("SELECT has_table_privilege('anon','operations_private.client_diagnostics','SELECT') anon_read,has_table_privilege('authenticated','operations_private.client_diagnostics','SELECT') member_read,has_function_privilege('anon','public.admin_client_diagnostics()','EXECUTE') anon_admin_call")).rows[0];
  assert.deepEqual(permissions,{anon_read:false,member_read:false,anon_admin_call:false});
  await db.query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,$3) ON CONFLICT(version) DO NOTHING',['20260910100000','launch_diagnostics',[sql]]);
  await db.query('COMMIT');
  console.log('Website diagnostics installed. Access checks passed. No test reports or notifications sent.');
} catch(error) {await db.query('ROLLBACK');throw error;} finally {await db.end();}

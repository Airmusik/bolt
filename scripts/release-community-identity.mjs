import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { readProjectEnvironment, connectProjectDatabase } from './db-connection.mjs';

if (!process.argv.includes('--apply')) throw new Error('Use --apply for an authorised community release.');
const env = await readProjectEnvironment();
assert.equal(new URL(env.VITE_SUPABASE_URL).hostname, 'bqgfrulkjibxunaofumx.supabase.co');
const version = '20260910150000';
const sql = await readFile(`supabase/migrations/${version}_community_posting_identity.sql`, 'utf8');
const db = await connectProjectDatabase(env, 'release_community_identity');
try {
  await db.query('BEGIN');
  await db.query("SET LOCAL lock_timeout='5s'");
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended('release_community_identity',0))");
  const before = (await db.query("SELECT value FROM site_settings WHERE key='community_enabled'")).rows[0].value;
  const applied = (await db.query('SELECT 1 FROM supabase_migrations.schema_migrations WHERE version=$1', [version])).rowCount;
  if (!applied) {
    await db.query(sql);
    await db.query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,$3)', [version,'community_posting_identity',[sql]]);
  }
  const access = (await db.query("SELECT has_function_privilege('anon','public.community_send(text,uuid,boolean)','EXECUTE') anon_send,has_function_privilege('authenticated','public.community_send(text,uuid,boolean)','EXECUTE') member_send,has_table_privilege('authenticated','operations_private.community_authors','SELECT') private_read,has_table_privilege('authenticated','public.community_messages','INSERT') direct_insert")).rows[0];
  assert.deepEqual(access, {anon_send:false,member_send:true,private_read:false,direct_insert:false});
  assert.equal((await db.query("SELECT pronargdefaults FROM pg_proc WHERE oid='public.community_send(text,uuid,boolean)'::regprocedure")).rows[0].pronargdefaults, 1);
  assert.equal((await db.query("SELECT has_function_privilege('anon','public.admin_community_action(text,uuid,text,integer,text)','EXECUTE') allowed")).rows[0].allowed,false);
  assert.equal((await db.query("SELECT pronargdefaults FROM pg_proc WHERE oid='public.admin_community_action(text,uuid,text,integer,text)'::regprocedure")).rows[0].pronargdefaults,4);
  assert.equal((await db.query("SELECT value FROM site_settings WHERE key='community_enabled'")).rows[0].value, before);
  await db.query('COMMIT');
  console.log(JSON.stringify({migration:version,alreadyApplied:!!applied,permissions:'passed',oldClientCompatibility:'passed',communitySettingPreserved:true,liveTestMessagesSent:0}));
} catch (error) {
  await db.query('ROLLBACK');
  console.error('Community identity migration rolled back:', error instanceof Error ? error.message : 'Unknown failure');
  process.exitCode=1;
} finally { await db.end(); }

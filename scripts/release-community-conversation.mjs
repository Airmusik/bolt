import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { readProjectEnvironment, connectProjectDatabase } from './db-connection.mjs';

if (!process.argv.includes('--apply')) throw new Error('Use --apply for an authorised release.');
const env = await readProjectEnvironment();
assert.equal(new URL(env.VITE_SUPABASE_URL).hostname, 'bqgfrulkjibxunaofumx.supabase.co');
const db = await connectProjectDatabase(env, 'release_community_conversation');
try {
  await db.query('BEGIN');
  await db.query("SET LOCAL lock_timeout='5s'");
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended('release_community_conversation',0))");
  const before = (await db.query("SELECT value FROM site_settings WHERE key='community_enabled'")).rows[0].value;
  const migrations = [
    ['20260910160000', 'community_guidelines_and_conversation'],
    ['20260910161000', 'active_admin_access'],
  ];
  const installed = [];
  for (const [version, name] of migrations) {
    const applied = (await db.query('SELECT 1 FROM supabase_migrations.schema_migrations WHERE version=$1', [version])).rowCount;
    if (!applied) {
      const sql = await readFile(`supabase/migrations/${version}_${name}.sql`, 'utf8');
      await db.query(sql);
      await db.query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,$3)', [version,name,[sql]]);
    }
    installed.push({version,alreadyApplied:!!applied});
  }
  const columns = (await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='community_messages' ORDER BY ordinal_position")).rows.map(row=>row.column_name);
  assert.deepEqual(columns, ['id','alias','member_role','body','created_at','removed','filtered','reply_to','reactions','pinned','revision']);
  for (const fn of ['community_accept_rules(text)','community_send(text,uuid,boolean,uuid)','community_my_reactions(uuid[])','community_react(uuid,text)','community_pin(uuid)','admin_community_action(text,uuid,text,integer,text)']) {
    const access = (await db.query("SELECT has_function_privilege('anon',$1,'EXECUTE') anon,has_function_privilege('authenticated',$1,'EXECUTE') member",[`public.${fn}`])).rows[0];
    assert.deepEqual(access,{anon:false,member:true});
  }
  assert.equal((await db.query("SELECT pronargdefaults FROM pg_proc WHERE oid='public.community_send(text,uuid,boolean,uuid)'::regprocedure")).rows[0].pronargdefaults,2);
  for (const table of ['community_members','community_authors','community_reactions','community_actions']) {
    for (const operation of ['SELECT','INSERT','UPDATE','DELETE']) assert.equal((await db.query("SELECT has_table_privilege('authenticated',$1,$2) allowed",[`operations_private.${table}`,operation])).rows[0].allowed,false);
  }
  assert.equal((await db.query("SELECT has_function_privilege('authenticated','operations_private.community_require_posting()','EXECUTE') allowed")).rows[0].allowed,false);
  assert.equal((await db.query("SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='operations_private' AND tablename LIKE 'community_%'")).rowCount,0);
  assert.equal((await db.query("SELECT has_table_privilege('authenticated','public.community_messages','INSERT') allowed")).rows[0].allowed,false);
  assert.match((await db.query("SELECT pg_get_functiondef('public.is_admin()'::regprocedure) definition")).rows[0].definition,/is_suspended/);
  assert.equal((await db.query("SELECT value FROM site_settings WHERE key='community_enabled'")).rows[0].value,before);
  await db.query('COMMIT');
  console.log(JSON.stringify({migrations:installed,permissions:'passed',publicFields:'sanitized only',communitySettingPreserved:true,liveTestMessagesSent:0}));
} catch (error) {
  await db.query('ROLLBACK');
  console.error('Community conversation release rolled back:', error instanceof Error ? error.message : 'Unknown failure');
  process.exitCode=1;
} finally { await db.end(); }

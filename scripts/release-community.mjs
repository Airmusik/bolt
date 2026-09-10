import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { readProjectEnvironment, connectProjectDatabase } from './db-connection.mjs';

if (!process.argv.includes('--apply')) throw new Error('Use --apply only for an authorised community deployment.');
const env = await readProjectEnvironment();
assert.equal(new URL(env.VITE_SUPABASE_URL).hostname, 'bqgfrulkjibxunaofumx.supabase.co', 'Unexpected project');
const version = '20260910130000';
const sql = await readFile(`supabase/migrations/${version}_anonymous_community.sql`, 'utf8');
const db = await connectProjectDatabase(env, 'release_anonymous_community');
try {
  await db.query('BEGIN');
  await db.query("SET LOCAL lock_timeout='5s'");
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended('release_anonymous_community',0))");
  const applied = (await db.query('SELECT 1 FROM supabase_migrations.schema_migrations WHERE version=$1', [version])).rowCount;
  if (!applied) {
    await db.query(sql);
    await db.query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,$3)', [version,'anonymous_community',[sql]]);
  }
  const columns = (await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='community_messages' ORDER BY ordinal_position")).rows.map(row=>row.column_name);
  const enhanced = (await db.query("SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260910160000'")).rowCount;
  assert.deepEqual(columns, ['id','alias','member_role','body','created_at','removed','filtered',...(enhanced ? ['reply_to','reactions','pinned','revision'] : [])]);
  const access = (await db.query("SELECT has_table_privilege('anon','public.community_messages','SELECT') anon_read,has_table_privilege('authenticated','public.community_messages','INSERT') member_insert,has_table_privilege('authenticated','operations_private.community_authors','SELECT') member_authors,has_function_privilege('anon',coalesce(to_regprocedure('public.community_send(text,uuid,boolean,uuid)'),to_regprocedure('public.community_send(text,uuid,boolean)'),to_regprocedure('public.community_send(text,uuid)')),'EXECUTE') anon_send")).rows[0];
  assert.deepEqual(access,{anon_read:false,member_insert:false,member_authors:false,anon_send:false});
  assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.community_messages'::regclass")).rows[0].relrowsecurity,true);
  assert.equal((await db.query("SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='community_messages'")).rowCount,1);
  assert.equal((await db.query("SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='operations_private' AND tablename LIKE 'community_%'")).rowCount,0);
  const enabled = (await db.query("SELECT value FROM public.site_settings WHERE key='community_enabled'")).rows[0].value;
  if (!applied) assert.equal(enabled,'false');
  await db.query('COMMIT');
  console.log(JSON.stringify({migration:version,alreadyApplied:!!applied,permissions:'passed',realtime:'public sanitized messages only',enabled:enabled==='true',testMessagesSent:0}));
} catch (error) {
  await db.query('ROLLBACK');
  console.error('Community migration rolled back:',error instanceof Error ? error.message : 'Unknown failure');
  process.exitCode=1;
} finally {
  await db.end();
}

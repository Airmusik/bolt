import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { readProjectEnvironment, connectProjectDatabase } from './db-connection.mjs';

const version = '20260911180000';
const env = await readProjectEnvironment();
assert.equal(new URL(env.VITE_SUPABASE_URL).hostname, 'bqgfrulkjibxunaofumx.supabase.co');
const db = await connectProjectDatabase(env, '11drive_review_once_release');
try {
  await db.query('BEGIN');
  await db.query("SET LOCAL lock_timeout='5s'");
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended('11drive_review_once_release',0))");
  const applied = (await db.query('SELECT 1 FROM supabase_migrations.schema_migrations WHERE version=$1',[version])).rowCount > 0;
  if (process.argv.includes('--apply') && !applied) {
    const sql = await readFile(new URL('../supabase/migrations/20260911180000_one_review_per_member.sql',import.meta.url),'utf8');
    await db.query(sql);
    await db.query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,$3)',[version,'one_review_per_member',[sql]]);
  }
  const check = (await db.query(`SELECT
    EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='reviews_one_per_member_pair' AND indexdef LIKE 'CREATE UNIQUE INDEX%') AS unique_pair,
    has_function_privilege('anon','submit_conversation_review(uuid,integer,text)','EXECUTE') AS anonymous_allowed,
    has_function_privilege('authenticated','submit_conversation_review(uuid,integer,text)','EXECUTE') AS members_allowed`)).rows[0];
  if (process.argv.includes('--apply') || applied) assert.deepEqual(check,{unique_pair:true,anonymous_allowed:false,members_allowed:true});
  await db.query('COMMIT');
  console.log(JSON.stringify({applied: applied || process.argv.includes('--apply'),...check}));
} catch(error) {
  await db.query('ROLLBACK').catch(()=>{});
  console.error(JSON.stringify({status:'failed',code:error.code,message:error.message}));
  process.exitCode=1;
} finally { await db.end(); }

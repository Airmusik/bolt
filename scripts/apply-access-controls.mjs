// Explicit, single-migration deployment. Does not apply unrelated pending files.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { connectProjectDatabase,readProjectEnvironment } from './db-connection.mjs';

const version='20260902210000';
if(!process.argv.includes('--apply')) throw new Error('Pass --apply only after authorising the access-control migration.');
const env=await readProjectEnvironment();
if(new URL(env.VITE_SUPABASE_URL).hostname!=='bqgfrulkjibxunaofumx.supabase.co') throw new Error('Unexpected project; refusing to apply this deployment.');
const sql=await readFile(new URL(`../supabase/migrations/${version}_access_control_audit_fixes.sql`,import.meta.url),'utf8');
const checksum=createHash('sha256').update(sql).digest('hex');
const db=await connectProjectDatabase(env,'drivevell_access_control_migration');
try {
  await db.query('BEGIN');
  await db.query("SET LOCAL lock_timeout='5s'");
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended('drivevell-access-control-deployment',0))");
  const applied=await db.query('SELECT version FROM supabase_migrations.schema_migrations WHERE version=$1',[version]);
  if(applied.rowCount) {
    await db.query('ROLLBACK');
    console.log(JSON.stringify({version,status:'already_applied'}));
  } else {
    const counters="SELECT (SELECT count(*) FROM public.profiles)::int AS profiles,(SELECT count(*) FROM public.messages)::int AS messages,(SELECT count(*) FROM public.reports)::int AS reports,(SELECT count(*) FROM storage.objects)::int AS files";
    const before=(await db.query(counters)).rows[0];
    await db.query(sql);
    const permissions=(await db.query(`SELECT
      has_column_privilege('anon','public.profiles','email','SELECT') AS anonymous_email,
      has_column_privilege('anon','public.profiles','phone','SELECT') AS anonymous_phone,
      has_column_privilege('anon','public.profiles','full_name','SELECT') AS public_name,
      has_table_privilege('authenticated','public.conversations','INSERT') AS member_create_chat,
      has_table_privilege('authenticated','public.conversation_admins','INSERT') AS direct_admin_join,
      has_function_privilege('anon','public.send_message(uuid,text)','EXECUTE') AS anonymous_send,
      has_function_privilege('authenticated','public.admin_join_conversation_internal(uuid)','EXECUTE') AS join_bypass,
      has_function_privilege('authenticated','public.send_message(uuid,text)','EXECUTE') AS member_send`)).rows[0];
    assert.deepEqual(permissions,{anonymous_email:false,anonymous_phone:false,public_name:true,member_create_chat:false,direct_admin_join:false,anonymous_send:false,join_bypass:false,member_send:true});
    // No user data writes are in this migration. Counts are a sanity check only;
    // concurrent legitimate site activity may change counts while it runs.
    const after=(await db.query(counters)).rows[0];
    await db.query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,$3)',[version,'access_control_audit_fixes',[sql]]);
    await db.query('COMMIT');
    console.log(JSON.stringify({version,checksum,status:'committed',permissions,counts_before:before,counts_after:after}));
  }
} catch(error) {
  await db.query('ROLLBACK').catch(()=>{});
  console.error(JSON.stringify({version,status:'failed_or_commit_unconfirmed',code:error.code,message:error.message}));
  process.exitCode=1;
} finally { await db.end(); }

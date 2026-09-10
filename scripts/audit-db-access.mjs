// Read-only production permission audit. Never prints credentials or member content.
// Schema metadata and aggregate counts only; each role check is rolled back.
import { readFile } from 'node:fs/promises';
import { readProjectEnvironment,connectProjectDatabase } from './db-connection.mjs';
const env = await readProjectEnvironment();
if (process.argv[2] === 'anonymous-api') {
  const { PUBLIC_PROFILE_FIELDS } = await import('../src/lib/profileSelect.ts');
  const key = env.VITE_SUPABASE_ANON_KEY;
  const isPublic = key?.startsWith('sb_publishable_') || (key?.split('.').length === 3 && JSON.parse(Buffer.from(key.split('.')[1], 'base64url')).role === 'anon');
  if (!isPublic) throw new Error('Refusing an anonymous test with a privileged API key.');
  for (const [table,columns] of [['profiles','email,phone'],['profiles',PUBLIC_PROFILE_FIELDS],['messages','id'],['documents','id']]) {
    const response = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${table}?select=${columns}&limit=1`, { method:'HEAD', headers:{apikey:key,Prefer:'count=exact'},signal:AbortSignal.timeout(15000) });
    console.log(JSON.stringify({label:`anonymous_rest:${table}`,projection:columns==='email,phone'?'private':columns===PUBLIC_PROFILE_FIELDS?'public':'id',status:response.status,range:response.headers.get('content-range')}));
  }
  for(const fn of ['discover_drivers','discover_vehicles']) {
    const response=await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/rpc/${fn}?p_limit=1`,{headers:{apikey:key},signal:AbortSignal.timeout(15000)});
    const result=await response.json();
    console.log(JSON.stringify({label:`anonymous_rpc:${fn}`,status:response.status,items:Array.isArray(result)?result.length:null}));
  }
  process.exit(0);
}
const db = await connectProjectDatabase(env);
async function report(label, sql, params = []) {
  console.log(JSON.stringify({ label, rows: (await db.query(sql, params)).rows }));
}
try {
  await db.query('BEGIN READ ONLY');
  await report('transaction', "SELECT current_setting('transaction_read_only') AS read_only");
  const mode = process.argv[2] || 'inventory';
  if (mode === 'inventory') {
    await report('tables', `SELECT n.nspname AS schema,c.relname AS name,c.relkind,c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls,c.reloptions FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','storage','reminder_private') AND c.relkind IN ('r','p','v','m') ORDER BY 1,2`);
    await report('grants', `SELECT table_schema,table_name,grantee,privilege_type FROM information_schema.table_privileges WHERE table_schema IN ('public','storage','reminder_private') AND grantee IN ('anon','authenticated','PUBLIC') ORDER BY 1,2,3,4`);
    await report('policies', `SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname IN ('public','storage','reminder_private') ORDER BY 1,2,3`);
    await report('functions', `SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS args,p.prosecdef AS security_definer,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY 1,2`);
    await report('triggers', `SELECT c.relname AS table_name,t.tgname,t.tgenabled,p.proname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY 1,2`);
    await report('buckets', 'SELECT id,public,file_size_limit,allowed_mime_types FROM storage.buckets ORDER BY id');
    await report('migrations', 'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version');
  } else if (mode === 'probes') {
    const members = (await db.query("SELECT id,role FROM public.profiles WHERE role IN ('driver','owner','admin') ORDER BY role,id LIMIT 20")).rows;
    await report('sample_inventory', `SELECT 'profiles' AS entity,count(*)::int FROM public.profiles UNION ALL SELECT 'conversations',count(*)::int FROM public.conversations UNION ALL SELECT 'messages',count(*)::int FROM public.messages UNION ALL SELECT 'documents',count(*)::int FROM public.documents UNION ALL SELECT 'platform_history',count(*)::int FROM public.driver_platform_history`);
    await report('private_schema_access', `SELECT role,has_schema_privilege(role,'reminder_private','USAGE') AS private_schema_usage,has_table_privilege(role,'reminder_private.email_config','SELECT') AS email_config_read FROM unnest(ARRAY['anon','authenticated']) role`);
    await report('column_access', `SELECT role,has_column_privilege(role,'public.profiles','email','SELECT') AS email_read,has_column_privilege(role,'public.profiles','phone','SELECT') AS phone_read FROM unnest(ARRAY['anon','authenticated']) role`);
    const probes = [
      ['admin_check', 'SELECT public.is_admin() AS is_admin'],
      ['profile_private_contacts', 'SELECT count(*)::int AS visible_others_with_contacts FROM public.profiles WHERE id IS DISTINCT FROM auth.uid() AND (email IS NOT NULL OR phone IS NOT NULL)'],
      ['unrelated_conversations', 'SELECT count(*)::int AS visible FROM public.conversations WHERE driver_id IS DISTINCT FROM auth.uid() AND owner_id IS DISTINCT FROM auth.uid() AND admin_id IS DISTINCT FROM auth.uid()'],
      ['unrelated_messages', 'SELECT count(*)::int AS visible FROM public.messages m WHERE NOT EXISTS (SELECT 1 FROM public.conversations c WHERE c.id=m.conversation_id AND (c.driver_id=auth.uid() OR c.owner_id=auth.uid() OR c.admin_id=auth.uid()))'],
      ['others_proof_metadata', 'SELECT count(*)::int AS visible FROM public.documents WHERE user_id IS DISTINCT FROM auth.uid()'],
      ['others_history_metadata', 'SELECT count(*)::int AS visible FROM public.driver_platform_history WHERE driver_id IS DISTINCT FROM auth.uid()'],
      ['others_notifications', 'SELECT count(*)::int AS visible FROM public.notifications WHERE user_id IS DISTINCT FROM auth.uid()'],
      ['others_reports', 'SELECT count(*)::int AS visible FROM public.reports WHERE reporter_id IS DISTINCT FROM auth.uid()'],
      ['others_warnings', 'SELECT count(*)::int AS visible FROM public.user_warnings WHERE user_id IS DISTINCT FROM auth.uid()'],
      ['others_contact_threads', 'SELECT count(*)::int AS visible FROM public.contact_messages WHERE user_id IS DISTINCT FROM auth.uid()'],
      ['others_private_proof_files', "SELECT count(*)::int AS visible FROM storage.objects WHERE bucket_id='documents' AND owner IS DISTINCT FROM auth.uid()"],
      ['unpublished_vehicles', "SELECT count(*)::int AS visible FROM public.vehicles WHERE owner_id IS DISTINCT FROM auth.uid() AND (approval_status<>'approved' OR deleted_at IS NOT NULL OR document_listing_visibility<>'public')"],
      ['private_driver_profiles', "SELECT count(*)::int AS visible FROM public.profiles WHERE id IS DISTINCT FROM auth.uid() AND role='driver' AND (NOT onboarding_completed OR document_listing_visibility<>'public' OR is_suspended)"],
      ['admin_profile_rpc', 'SELECT count(*)::int AS visible FROM public.admin_list_profiles()'],
    ];
    const subjects = [{role:'anon',id:null},...members.map((m,index)=>({...m,label:`${m.role}_${index+1}`,role:'authenticated'}))];
    for (const member of subjects) {
      await db.query('RESET ROLE');
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true),set_config('request.jwt.claims',$3,true)",[member.id || '',member.role,JSON.stringify({sub:member.id,role:member.role})]);
      await db.query(member.role === 'anon' ? 'SET LOCAL ROLE anon' : 'SET LOCAL ROLE authenticated');
      for (const [label,sql] of probes) {
        await db.query('SAVEPOINT audit_probe');
        try { await report(`${member.label || member.role}:${label}`,sql); }
        catch(error) { console.log(JSON.stringify({label:`${member.label || member.role}:${label}`,blocked:true,code:error.code,message:error.message})); await db.query('ROLLBACK TO SAVEPOINT audit_probe'); }
        await db.query('RELEASE SAVEPOINT audit_probe');
      }
    }
  } else if (mode === 'snapshot') {
    const { loadAccessSnapshot } = await import('./audit-isolated-policies.mjs');
    const snapshot = await loadAccessSnapshot(db);
    const section = process.argv[3];
    if(section) console.log(JSON.stringify({label:'snapshot',section,rows:snapshot[section]}));
    else console.log(JSON.stringify({label:'snapshot',snapshot}));
  } else if (mode === 'isolated') {
    const { auditIsolatedPolicies } = await import('./audit-isolated-policies.mjs');
    const migrations = process.argv.slice(3);
    try { await auditIsolatedPolicies(db,{migrations:await Promise.all(migrations.map(path=>readFile(path,'utf8')))}); }
    catch (error) { console.log(JSON.stringify({label:'isolated_setup_failed',code:error.code,message:error.message,query:error.query})); process.exitCode=1; }
  } else if (mode === 'definitions') {
    const names = process.argv.slice(3);
    await report('definitions', `SELECT proname,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND proname=ANY($1::text[]) ORDER BY proname`, [names]);
  }
  await db.query('ROLLBACK');
} finally { await db.end(); }

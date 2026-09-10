// Reproduce deployed policies/functions against synthetic rows in memory only.
// No production row data is copied; no production write SQL is executed.
import { PGlite } from '@electric-sql/pglite';
const ident = (s) => `"${s.replaceAll('"','""')}"`;
export async function loadAccessSnapshot(source) {
  const enums = (await source.query("SELECT n.nspname AS schema,t.typname,array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS labels FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid WHERE n.nspname IN ('public','storage') GROUP BY n.nspname,t.typname")).rows;
  const columns = (await source.query(`SELECT n.nspname AS schema,c.relname AS table_name,a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS not_null,a.attgenerated AS generated,pg_get_expr(d.adbin,d.adrelid) AS default_expr FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE (n.nspname='public' OR (n.nspname='storage' AND c.relname IN ('objects','buckets'))) AND c.relkind='r' ORDER BY n.nspname,c.relname,a.attnum`)).rows;
  const functions = (await source.query(`SELECT n.nspname AS schema,p.proname,pg_get_functiondef(p.oid) AS definition,pg_get_function_identity_arguments(p.oid) AS args,has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' OR (n.nspname='storage' AND p.proname='foldername')`)).rows;
  const policies = (await source.query("SELECT * FROM pg_policies WHERE schemaname='public' OR (schemaname='storage' AND tablename IN ('objects','buckets'))")).rows;
  const grants = (await source.query("SELECT table_schema,table_name,grantee,privilege_type FROM information_schema.table_privileges WHERE (table_schema='public' OR (table_schema='storage' AND table_name IN ('objects','buckets'))) AND grantee IN ('anon','authenticated','PUBLIC')")).rows;
  const columnGrants = (await source.query("SELECT cp.table_schema,cp.table_name,cp.grantee,cp.privilege_type,cp.column_name FROM information_schema.column_privileges cp WHERE cp.table_schema='public' AND cp.grantee IN ('anon','authenticated','PUBLIC') AND NOT EXISTS(SELECT 1 FROM information_schema.table_privileges tp WHERE tp.table_schema=cp.table_schema AND tp.table_name=cp.table_name AND tp.grantee=cp.grantee AND tp.privilege_type=cp.privilege_type)")).rows;
  const triggers = (await source.query("SELECT pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgenabled='O'")).rows;
  const constraints = (await source.query("SELECT c.relname AS table_name,con.conname,pg_get_constraintdef(con.oid) AS definition FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND con.contype IN ('p','u','c')")).rows;
  return { enums,columns,functions,policies,grants,columnGrants,triggers,constraints };
}
export async function auditIsolatedPolicies(source, options = {}) {
  const { enums,columns,functions,policies,grants,columnGrants,triggers,constraints } = source.query ? await loadAccessSnapshot(source) : source;
  const clone = new PGlite();
  try {
    await clone.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA reminder_private;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated;
      SET check_function_bodies=off;`);
    for (const en of enums) await clone.exec(`CREATE TYPE ${ident(en.schema)}.${ident(en.typname)} AS ENUM (${en.labels.map(v=>`'${v.replaceAll("'","''")}'`).join(',')})`);
    const tables = new Map();
    for (const column of columns) {
      const key = `${ident(column.schema)}.${ident(column.table_name)}`;
      if (!tables.has(key)) tables.set(key,[]);
      tables.get(key).push(`${ident(column.name)} ${column.type}${column.default_expr ? (column.generated ? ` GENERATED ALWAYS AS (${column.default_expr}) STORED` : ` DEFAULT ${column.default_expr}`) : ''}${column.not_null ? ' NOT NULL' : ''}`);
    }
    for (const [table,fields] of tables) await clone.exec(`CREATE TABLE ${table} (${fields.join(',')});`);
    for (const constraint of constraints) await clone.exec(`ALTER TABLE public.${ident(constraint.table_name)} ADD CONSTRAINT ${ident(constraint.conname)} ${constraint.definition}`);
    for (const fn of functions) await clone.exec(fn.definition);
    for (const fn of functions) {
      const signature = `${ident(fn.schema)}.${ident(fn.proname)}(${fn.args})`;
      await clone.exec(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC;`);
      for (const role of ['anon','authenticated']) if(fn[`${role}_execute`]) await clone.exec(`GRANT EXECUTE ON FUNCTION ${signature} TO ${role}`);
    }
    const owner='10000000-0000-4000-8000-000000000001',driver='10000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000003',admin='10000000-0000-4000-8000-000000000004';
    const vehicle='20000000-0000-4000-8000-000000000001',pendingVehicle='20000000-0000-4000-8000-000000000002',application='30000000-0000-4000-8000-000000000001',connection='40000000-0000-4000-8000-000000000001',unusedConnection='40000000-0000-4000-8000-000000000002',thread='50000000-0000-4000-8000-000000000001',conversation='60000000-0000-4000-8000-000000000001';
    for (const [id,role] of [[owner,'owner'],[driver,'driver'],[other,'owner'],[admin,'admin']]) {
      await clone.query("INSERT INTO public.profiles(id,role,full_name,email,phone,location,onboarding_completed,languages) VALUES($1,$2,'Fixture Member',$3,$4,'Nairobi',true,ARRAY['English','Swahili'])",[id,role,`${role}.${id}@example.test`,id]);
    }
    // Realistic seed relationships; foreign keys to Supabase-managed auth/storage
    // tables are deliberately not cloned. IDs are synthetic and mutually valid.
    await clone.query("INSERT INTO public.vehicles(id,owner_id,make,model,year,location,approval_status,status) VALUES($1,$2,'Toyota','Vitz',2020,'Nairobi','approved','active')",[vehicle,owner]);
    await clone.query("INSERT INTO public.vehicles(id,owner_id,make,model,year,location,approval_status,status) VALUES($1,$2,'Toyota','Vitz',2020,'Nairobi','pending','active')",[pendingVehicle,owner]);
    await clone.query("INSERT INTO public.applications(id,vehicle_id,driver_id,owner_id,status) VALUES($1,$2,$3,$4,'accepted')",[application,vehicle,driver,owner]);
    await clone.query("INSERT INTO public.connections(id,requester_id,recipient_id,status,vehicle_id) VALUES($1,$2,$3,'accepted',$4)",[connection,driver,owner,vehicle]);
    await clone.query("INSERT INTO public.connections(id,requester_id,recipient_id,status,vehicle_id) VALUES($1,$2,$3,'accepted',$4)",[unusedConnection,driver,owner,vehicle]);
    await clone.query("INSERT INTO public.contact_messages(id,user_id,name,email,message) VALUES($1,$2,'Fixture Member','fixture@example.test','Synthetic support request')",[thread,owner]);
    await clone.query("INSERT INTO public.conversations(id,connection_id,driver_id,owner_id) VALUES($1,$2,$3,$4)",[conversation,connection,driver,owner]);
    await clone.query("INSERT INTO public.messages(conversation_id,sender_id,content,type) VALUES($1,$2,'Synthetic private message','text')",[conversation,owner]);
    for (const [table] of tables) await clone.exec(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    for (const g of grants) await clone.exec(`GRANT ${g.privilege_type} ON ${ident(g.table_schema)}.${ident(g.table_name)} TO ${g.grantee==='PUBLIC' ? 'PUBLIC' : ident(g.grantee)}`);
    for (const g of columnGrants) await clone.exec(`GRANT ${g.privilege_type} (${ident(g.column_name)}) ON ${ident(g.table_schema)}.${ident(g.table_name)} TO ${g.grantee==='PUBLIC' ? 'PUBLIC' : ident(g.grantee)}`);
    for (const p of policies) {
      // node-postgres parses name[] as an array on some versions and text on others.
      const roles = Array.isArray(p.roles) ? p.roles : p.roles.replace(/^\{|\}$/g,'').split(',');
      await clone.exec(`CREATE POLICY ${ident(p.policyname)} ON ${ident(p.schemaname)}.${ident(p.tablename)} AS ${p.permissive} FOR ${p.cmd} TO ${roles.map(r=>r==='public'?'PUBLIC':ident(r)).join(',')} ${p.qual ? `USING (${p.qual})` : ''} ${p.with_check ? `WITH CHECK (${p.with_check})` : ''}`);
    }
    for (const trigger of triggers) await clone.exec(trigger.definition);
    for (const migration of options.migrations || []) await clone.exec(migration);
    if (options.verify) await options.verify(clone,{owner,driver,other,admin,vehicle,pendingVehicle,application,connection,unusedConnection,thread,conversation});
    if (options.onlyVerify) return;
    console.log(JSON.stringify({label:'isolated_schema',tables:tables.size,policies:policies.length,functions:functions.length,triggers:triggers.length,real_member_rows_copied:0}));
    async function probe(label,sql,args=[],id=owner,role='authenticated') {
      await clone.exec('BEGIN');
      try {
        await clone.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true)",[id,role]);
        await clone.exec(`SET LOCAL ROLE ${role}`);
        const result = await clone.query(sql,args);
        console.log(JSON.stringify({label,allowed:true,rows:result.rows}));
        if (label==='member_file_pre_resolved_report') console.log(JSON.stringify({label:'rating_after_forged_report',rows:(await clone.query('SELECT rating FROM public.profiles WHERE id=$1',[other])).rows}));
      } catch(error) { console.log(JSON.stringify({label,allowed:false,code:error.code,message:error.message})); }
      finally { await clone.exec('ROLLBACK'); }
    }
    await probe('member_self_promote',"UPDATE public.profiles SET role='admin' WHERE id=$1 RETURNING id",[owner]);
    await probe('member_edit_other_profile',"UPDATE public.profiles SET bio='not allowed' WHERE id=$1 RETURNING id",[other]);
    await probe('member_change_rating',"UPDATE public.profiles SET rating=1 WHERE id=$1 RETURNING id",[owner]);
    await probe('member_self_approve_listing',"UPDATE public.vehicles SET approval_status='approved' WHERE id=$1 RETURNING approval_status",[pendingVehicle]);
    await probe('admin_approve_listing',"UPDATE public.vehicles SET approval_status='approved' WHERE id=$1 RETURNING approval_status",[pendingVehicle],admin);
    await probe('member_edit_other_vehicle',"UPDATE public.vehicles SET model='not allowed' WHERE id=$1 RETURNING id",[vehicle],other);
    await probe('member_forge_application_chat',"INSERT INTO public.conversations(application_id,vehicle_id,driver_id,owner_id) VALUES($1,$2,$3,$4) RETURNING id",[application,vehicle,driver,other],driver);
    await probe('member_forge_connection_chat',"INSERT INTO public.conversations(connection_id,driver_id,owner_id) VALUES($1,$2,$3) RETURNING id",[unusedConnection,driver,other],driver);
    await probe('member_forge_group_support_chat',"INSERT INTO public.conversations(driver_id,owner_id,admin_id) VALUES($1,$2,$3) RETURNING id",[driver,other,admin],driver);
    await probe('member_file_pre_resolved_report',"INSERT INTO public.reports(reporter_id,reported_id,target_type,target_id,reason,status) VALUES($1,$2,'user',$2,'Synthetic test','resolved') RETURNING status",[owner,other]);
    await probe('member_upload_own_support_attachment',"INSERT INTO storage.objects(bucket_id,name,owner) VALUES('contact-attachments',$1,$2) RETURNING id",[`${thread}/${owner}/test.pdf`,owner]);
    await probe('member_admin_list_rpc','SELECT count(*)::int FROM public.admin_list_profiles()');
    await probe('admin_admin_list_rpc','SELECT count(*)::int FROM public.admin_list_profiles()',[],admin);
    await probe('admin_read_chat_without_invitation','SELECT count(*)::int FROM public.messages WHERE conversation_id=$1',[conversation],admin);
    await probe('admin_join_chat_without_invitation','INSERT INTO public.conversation_admins(conversation_id,admin_id) VALUES($1,$2) RETURNING conversation_id',[conversation,admin],admin);
    await probe('anon_private_contacts','SELECT count(*)::int FROM public.profiles WHERE email IS NOT NULL',[], '', 'anon');
  } finally { await clone.close(); }
}

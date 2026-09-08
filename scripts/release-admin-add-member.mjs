import { readFile } from 'node:fs/promises';
import { connectProjectDatabase, readProjectEnvironment } from './db-connection.mjs';

const env=await readProjectEnvironment();
const db=await connectProjectDatabase(env,'11drive_admin_add_member_release');
try {
  await db.query(await readFile('supabase/migrations/20260908210000_admin_add_member.sql','utf8'));
  const admin=await db.query("select id from public.profiles where role='admin' order by created_at limit 1");
  if(!admin.rows[0]) throw new Error('No administrator found for transaction test');
  await db.query('begin');
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true)",[admin.rows[0].id]);
    const email=`release-check-${Date.now()}@example.com`;
    const created=await db.query("select public.admin_create_member($1,$2,$3,$4,$5,$6,$7,$8) id",[email,'ReleaseTest9x','Release Test','+254700000001','driver','Rongai',['English','Swahili'],true]);
    const verified=await db.query("select p.location,p.languages,u.email_confirmed_at,a.acceptance_source from public.profiles p join auth.users u on u.id=p.id join public.registration_terms_acceptances a on a.user_id=p.id where p.id=$1",[created.rows[0].id]);
    if(verified.rows[0]?.location!=='Rongai'||verified.rows[0]?.email_confirmed_at!==null||verified.rows[0]?.acceptance_source!=='admin_attested') throw new Error('Admin member transaction verification failed');
    console.log(JSON.stringify({migrated:true,transaction_test:true,email_confirmed:false,terms_source:verified.rows[0].acceptance_source}));
  } finally { await db.query('rollback'); }
} finally { await db.end(); }

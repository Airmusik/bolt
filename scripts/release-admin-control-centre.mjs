import { readFile } from 'node:fs/promises';
import { connectProjectDatabase,readProjectEnvironment } from './db-connection.mjs';
const env=await readProjectEnvironment();const db=await connectProjectDatabase(env,'11drive_admin_control_centre_release');
try{await db.query(await readFile('supabase/migrations/20260908220000_admin_control_centre.sql','utf8'));const{rows}=await db.query("select count(*)::int controls from public.site_settings where key in ('homepage_badge','registration_enabled','support_hours','seo_home_title','chat_retention_days')");console.log(JSON.stringify({migrated:true,...rows[0]}));}finally{await db.end()}

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export async function readProjectEnvironment() {
  const values = {};
  for (const filename of ['.env','.env.local','.env.backup.local']) {
    const source = await readFile(filename,'utf8').catch(()=> '');
    for (const line of source.split(/\r?\n/)) {
      const match=line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if(match) values[match[1]]=match[2].trim().replace(/^(['"])(.*)\1$/,'$2');
    }
  }
  // Explicit process configuration wins over blank local example values.
  return { ...values, ...process.env };
}

export async function connectProjectDatabase(env,applicationName='drivevell_read_only_permission_audit') {
  const url=new URL(env.SUPABASE_DB_URL);
  const ref=new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
  const pg=await import(env.AUDIT_PG_MODULE ? pathToFileURL(env.AUDIT_PG_MODULE).href : 'pg');
  const response=await fetch('https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt',{signal:AbortSignal.timeout(15000)});
  if(!response.ok) throw new Error('Could not load the database certificate authority');
  const ca=await response.text();
  const base={database:url.pathname.slice(1),password:decodeURIComponent(url.password),ssl:{ca,rejectUnauthorized:true},connectionTimeoutMillis:10000,statement_timeout:15000,application_name:applicationName};
  for(const endpoint of [
    {host:url.hostname,port:Number(url.port || 5432),user:decodeURIComponent(url.username)},
    {host:env.SUPABASE_POOLER_HOST || 'aws-1-eu-west-1.pooler.supabase.com',port:5432,user:`postgres.${ref}`},
  ]) {
    const db=new pg.default.Client({...base,...endpoint});
    db.on('error',()=>{});
    try { await db.connect(); console.log(JSON.stringify({connection:endpoint.host,connected:true})); return db; }
    catch(error) { console.log(JSON.stringify({connection:endpoint.host,connected:false,code:error.code || 'connection_failed'})); await db.end().catch(()=>{}); }
  }
  throw new Error('No database connection available');
}

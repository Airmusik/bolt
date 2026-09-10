// Read-only source access. Private data is encrypted before any file is written.
// No restore command accepts a production URL. Verification is isolated in memory.
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readProjectEnvironment, connectProjectDatabase } from './db-connection.mjs';
import { encryptBackup, decryptBackup, digest } from './backup-crypto.mjs';
const run = promisify(execFile);
const env = await readProjectEnvironment();
const root = resolve(env.BACKUP_ROOT || '.backups.local');
const keyFile = resolve(env.BACKUP_KEY_FILE || '.backup-keys.local/recovery-key.txt');
const q = name => '"' + name.replaceAll('"','""') + '"';
const command = process.argv[2] || 'status';
async function restrict(path) {
  if (process.platform === 'win32') await run('icacls.exe', [path, '/inheritance:r', '/grant:r', `${process.env.USERDOMAIN}\\${process.env.USERNAME}:(OI)(CI)F`, 'SYSTEM:(OI)(CI)F']);
}
async function key(create=false) {
  const existing = await readFile(keyFile,'utf8').catch(() => null);
  if (existing) { const bytes=Buffer.from(existing.trim(),'base64'); if(bytes.length!==32) throw new Error('Invalid recovery key'); return bytes; }
  if (!create) throw new Error('Recovery key missing');
  const folder=resolve(keyFile,'..'); await mkdir(folder,{recursive:true,mode:0o700}); await restrict(folder);
  const bytes=randomBytes(32); await writeFile(keyFile,bytes.toString('base64')+'\n',{flag:'wx',mode:0o600}); return bytes;
}
async function verify(folder) {
  const secret = await key();
  const manifest=JSON.parse(decryptBackup(await readFile(join(folder,'manifest.enc')),secret));
  const { PGlite } = await import('@electric-sql/pglite');
  const isolated=new PGlite();
  let rows=0, files=0;
  try {
    await isolated.exec('CREATE TABLE recovered_rows (source_table text, row_data jsonb)');
    for (const entry of manifest.entries) {
      if (!/^[a-f0-9]{64}\.enc$/.test(entry.file)) throw new Error('Invalid archive entry path');
      const bytes=decryptBackup(await readFile(join(folder,entry.file)),secret);
      if(digest(bytes)!==entry.sha256 || bytes.length!==entry.bytes) throw new Error('Backup checksum mismatch');
      if(entry.kind==='table') {
        const values=JSON.parse(bytes);
        await isolated.query('INSERT INTO recovered_rows SELECT $1,value FROM jsonb_array_elements($2::jsonb)', [entry.name,JSON.stringify(values)]);
        const restored=(await isolated.query('SELECT row_data FROM recovered_rows WHERE source_table=$1',[entry.name])).rows.map(r=>r.row_data);
        if(restored.length!==entry.rows) throw new Error('Restore row count mismatch');
        // Compare every restored row, ignoring JSON key ordering.
        const sortKeys = value => Array.isArray(value) ? value.map(sortKeys) : value && typeof value==='object' ? Object.fromEntries(Object.keys(value).sort().map(k=>[k,sortKeys(value[k])])) : value;
        const canonical = value => JSON.stringify(sortKeys(value));
        if(values.map(canonical).sort().join('\n')!==restored.map(canonical).sort().join('\n')) throw new Error('Restored data mismatch');
        rows+=restored.length;
      } else if(entry.kind==='object') files++;
    }
  } finally { await isolated.close(); }
  const result={verified_at:new Date().toISOString(),status:manifest.complete?'complete':'partial',tables:manifest.entries.filter(e=>e.kind==='table').length,restored_rows:rows,verified_files:files,missing_files:manifest.missingFiles,scope:'Encrypted data recovery into isolated local database; not a managed Supabase/Auth restore rehearsal'};
  await writeFile(join(folder,'verification.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result)); return result;
}
if(command==='verify') {
  if(!process.argv[3]) throw new Error('Supply the backup directory to verify');
  await verify(resolve(process.argv[3]));
} else if(command==='create') {
  await mkdir(root,{recursive:true,mode:0o700}); await restrict(root);
  const secret=await key(true), folder=join(root,new Date().toISOString().replace(/[:.]/g,'-'));
  await mkdir(folder,{mode:0o700});
  const manifest={version:1,created_at:new Date().toISOString(),complete:false,entries:[],missingFiles:0,notes:['Storage copies are not transactionally locked; changed/missing files make this run partial.','Auth MFA/root encryption keys and hosted settings need the Supabase recovery runbook.']};
  const save=async(name,kind,bytes,extra={})=>{const file=digest(Buffer.from(`${kind}:${name}`))+'.enc';await writeFile(join(folder,file),encryptBackup(bytes,secret),{flag:'wx',mode:0o600});manifest.entries.push({name,kind,file,sha256:digest(bytes),bytes:bytes.length,...extra});};
  const db=await connectProjectDatabase(env,'11drive_encrypted_backup');
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const snapshot=(await db.query('SELECT pg_export_snapshot() id')).rows[0].id;
    const tables=(await db.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','auth','storage','reminder_private','operations_private','supabase_migrations') ORDER BY 1,2")).rows;
    for(const table of tables) {
      const name=`${table.schemaname}.${table.tablename}`;
      const values=(await db.query(`SELECT * FROM ${q(table.schemaname)}.${q(table.tablename)}`)).rows;
      await save(name,'table',Buffer.from(JSON.stringify(values)),{rows:values.length});
    }
    const ca=await fetch('https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt',{signal:AbortSignal.timeout(15000)});
    if(!ca.ok) throw new Error('Database certificate unavailable');
    const caPath=join(root,'database-ca.crt'); await writeFile(caPath,await ca.text());
    const pgBin=resolve(env.PG_BIN || '.tools.local/postgresql/pgsql/bin');
    const source=db.connectionParameters;
    const childEnv={...process.env,PGHOST:source.host,PGPORT:String(source.port),PGUSER:source.user,PGPASSWORD:source.password,PGDATABASE:source.database,PGSSLMODE:'verify-full',PGSSLROOTCERT:caPath};
    const args=['--format=custom','--no-owner','--snapshot='+snapshot];
    for(const schema of [...new Set(tables.map(t=>t.schemaname))]) args.push('--schema='+schema);
    const dump=await run(join(pgBin,process.platform==='win32'?'pg_dump.exe':'pg_dump'),args,{env:childEnv,encoding:'buffer',maxBuffer:256*1024*1024,timeout:180000,windowsHide:true});
    await save('database.dump','postgres-archive',dump.stdout);
    // Preserve definitions/configuration separately, including ACLs in the dump.
    const extensions=(await db.query('SELECT extname,extversion FROM pg_extension')).rows;
    await save('extensions.json','config',Buffer.from(JSON.stringify(extensions)));
    const objects=(await db.query('SELECT o.id,o.bucket_id,o.name,o.updated_at,o.metadata,b.public FROM storage.objects o JOIN storage.buckets b ON b.id=o.bucket_id ORDER BY o.id')).rows;
    const storageKey=env.SUPABASE_BACKUP_KEY;
    for(const object of objects) {
      if(!object.public && !storageKey) { manifest.missingFiles++; continue; }
      const path=[object.bucket_id,...object.name.split('/')].map(encodeURIComponent).join('/');
      const url=`${env.VITE_SUPABASE_URL}/storage/v1/object/${storageKey?'authenticated':'public'}/${path}`;
      const response=await fetch(url,{headers:storageKey?{apikey:storageKey,...(storageKey.startsWith('ey')?{Authorization:`Bearer ${storageKey}`}:{})}:{},signal:AbortSignal.timeout(60000)});
      if(!response.ok) { manifest.missingFiles++; continue; }
      const bytes=Buffer.from(await response.arrayBuffer());
      if(object.metadata?.size != null && bytes.length!==Number(object.metadata.size)) {manifest.missingFiles++;continue;}
      await save(`${object.bucket_id}/${object.name}`,'object',bytes,{id:object.id,updated_at:object.updated_at});
    }
    await db.query('COMMIT');
    // The database snapshot cannot lock Storage downloads. Detect objects that
    // changed or disappeared during copying, even when their size stayed equal.
    const currentObjects=new Map((await db.query('SELECT id,updated_at FROM storage.objects')).rows.map(o=>[o.id,new Date(o.updated_at).toISOString()]));
    for(const entry of manifest.entries.filter(e=>e.kind==='object')) {
      if(currentObjects.get(entry.id)!==new Date(entry.updated_at).toISOString()) manifest.missingFiles++;
    }
    manifest.complete=manifest.missingFiles===0;
    await writeFile(join(folder,'manifest.enc'),encryptBackup(Buffer.from(JSON.stringify(manifest)),secret),{flag:'wx',mode:0o600});
    await writeFile(join(folder,'README.txt'),'Encrypted 11Drive backup. Keep the recovery key separately. Run npm run backup:verify -- <this-folder>. Do not publish this directory.\n');
    await verify(folder);
    console.log(JSON.stringify({backup:folder,key_file:keyFile,off_site_copy_configured:false}));
    if(!manifest.complete) process.exitCode=2;
  } catch(error) {
    await db.query('ROLLBACK').catch(()=>{});
    // Do not print native tool commands, connection strings or table contents.
    console.error('Backup did not complete. Existing backups have not been changed. Error class:',error.code || error.name || 'backup_failed');
    process.exitCode=1;
  } finally {await db.end();}
} else if(command==='status') {
  const folders=(await readdir(root,{withFileTypes:true}).catch(()=>[])).filter(e=>e.isDirectory()).map(e=>e.name).sort().reverse();
  for(const name of folders.slice(0,5)) {
    const result=await readFile(join(root,name,'verification.json'),'utf8').catch(()=>null);
    console.log(JSON.stringify({backup:basename(name),verification:result?JSON.parse(result):'incomplete/unverified'}));
  }
  if(!folders.length) console.log('No local backup exists.');
} else throw new Error('Use create, verify or status');

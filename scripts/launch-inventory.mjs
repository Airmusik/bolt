import { readProjectEnvironment, connectProjectDatabase } from './db-connection.mjs';
const env = await readProjectEnvironment();
console.log('Available configuration names:', Object.keys(env).filter(k => /SUPABASE|BACKUP|RESEND|VERCEL/.test(k)));
const db = await connectProjectDatabase(env, 'launch_read_only_inventory');
try {
  await db.query('BEGIN READ ONLY');
  console.log(JSON.stringify((await db.query(`SELECT current_setting('server_version') version,
    (SELECT count(*) FROM storage.objects) objects,
    (SELECT coalesce(sum((metadata->>'size')::bigint),0) FROM storage.objects) storage_bytes,
    pg_database_size(current_database()) database_bytes`)).rows[0]));
  console.log(JSON.stringify((await db.query(`SELECT extname FROM pg_extension ORDER BY extname`)).rows));
} finally { await db.query('ROLLBACK'); await db.end(); }

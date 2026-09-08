import { readFile } from 'node:fs/promises';
import { connectProjectDatabase, readProjectEnvironment } from './db-connection.mjs';
const env = await readProjectEnvironment();
const db = await connectProjectDatabase(env, '11drive_security_centre_release');
try {
  await db.query(await readFile('supabase/migrations/20260908230000_security_centre.sql', 'utf8'));
  const { rows } = await db.query(`select
    (select count(*) from public.site_settings where key like 'security_%')::int settings,
    (select count(*) from information_schema.tables where table_schema='public' and table_name in ('security_events','security_devices','security_blocks'))::int tables,
    (select count(*) from information_schema.triggers where trigger_schema='public' and trigger_name in ('trg_security_connection_guard','trg_security_message_guard','trg_security_profile_history','trg_security_document_upload','trg_security_vehicle_photo_upload'))::int guards`);
  if (rows[0].settings !== 14 || rows[0].tables !== 3 || rows[0].guards !== 5) throw new Error('Security database verification failed');
  console.log(JSON.stringify({ migrated: true, ...rows[0] }));
} finally { await db.end(); }

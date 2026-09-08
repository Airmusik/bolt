import { readFile } from 'node:fs/promises';
import { connectProjectDatabase, readProjectEnvironment } from './db-connection.mjs';

const env = await readProjectEnvironment();
const db = await connectProjectDatabase(env, 'homepage_background_release');
try {
  await db.query(await readFile('supabase/migrations/20260909003000_homepage_background_media.sql', 'utf8'));
  const { rows } = await db.query(`select
    (select count(*) from public.site_settings where key like 'homepage_background_%')::int settings,
    (select file_size_limit from storage.buckets where id = 'site-assets')::int file_size_limit,
    (select array_length(allowed_mime_types, 1) from storage.buckets where id = 'site-assets')::int mime_types`);
  if (rows[0].settings !== 4 || rows[0].file_size_limit !== 8388608 || rows[0].mime_types !== 5) throw new Error('Homepage background verification failed');
  console.log(JSON.stringify({ migrated: true, ...rows[0] }));
} finally {
  await db.end();
}

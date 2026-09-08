import { readFile } from 'node:fs/promises';
import { connectProjectDatabase, readProjectEnvironment } from './db-connection.mjs';

const env = await readProjectEnvironment();
const db = await connectProjectDatabase(env, 'homepage_background_position_release');
try {
  await db.query(await readFile('supabase/migrations/20260909004000_homepage_background_position.sql', 'utf8'));
  const { rows } = await db.query(`select key, value from public.site_settings where key in ('homepage_background_position_x', 'homepage_background_position_y') order by key`);
  if (rows.length !== 2 || rows.some((row) => row.value !== '50')) throw new Error('Background position settings verification failed');
  console.log(JSON.stringify({ migrated: true, positionControls: rows.length }));
} finally {
  await db.end();
}

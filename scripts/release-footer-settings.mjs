import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { connectProjectDatabase, readProjectEnvironment } from './db-connection.mjs';

const db = await connectProjectDatabase(await readProjectEnvironment(), 'footer_settings_release');
try {
  await db.query(await readFile('supabase/migrations/20260908170000_editable_footer_content.sql', 'utf8'));
  const count = Number((await db.query("select count(*) from public.site_settings where key like 'footer_%'")).rows[0].count);
  assert.equal(count, 13);
  console.log(JSON.stringify({ applied: true, footer_settings: count }));
} finally { await db.end(); }

import { readFile } from 'node:fs/promises';
import { connectProjectDatabase, readProjectEnvironment } from './db-connection.mjs';

const env = await readProjectEnvironment();
const db = await connectProjectDatabase(env, '11drive_legal_page_editor_release');

try {
  const sql = await readFile('supabase/migrations/20260908200000_admin_legal_page_editor.sql', 'utf8');
  await db.query(sql);
  const { rows } = await db.query(`
    select
      public.get_current_legal_document('terms')->>'title' as terms_title,
      public.get_current_legal_document('terms')->>'version' as terms_version,
      public.get_current_legal_document('privacy')->>'title' as privacy_title,
      public.get_current_legal_document('privacy')->>'version' as privacy_version
  `);
  console.log(JSON.stringify({ migrated: true, ...rows[0] }));
} finally {
  await db.end();
}

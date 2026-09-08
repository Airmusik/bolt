import { readFile } from 'node:fs/promises';
import { connectProjectDatabase, readProjectEnvironment } from './db-connection.mjs';

const env = await readProjectEnvironment();
const db = await connectProjectDatabase(env, 'security_block_fix_release');
try {
  await db.query(await readFile('supabase/migrations/20260909001000_security_block_admin_functions.sql', 'utf8'));
  const { rows: admins } = await db.query(`select id from public.profiles where role = 'admin' limit 1`);
  if (!admins[0]?.id) throw new Error('No admin account available for verification');
  await db.query('begin');
  await db.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'authenticated', true)`, [admins[0].id]);
  const { rows } = await db.query(`select public.admin_add_security_block('email', 'release-check@11drive.com', 'Release verification') id`);
  const { rows: blocks } = await db.query(`select created_by, active from public.security_blocks where id = $1`, [rows[0].id]);
  await db.query(`select public.admin_set_security_block_active($1, false)`, [rows[0].id]);
  if (blocks[0]?.created_by !== admins[0].id || blocks[0]?.active !== true) throw new Error('Block attribution verification failed');
  await db.query('rollback');
  console.log(JSON.stringify({ migrated: true, addBlock: true, unblock: true, adminAttribution: true }));
} catch (error) {
  await db.query('rollback').catch(() => undefined);
  throw error;
} finally {
  await db.end();
}

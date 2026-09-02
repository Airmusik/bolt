import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../supabase/migrations/20260902230000_site_branding_cleanup.sql', import.meta.url), 'utf8');
const driver = '10000000-0000-4000-8000-000000000001';
const owner = '10000000-0000-4000-8000-000000000002';
const admin = '10000000-0000-4000-8000-000000000003';

test('initial HTML and settings fallback use 11Drive', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const settings = await readFile(new URL('../src/lib/siteSettings.ts', import.meta.url), 'utf8');
  assert.match(html, /<title>11Drive —/);
  assert.match(settings, /site_name: '11Drive'/);
  assert.doesNotMatch(html + settings, /Drivevell|GariLink/);
  assert.match(settings, /document\.title = `\$\{settings\.site_name\}/);
});

test('branding migration cleans only generated text, preserves history and follows future settings', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE TABLE site_settings(key text PRIMARY KEY,value text);
      INSERT INTO site_settings VALUES ('site_name','11Drive');
      CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,type text,title text,body text,data jsonb,read boolean DEFAULT false,created_at timestamptz DEFAULT now());
      CREATE TABLE connections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),recipient_id uuid);
      CREATE TABLE conversations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),driver_id uuid,owner_id uuid,admin_id uuid,last_message_at timestamptz);
      CREATE TABLE conversation_admins(conversation_id uuid,admin_id uuid);
      CREATE TABLE messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),conversation_id uuid,sender_id uuid,content text,created_at timestamptz DEFAULT now());
      CREATE TABLE registration_terms_acceptances(site_name text);
      INSERT INTO registration_terms_acceptances VALUES ('Drivevell');
      CREATE FUNCTION notify_new_connection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
      CREATE FUNCTION notify_new_message() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
      REVOKE ALL ON FUNCTION notify_new_connection(),notify_new_message() FROM PUBLIC;
      CREATE TRIGGER notify_connection AFTER INSERT ON connections FOR EACH ROW EXECUTE FUNCTION notify_new_connection();
      CREATE TRIGGER notify_message AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION notify_new_message();
    `);
    const templates = [
      ['message', 'New message on Drivevell', 'You have a new message on Drivevell'],
      ['message', 'New message on drivevell', 'You have a new message on drivevell'],
      ['message', 'New message', 'You have a new message on GariLink'],
      ['connection_request', 'New connection request', 'You have a new connection request on GariLink.'],
      ['trust', 'Platform history approved', 'Your recent bolt history is now approved on Drivevell.'],
      ['trust', 'Trust Passport approved', 'Your Trust Passport is now approved on GariLink.'],
      ['warning', 'Warning', 'Member mentioned Drivevell in a report.'],
      ['message', 'New message', 'A member wrote: I used Drivevell.'],
      ['trust', 'Platform history approved', 'Your recent example history is now approved on Drivevell.'],
    ];
    for (const row of templates) {
      await db.query("INSERT INTO notifications(type,title,body,read,data,created_at) VALUES($1,$2,$3,true,'{\"path\":\"/chat/test\"}','2026-08-01')", row);
    }
    const before = (await db.query('SELECT * FROM notifications ORDER BY id')).rows;
    await db.query("INSERT INTO messages(content) VALUES ('I used Drivevell and GariLink.')");
    await db.exec(migration);
    const after = (await db.query('SELECT * FROM notifications ORDER BY id')).rows;
    assert.equal(after.length, before.length);
    for (let i = 0; i < before.length; i++) {
      const { title: oldTitle, body: oldBody, ...oldMetadata } = before[i];
      const { title, body, ...metadata } = after[i];
      assert.deepEqual(metadata, oldMetadata);
      if (templates.slice(0, 6).some(row => row[1] === oldTitle && row[2] === oldBody)) {
        assert.equal(body, oldBody.replace(/Drivevell|GariLink/gi, '11Drive'));
        assert.doesNotMatch(title + body, /Drivevell|GariLink/i);
      } else { assert.equal(title, oldTitle); assert.equal(body, oldBody); }
    }
    assert.equal((await db.query('SELECT content FROM messages')).rows[0].content, 'I used Drivevell and GariLink.');
    assert.equal((await db.query('SELECT site_name FROM registration_terms_acceptances')).rows[0].site_name, 'Drivevell');
    await db.exec(migration);
    assert.deepEqual((await db.query('SELECT * FROM notifications ORDER BY id')).rows, after);
    assert.equal((await db.query("SELECT has_function_privilege('anon','notify_new_connection()','EXECUTE') AS allowed")).rows[0].allowed, false);

    const conversation = (await db.query('INSERT INTO conversations(driver_id,owner_id,admin_id) VALUES($1,$2,$3) RETURNING id', [driver, owner, admin])).rows[0].id;
    await db.query('INSERT INTO conversation_admins VALUES($1,$2)', [conversation, admin]);
    for (const name of ['11Drive', 'Future Brand']) {
      await db.query("UPDATE site_settings SET value=$1 WHERE key='site_name'", [name]);
      const connection = (await db.query('INSERT INTO connections(recipient_id) VALUES($1) RETURNING id', [owner])).rows[0].id;
      const request = (await db.query("SELECT * FROM notifications WHERE data->>'connection_id'=$1", [connection])).rows[0];
      assert.equal(request.user_id, owner);
      assert.equal(request.body, `You have a new connection request on ${name}.`);
      await db.query('INSERT INTO messages(conversation_id,sender_id,content) VALUES($1,$2,$3)', [conversation, driver, `Personal message mentioning Drivevell ${name}`]);
      const notices = (await db.query('SELECT * FROM notifications WHERE title=$1', [`New message on ${name}`])).rows.filter(n => n.data?.conversation_id === conversation);
      assert.equal(notices.length, 2);
      assert.deepEqual(notices.map(n => n.user_id).sort(), [owner, admin].sort());
      assert.ok(notices.every(n => n.body === `You have a new message on ${name}`));
    }
    for (const value of ['', '   ', null]) {
      await db.query("UPDATE site_settings SET value=$1 WHERE key='site_name'", [value]);
      const connection = (await db.query('INSERT INTO connections(recipient_id) VALUES($1) RETURNING id', [owner])).rows[0].id;
      assert.equal((await db.query("SELECT body FROM notifications WHERE data->>'connection_id'=$1", [connection])).rows[0].body, 'You have a new connection request on 11Drive.');
    }
  } finally { await db.close(); }
});

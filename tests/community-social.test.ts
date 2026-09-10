import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  mergeCommunityMessages,
  type CommunityMessage,
} from "../src/lib/community.ts";

test("late fetches cannot undo newer community reactions or moderation", () => {
  const message = {
    id: "m",
    alias: "Member example",
    member_role: "driver",
    body: "Hi",
    created_at: new Date().toISOString(),
    removed: false,
    filtered: false,
    revision: 4,
    reactions: { "👍": 2 },
  } as CommunityMessage;
  assert.deepEqual(
    mergeCommunityMessages(
      [message],
      [{ ...message, revision: 3, reactions: {} }],
    )[0].reactions,
    { "👍": 2 },
  );
});
test("community guidelines, replies, reactions and pins are authorised and private", async (t) => {
  const db = new PGlite();
  const driver = "30000000-0000-4000-8000-000000000001";
  const owner = "30000000-0000-4000-8000-000000000002";
  const admin = "30000000-0000-4000-8000-000000000003";
  const source = crypto.randomUUID();
  const reply = crypto.randomUUID();
  try {
    await db.exec(
      `CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE TABLE profiles(id uuid PRIMARY KEY,role text,is_suspended boolean DEFAULT false); CREATE TABLE site_settings(key text PRIMARY KEY,value text,updated_at timestamptz DEFAULT now()); CREATE TABLE notifications(user_id uuid,type text,title text,body text,data jsonb); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; GRANT USAGE ON SCHEMA public,auth TO anon,authenticated; CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin' AND NOT is_suspended)$$;`,
    );
    for (const [id, role] of [
      [driver, "driver"],
      [owner, "owner"],
      [admin, "admin"],
    ]) {
      await db.query("INSERT INTO auth.users VALUES($1)", [id]);
      await db.query("INSERT INTO profiles(id,role) VALUES($1,$2)", [id, role]);
    }
    for (const name of [
      "20260910130000_anonymous_community",
      "20260910150000_community_posting_identity",
      "20260910160000_community_guidelines_and_conversation",
      "20260910161000_active_admin_access",
    ])
      await db.exec(readFileSync(`supabase/migrations/${name}.sql`, "utf8"));
    const actor = async (id: string) => {
      await db.exec("RESET ROLE");
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
      await db.exec("SET ROLE authenticated");
    };
    const accept = async () =>
      db.query("SELECT community_accept_rules('2026-09-10')");
    const clearRate = async () => {
      await db.exec(
        "RESET ROLE; UPDATE operations_private.community_members SET reaction_updated_at=NULL; UPDATE operations_private.community_authors SET created_at=clock_timestamp()-interval '2 minutes'",
      );
    };
    await t.test(
      "reading remains allowed, but posting requires the current agreement",
      async () => {
        await actor(admin);
        await db.query("SELECT admin_community_action('enable')");
        await actor(driver);
        assert.equal(
          (await db.query("SELECT community_session() s")).rows[0].s
            .rules_accepted,
          false,
        );
        assert.equal(
          (await db.query("SELECT * FROM community_page()")).rows.length,
          0,
        );
        await assert.rejects(
          db.query("SELECT community_send($1,$2)", ["Hello", source]),
          /guidelines/,
        );
        await assert.rejects(
          db.query("SELECT community_accept_rules('old')"),
          /latest/,
        );
        await assert.rejects(
          db.query(
            "UPDATE operations_private.community_members SET rules_version='2026-09-10'",
          ),
          /permission denied/,
        );
        await accept();
        assert.equal(
          (await db.query("SELECT community_session() s")).rows[0].s
            .rules_accepted,
          true,
        );
        const sent = (
          await db.query("SELECT (community_send($1,$2)).*", [
            "A useful tip. Call 0712345678",
            source,
          ])
        ).rows[0];
        assert.equal(sent.body, "A useful tip. Call [Phone number removed]");
        assert.ok(!JSON.stringify(sent).includes(driver));
      },
    );
    await t.test(
      "replies store only a safe message reference and cannot impersonate Support",
      async () => {
        await actor(owner);
        await accept();
        await assert.rejects(
          db.query("SELECT community_send($1,$2,true,$3)", [
            "Reply",
            reply,
            crypto.randomUUID(),
          ]),
          /no longer available/,
        );
        const sent = (
          await db.query("SELECT (community_send($1,$2,true,$3)).*", [
            "Thanks for the advice 👋",
            reply,
            source,
          ])
        ).rows[0];
        assert.equal(sent.reply_to, source);
        assert.equal(sent.member_role, "owner");
        assert.ok(!("reply_body" in sent));
      },
    );
    await t.test(
      "reactions are idempotent, one choice per member, and expose no account identities",
      async () => {
        const first = (
          await db.query("SELECT (community_react($1,'👍')).*", [source])
        ).rows[0];
        assert.deepEqual(first.reactions, { "👍": 1 });
        assert.ok(first.revision > 0);
        assert.deepEqual(
          (await db.query("SELECT (community_react($1,'👍')).*", [source]))
            .rows[0].reactions,
          { "👍": 1 },
        );
        await assert.rejects(
          db.query("SELECT community_react($1,'💡')", [source]),
          /wait a moment/,
        );
        await assert.rejects(
          db.query("SELECT * FROM operations_private.community_reactions"),
          /permission denied/,
        );
        assert.deepEqual(
          (await db.query("SELECT community_my_reactions($1) r", [[source]]))
            .rows[0].r,
          { [source]: "👍" },
        );
        await actor(driver);
        assert.deepEqual(
          (await db.query("SELECT community_my_reactions($1) r", [[source]]))
            .rows[0].r,
          {},
        );
        await clearRate();
        await actor(owner);
        assert.deepEqual(
          (await db.query("SELECT (community_react($1,'💡')).*", [source]))
            .rows[0].reactions,
          { "💡": 1 },
        );
        await assert.rejects(
          db.query("SELECT community_react($1,'not an emoji')", [source]),
          /Choose/,
        );
      },
    );
    await t.test(
      "only admins pin; one pin is visible; removal clears the pin and reactions",
      async () => {
        await assert.rejects(
          db.query("SELECT community_pin($1)", [source]),
          /Administrator/,
        );
        await actor(admin);
        await accept();
        await db.query("SELECT community_pin($1)", [source]);
        assert.equal(
          (await db.query("SELECT community_session() s")).rows[0].s
            .pinned_message.id,
          source,
        );
        await db.query("SELECT community_pin($1)", [reply]);
        assert.equal(
          (
            await db.query(
              "SELECT count(*)::int n FROM community_messages WHERE pinned",
            )
          ).rows[0].n,
          1,
        );
        await db.query("SELECT community_pin($1)", [source]);
        await db.query("SELECT admin_community_action('remove',$1)", [source]);
        const removed = (
          await db.query("SELECT * FROM community_messages WHERE id=$1", [
            source,
          ])
        ).rows[0];
        assert.equal(removed.pinned, false);
        assert.deepEqual(removed.reactions, {});
        assert.equal(
          (await db.query("SELECT community_session() s")).rows[0].s
            .pinned_message,
          null,
        );
        await assert.rejects(
          db.query("SELECT community_send($1,$2,false,$3)", [
            "Reply again",
            crypto.randomUUID(),
            source,
          ]),
          /no longer available/,
        );
      },
    );
    await t.test(
      "temporary bans, suspension and pause also block reactions and replies",
      async () => {
        await db.query(
          "SELECT admin_community_action('mute',$1,NULL,1,'Spam or scams')",
          [reply],
        );
        await actor(owner);
        await assert.rejects(
          db.query("SELECT community_react($1,'👍')", [reply]),
          /muted/,
        );
        await assert.rejects(
          db.query("SELECT community_send($1,$2,false,$3)", [
            "Blocked",
            crypto.randomUUID(),
            reply,
          ]),
          /muted/,
        );
        await actor(admin);
        await db.query("SELECT admin_community_action('disable')");
        await actor(driver);
        await assert.rejects(
          db.query("SELECT community_react($1,'👍')", [reply]),
          /paused/,
        );
        await assert.rejects(
          db.query("SELECT community_my_reactions($1)", [[source]]),
          /unavailable/,
        );
        await db.exec("RESET ROLE");
        await db.query("UPDATE profiles SET is_suspended=true WHERE id=$1", [
          driver,
        ]);
        await actor(driver);
        await assert.rejects(accept(), /active member/);
        await db.exec("RESET ROLE; SET ROLE anon");
        for (const sql of [
          "SELECT community_accept_rules('2026-09-10')",
          `SELECT community_react('${reply}','👍')`,
          `SELECT community_pin('${reply}')`,
          `SELECT community_send('Hello','${crypto.randomUUID()}',false,NULL)`,
        ])
          await assert.rejects(db.query(sql), /permission denied/);
      },
    );
    await t.test(
      "suspended admins cannot moderate or use the shared admin privilege helper",
      async () => {
        await db.exec("RESET ROLE");
        await db.query("UPDATE profiles SET is_suspended=true WHERE id=$1", [
          admin,
        ]);
        await actor(admin);
        assert.equal(
          (await db.query("SELECT is_admin() allowed")).rows[0].allowed,
          false,
        );
        await assert.rejects(
          db.query("SELECT community_pin($1)", [reply]),
          /Administrator access/,
        );
        await assert.rejects(
          db.query("SELECT admin_community_action('enable')"),
          /Administrator access/,
        );
        await assert.rejects(
          db.query("SELECT admin_community_overview()"),
          /Administrator access/,
        );
        await db.exec("RESET ROLE");
        await db.query("UPDATE profiles SET is_suspended=false WHERE id=$1", [
          admin,
        ]);
        await actor(admin);
        assert.equal(
          (await db.query("SELECT is_admin() allowed")).rows[0].allowed,
          true,
        );
      },
    );
    await t.test(
      "deleting an account removes its reaction from public totals",
      async () => {
        await db.exec("RESET ROLE");
        await db.query(
          "INSERT INTO operations_private.community_reactions VALUES($1,$2,'👏')",
          [reply, driver],
        );
        assert.deepEqual(
          (
            await db.query(
              "SELECT reactions FROM community_messages WHERE id=$1",
              [reply],
            )
          ).rows[0].reactions,
          { "👏": 1 },
        );
        await db.query("DELETE FROM auth.users WHERE id=$1", [driver]);
        assert.deepEqual(
          (
            await db.query(
              "SELECT reactions FROM community_messages WHERE id=$1",
              [reply],
            )
          ).rows[0].reactions,
          {},
        );
      },
    );
  } finally {
    await db.close();
  }
});

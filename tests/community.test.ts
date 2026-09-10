import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  filterCommunityText,
  validCommunityDraft,
  mergeCommunityMessages,
  type CommunityMessage,
} from "../src/lib/community.ts";

const phoneCases = [
  "Call 0712345678 please",
  "Call +254 712 345 678 please",
  "Call (0712) 345-678 please",
  "Call ٠٧١٢٣٤٥٦٧٨ please",
  "Call ۰۷۱۲۳۴۵۶۷۸ please",
  "Call ０７１２３４５６７８ please",
  "Call 0\u200b7\u200b1\u200b2345678 please",
  "Call O7I2345678 please",
  "zero seven one two three four five six seven eight",
  "sifuri saba moja mbili tatu nne tano sita saba nane",
  "my number is zero 7 one 2345678",
  "number 0️⃣7️⃣1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣8️⃣",
];
test("community previews redact contact details but retain ordinary chat and emoji", () => {
  for (const value of phoneCases)
    assert.ok(
      filterCommunityText(value).includes("[Phone number removed]"),
      value,
    );
  assert.equal(
    filterCommunityText("A 2018 Toyota costs 2500 a day 👋"),
    "A 2018 Toyota costs 2500 a day 👋",
  );
  assert.equal(
    filterCommunityText("Try https://example.test/?phone=0712345678"),
    "Try [Link removed]",
  );
  assert.equal(
    filterCommunityText("Email person@example.com"),
    "Email [Email removed]",
  );
  assert.equal(validCommunityDraft("0712345678"), false);
  assert.equal(validCommunityDraft(" ".repeat(5)), false);
  assert.equal(validCommunityDraft("a".repeat(1001)), false);
  assert.equal(validCommunityDraft("Hello everyone 👋"), true);
});
test("realtime rows merge once in chronological order and stale fetches cannot restore removals", () => {
  const a = {
    id: "a",
    alias: "Member test",
    member_role: "driver",
    body: "Hello",
    created_at: "2026-09-10T10:00:00Z",
    removed: false,
    filtered: false,
  } as CommunityMessage;
  const b = { ...a, id: "b", created_at: "2026-09-10T10:01:00Z" };
  assert.deepEqual(
    mergeCommunityMessages([b], [a, b]).map((row) => row.id),
    ["a", "b"],
  );
  assert.equal(
    mergeCommunityMessages([{ ...a, removed: true, body: "Removed" }], [a])[0]
      .body,
    "Removed",
  );
});
test("community UI keeps moderation separate, uses text-only rendering, and disables send while pending", () => {
  const ui = readFileSync("src/components/CommunityRoom.tsx", "utf8");
  assert.doesNotMatch(
    ui,
    /dangerouslySetInnerHTML|<img|<iframe|<video|type="file"/,
  );
  assert.match(ui, /aria-label="Community message history"/);
  assert.match(ui, /overflow-y-auto/);
  const css = readFileSync("src/styles/community.css", "utf8");
  assert.match(css, /\.dark \.community-room > header/);
  assert.match(css, /\.dark \.community-room > footer/);
  assert.match(css, /\.dark \.community-bubble/);
  assert.match(ui, /disabled=\{sending\s*\|\|\s*!enabled/);
  assert.match(
    readFileSync("src/pages/CommunityPage.tsx", "utf8"),
    /p_client_id:\s*pending.current.id/,
  );
  assert.match(
    readFileSync("src/components/Header.tsx", "utf8"),
    /settings.community_enabled === 'true'/,
  );
});
test("community database enforces anonymity, filtering, moderation, pause and spam protections", async (t) => {
  const db = new PGlite();
  const ids = {
    driver: "10000000-0000-4000-8000-000000000001",
    owner: "10000000-0000-4000-8000-000000000002",
    admin: "10000000-0000-4000-8000-000000000003",
    suspended: "10000000-0000-4000-8000-000000000004",
  };
  const messageId = "20000000-0000-4000-8000-000000000001";
  try {
    await db.exec(
      `CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE TABLE public.profiles(id uuid PRIMARY KEY,role text,is_suspended boolean DEFAULT false);CREATE TABLE public.site_settings(key text PRIMARY KEY,value text,updated_at timestamptz DEFAULT now());CREATE TABLE public.notifications(user_id uuid,type text,title text,body text,data jsonb);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin' AND NOT is_suspended)$$;`,
    );
    for (const [role, id] of Object.entries(ids)) {
      await db.query("INSERT INTO auth.users VALUES($1)", [id]);
      await db.query("INSERT INTO profiles VALUES($1,$2,$3)", [
        id,
        role === "suspended" ? "driver" : role,
        role === "suspended",
      ]);
    }
    await db.exec(
      readFileSync(
        "supabase/migrations/20260910130000_anonymous_community.sql",
        "utf8",
      ),
    );
    const actor = async (role: keyof typeof ids | "anon") => {
      await db.exec("RESET ROLE");
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [
        role === "anon" ? "" : ids[role],
      ]);
      await db.exec(`SET ROLE ${role === "anon" ? "anon" : "authenticated"}`);
    };
    await db.exec(
      readFileSync(
        "supabase/migrations/20260910150000_community_posting_identity.sql",
        "utf8",
      ),
    );
    const releaseRate = async () => {
      await db.exec(
        "RESET ROLE;UPDATE operations_private.community_authors SET created_at=now()-interval '2 minutes'",
      );
    };
    await t.test(
      "frontend and server filter all tested phone formats identically",
      async () => {
        for (const value of [
          ...phoneCases,
          "Try https://example.test/x",
          "Email user@example.com",
          "Toyota 2018 costs 2500",
        ])
          assert.equal(
            (await db.query("SELECT community_filter($1) body", [value]))
              .rows[0].body,
            filterCommunityText(value),
            value,
          );
      },
    );
    await t.test(
      "disabled by default and anonymous requests cannot read or post",
      async () => {
        await actor("driver");
        await assert.rejects(
          db.query("SELECT community_send($1,$2)", ["Hello", messageId]),
          /paused/,
        );
        await actor("anon");
        await assert.rejects(
          db.query("SELECT * FROM community_messages"),
          /permission denied/,
        );
        await assert.rejects(
          db.query("SELECT community_session()"),
          /permission denied/,
        );
      },
    );
    await t.test(
      "only admin enables the room; identity is stable and private",
      async () => {
        await actor("driver");
        await assert.rejects(
          db.query("SELECT admin_community_action('enable')"),
          /Administrator/,
        );
        await actor("admin");
        await db.query("SELECT admin_community_action('enable')");
        await actor("driver");
        const first = (await db.query("SELECT community_session() s")).rows[0]
          .s;
        assert.match(first.alias, /^Member [a-f0-9]{10}$/);
        assert.equal(
          (await db.query("SELECT community_session() s")).rows[0].s.alias,
          first.alias,
        );
        await assert.rejects(
          db.query("SELECT * FROM operations_private.community_members"),
          /permission denied/,
        );
      },
    );
    await t.test(
      "server filters before storage; retries are idempotent; direct writes denied",
      async () => {
        await actor("driver");
        const sent = (
          await db.query("SELECT (community_send($1,$2)).*", [
            "Call 0712345678 please",
            messageId,
          ])
        ).rows[0];
        assert.equal(sent.body, "Call [Phone number removed] please");
        assert.equal(sent.filtered, true);
        assert.ok(!JSON.stringify(sent).includes(ids.driver));
        assert.equal(
          (
            await db.query("SELECT (community_send($1,$2)).*", [
              "Call 0712345678 please",
              messageId,
            ])
          ).rows[0].id,
          messageId,
        );
        await assert.rejects(
          db.query(
            "INSERT INTO community_messages(alias,member_role,body) VALUES('Fake','admin','Hi')",
          ),
          /permission denied/,
        );
        await assert.rejects(
          db.query("SELECT community_send($1,$2)", [
            "Again",
            crypto.randomUUID(),
          ]),
          /slow down/,
        );
        await releaseRate();
      },
    );
    await t.test(
      "owner receives safe history; empty/contact-only messages never publish",
      async () => {
        await actor("owner");
        assert.equal(
          (await db.query("SELECT * FROM community_page()")).rows[0].body,
          "Call [Phone number removed] please",
        );
        for (const body of [
          "",
          "0712345678",
          "zero seven one two three four five six seven eight",
          "x".repeat(1001),
        ])
          await assert.rejects(
            db.query("SELECT community_send($1,$2)", [
              body,
              crypto.randomUUID(),
            ]),
          );
      },
    );
    await t.test(
      "reporting is private and idempotent; members cannot moderate or change ratings",
      async () => {
        await actor("owner");
        await db.query("SELECT community_report($1,$2)", [
          messageId,
          "personal_details",
        ]);
        await db.query("SELECT community_report($1,$2)", [
          messageId,
          "personal_details",
        ]);
        await assert.rejects(
          db.query("SELECT admin_community_overview()"),
          /Administrator/,
        );
        await assert.rejects(
          db.query("SELECT admin_community_action('remove',$1)", [messageId]),
          /Administrator/,
        );
        await actor("admin");
        const overview = (await db.query("SELECT admin_community_overview() s"))
          .rows[0].s;
        assert.equal(overview.reports[0].reports, 1);
        await db.exec("RESET ROLE");
        assert.equal(
          (await db.query("SELECT count(*)::int n FROM notifications")).rows[0]
            .n,
          1,
        );
      },
    );
    await t.test(
      "moderators remove and mute; only moderators can unmute; history stays",
      async () => {
        await actor("admin");
        await db.query("SELECT admin_community_action('remove',$1)", [
          messageId,
        ]);
        await db.query("SELECT admin_community_action('mute',$1)", [messageId]);
        assert.equal(
          (await db.query("SELECT admin_community_overview() s")).rows[0].s
            .reports.length,
          0,
        );
        await actor("driver");
        await assert.rejects(
          db.query("SELECT community_send($1,$2)", [
            "Hello",
            crypto.randomUUID(),
          ]),
          /muted/,
        );
        const alias = (await db.query("SELECT community_session() s")).rows[0].s
          .alias;
        assert.equal(
          (await db.query("SELECT * FROM community_page()")).rows[0].removed,
          true,
        );
        await actor("admin");
        await db.query("SELECT admin_community_action('unmute',NULL,$1)", [
          alias,
        ]);
        await actor("driver");
        await db.query("SELECT community_send($1,$2)", [
          "Back again",
          crypto.randomUUID(),
        ]);
      },
    );
    await t.test(
      "suspended users and the off switch block backend access, not only buttons",
      async () => {
        await actor("suspended");
        await assert.rejects(
          db.query("SELECT community_session()"),
          /active member/,
        );
        assert.equal(
          (await db.query("SELECT * FROM community_messages")).rows.length,
          0,
        );
        await actor("admin");
        await db.query("SELECT admin_community_action('disable')");
        assert.equal(
          (await db.query("SELECT * FROM community_page()")).rows.length,
          2,
        );
        await actor("owner");
        assert.equal(
          (await db.query("SELECT * FROM community_messages")).rows.length,
          0,
        );
        await assert.rejects(
          db.query("SELECT * FROM community_page()"),
          /unavailable/,
        );
        await assert.rejects(
          db.query("SELECT community_send($1,$2)", [
            "Try",
            crypto.randomUUID(),
          ]),
          /paused/,
        );
      },
    );
    await t.test(
      "history pagination has no duplicates even when timestamps match",
      async () => {
        await db.exec(
          "RESET ROLE;INSERT INTO public.community_messages(alias,member_role,body) SELECT 'Member pagination','driver','Synthetic history '||n FROM generate_series(1,65) n",
        );
        await actor("admin");
        const first = (await db.query("SELECT * FROM community_page()")).rows;
        assert.equal(first.length, 50);
        const last = first[first.length - 1];
        const second = (
          await db.query("SELECT * FROM community_page($1,$2)", [
            last.created_at,
            last.id,
          ])
        ).rows;
        assert.equal(second.length, 17);
        assert.equal(
          new Set([...first, ...second].map((row) => row.id)).size,
          67,
        );
      },
    );
    await t.test(
      "minute rate limit blocks bursts even after the three-second gap",
      async () => {
        await db.exec("RESET ROLE");
        await db.query(
          "INSERT INTO operations_private.community_authors(message_id,user_id,created_at) SELECT id,$1,clock_timestamp()-interval '5 seconds' FROM public.community_messages WHERE alias='Member pagination' LIMIT 10",
          [ids.admin],
        );
        await actor("admin");
        await db.query("SELECT admin_community_action('enable')");
        await assert.rejects(
          db.query("SELECT community_send($1,$2)", [
            "One more",
            crypto.randomUUID(),
          ]),
          /slow down/,
        );
      },
    );
    await t.test(
      "admin can post as a stable alias or Support without changing existing messages",
      async () => {
        await releaseRate();
        await actor("admin");
        const session = (await db.query("SELECT community_session() s")).rows[0]
          .s;
        assert.match(session.member_alias, /^Member [a-f0-9]{10}$/);
        assert.notEqual(session.alias, session.member_alias);
        const aliasId = crypto.randomUUID();
        const alias = (
          await db.query("SELECT (community_send($1,$2,false)).*", [
            "A community tip 👋",
            aliasId,
          ])
        ).rows[0];
        assert.equal(alias.alias, session.member_alias);
        assert.equal(alias.member_role, "member");
        assert.ok(!JSON.stringify(alias).includes(ids.admin));
        const retried = (
          await db.query("SELECT (community_send($1,$2,true)).*", [
            "A community tip 👋",
            aliasId,
          ])
        ).rows[0];
        assert.deepEqual(
          retried,
          alias,
          "Retry never relabels a published message",
        );
        await releaseRate();
        await actor("admin");
        const support = (
          await db.query("SELECT (community_send($1,$2,true)).*", [
            "Support can help.",
            crypto.randomUUID(),
          ])
        ).rows[0];
        assert.equal(support.member_role, "admin");
        assert.equal(support.alias, "Community moderator");
        assert.equal(
          (
            await db.query(
              "SELECT member_role FROM community_messages WHERE id=$1",
              [aliasId],
            )
          ).rows[0].member_role,
          "member",
        );
        await db.exec("RESET ROLE");
        assert.equal(
          (
            await db.query(
              "SELECT user_id FROM operations_private.community_authors WHERE message_id=$1",
              [aliasId],
            )
          ).rows[0].user_id,
          ids.admin,
        );
        await releaseRate();
        await actor("owner");
        const normal = (
          await db.query("SELECT (community_send($1,$2,true)).*", [
            "An owner tip.",
            crypto.randomUUID(),
          ])
        ).rows[0];
        assert.equal(
          normal.member_role,
          "owner",
          "Members cannot impersonate support",
        );
        await actor("anon");
        await assert.rejects(
          db.query("SELECT community_send($1,$2,false)", [
            "Hi",
            crypto.randomUUID(),
          ]),
          /permission denied/,
        );
      },
    );
    await t.test(
      "timed bans block posting server-side, expire automatically, and allow early unban",
      async () => {
        await releaseRate();
        await actor("owner");
        await assert.rejects(
          db.query(
            "SELECT admin_community_action('mute',$1,NULL,1,'Spam or scams')",
            [messageId],
          ),
          /Administrator/,
        );
        await actor("admin");
        for (const hours of [0, 721, -1])
          await assert.rejects(
            db.query("SELECT admin_community_action('mute',$1,NULL,$2)", [
              messageId,
              hours,
            ]),
            /Choose a ban/,
          );
        await db.query(
          "SELECT admin_community_action('mute',$1,NULL,1,'Spam or scams')",
          [messageId],
        );
        const active = (await db.query("SELECT admin_community_overview() s"))
          .rows[0].s.muted;
        assert.equal(active.length, 1);
        assert.equal(active[0].muted_reason, "Spam or scams");
        assert.ok(Date.parse(active[0].muted_until) > Date.now() + 3500000);
        await actor("driver");
        const blocked = (await db.query("SELECT community_session() s")).rows[0]
          .s;
        assert.equal(blocked.muted, true);
        assert.equal(blocked.muted_reason, "Spam or scams");
        await assert.rejects(
          db.query("SELECT community_send($1,$2,false)", [
            "Blocked",
            crypto.randomUUID(),
          ]),
          /muted/,
        );
        await db.exec(
          "RESET ROLE;UPDATE operations_private.community_members SET muted_until=clock_timestamp()-interval '1 second' WHERE muted",
        );
        await actor("driver");
        assert.equal(
          (await db.query("SELECT community_session() s")).rows[0].s.muted,
          false,
        );
        await db.query("SELECT community_send($1,$2)", [
          "My timed ban ended.",
          crypto.randomUUID(),
        ]);
        await actor("admin");
        assert.equal(
          (await db.query("SELECT admin_community_overview() s")).rows[0].s
            .muted.length,
          0,
        );
        await db.query(
          "SELECT admin_community_action('mute',$1,NULL,168,'Community rules violation')",
          [messageId],
        );
        await db.query("SELECT admin_community_action('unmute',NULL,$1)", [
          blocked.member_alias,
        ]);
        await actor("driver");
        const unbanned = (await db.query("SELECT community_session() s"))
          .rows[0].s;
        assert.equal(unbanned.muted, false);
        assert.equal(unbanned.muted_until, null);
        assert.equal(unbanned.muted_reason, null);
        await db.exec("RESET ROLE");
        const audit = (
          await db.query(
            "SELECT details FROM operations_private.community_actions WHERE action='mute' AND details->>'ban_reason'='Spam or scams'",
          )
        ).rows;
        assert.equal(audit.length, 1);
        assert.ok(audit[0].details.ban_until);
      },
    );
  } finally {
    await db.close();
  }
});

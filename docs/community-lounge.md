# Community lounge

## Enable and use

The room starts **off**. Open `/admin?tab=community`, choose **Turn community on**, and confirm. Drivers and car owners then see **Community lounge** in their account menu and dashboard overview. Its direct URL is `/community`.

This is one shared group, separate from private connections and support Messages. It does not reserve vehicles, change availability, change ratings, or expose private-chat history. The existing authenticated/onboarding/suspension guards still apply.

Turning the room off blocks new messages at the database and hides community history from ordinary members. It does not delete saved messages. Administrators retain moderation access while it is off.

## Privacy and moderation

- A random, persistent alias and driver/owner role are visible instead of a real name, photo or profile link. Administrators post as **Official moderator**.
- The public/realtime message table contains no account ID. Account mappings, reports and audit records are in the private schema; member roles cannot read them. This is anonymity from other members, not from platform administrators.
- The server filters recognised phone formats before storage and realtime delivery, even if someone bypasses JavaScript. The composer previews the filtered message. Formats tested include spaced/international numbers, common Unicode digits, invisible separators and English/Swahili digit words.
- The room is text-only; recognised URLs and emails are removed too. No filter can guarantee detection of every deliberate encoding, cross-message fragment or identifying statement. Users should not share personal details and should report anything missed.
- Posting is limited to one message per three seconds and ten per minute. Request IDs make retries idempotent. Suspended accounts cannot participate.
- Members can report another member's post privately. The first report creates an admin notification linking to Community. Administrators can remove a message, mute/unmute community posting, or dismiss a report. These actions require confirmation and keep a private audit record; they do not affect private chats or ratings.
- Messages are paginated in batches of 50. Removed posts retain a removal marker; stale refreshes cannot restore their previous body. Turning the room off does not erase records. No automatic retention/deletion schedule has been added for community records.

## Implementation

`20260910130000_anonymous_community.sql` adds the isolated schema objects and safe RPCs. The targeted deployment script is `node scripts/release-community.mjs --apply`; it checks the intended project, uses a transaction, records migration history and verifies privileges/publication membership. Repeating it verifies an existing installation without enabling the room.

Realtime listens only for INSERT/UPDATE changes to the sanitized message table; polling every 15 seconds while visible is a connection fallback. This follows the [Supabase Postgres Changes publication and RLS model](https://supabase.com/docs/guides/realtime/postgres-changes). No client-to-client presence or typing payload exposes account IDs.

## Verification, 10 September 2026

- All 183 repository tests passed, including isolated PostgreSQL-compatible tests with synthetic driver, owner, admin, suspended and anonymous identities.
- TypeScript and production build passed. ESLint has no errors; 11 pre-existing warnings remain outside this feature.
- Real `CommunityRoom`, shared modal and confirmation components tested in local browser fixtures: desktop and 360px-wide layouts at 640px/800px height, light/dark contrast, typing, redaction preview, sending/loading, draft clearing, scrollback, incoming-message jump, reporting, administrator removal and pausing. Fixtures never connect to Supabase or post to real users.
- Browser testing found and corrected post-send scroll positioning and white surfaces in dark mode. Hot-reload fixture errors were cleared by a fresh reload; the final reloaded preview worked.
- Production migration/permissions/publication were verified. The room remains off and no live test posts, reports or notifications were created.
- Not yet tested on a physical Android/iPhone keyboard, at production group-chat load, or as an end-to-end live two-device exchange. Before opening to everyone, enable it for a supervised check with two of your existing test accounts, then test sending, masking, reports and the off switch from a real phone.

Local fixtures: `/tests/fixtures/community.html` and `/tests/fixtures/community-mobile.html` on the Vite development server. They are not production routes or a separate chat product.

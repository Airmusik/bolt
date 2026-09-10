# Community follow-up release

- Incoming community messages have an optional soft chime. The device preference is saved. Initial history, older-page loads, edits, duplicate events and the current device's own sends are silent. Rapid arrivals are throttled. Audio requires browser-allowed interaction and plays while the room tab is visible and focused; this is not background push notification audio.
- `/community` fills the mobile visual viewport with its own Back control. The existing room resizes without remounting when the viewport changes. Desktop retains the usual site navigation. Mobile Admin → Community keeps moderation controls and provides **Open full-page community chat**.
- Admins choose **Post as → My alias / Official Support**. The server decides the public identity before inserting/broadcasting. Old messages retain their original posting identity, and normal accounts cannot claim Support. The private author mapping is unchanged.
- **Ban from community** requires confirmation, a duration (1 hour, 24 hours, 7 days, 30 days, or indefinite) and a reason. The ban prevents community posting only; history remains readable, private chats and ratings are unaffected. Members see the reason and expiry. **Community controls → Community bans → Unban** restores posting early. Timed bans expire on server time without a cron job; the open page refreshes session state on its normal fallback check.
- Database migration: `20260910150000_community_posting_identity.sql`. Release command: `node scripts/release-community-identity.mjs --apply`. The migration is transactional, preserves the room switch/history, and retains old RPC call compatibility through default arguments. Private tables remain inaccessible to normal clients and are not published to Realtime.

## Verification

- Automated SQL tests use isolated PGlite and synthetic members: identity modes, immutable old identities, member impersonation rejection, contact filtering, direct-write denial, pause controls, rate limits, timed expiry, early unban, and private moderation audit.
- Audio tests verify first-load silence, duplicate/history suppression, own-send suppression, fallback arrivals, gesture-unlocked playback and throttling.
- Browser fixtures use the production room/frame/ban dialog without contacting Supabase. Checked desktop and 360px-wide mobile frames at 640px and 400px heights, light/dark contrast, typing/sending, alias switching, sound controls and ban duration/reason confirmation. A resize observer keeps the latest message visible when the reader is at the bottom.
- These are browser viewport tests, not physical Android/iPhone keyboard or loudspeaker tests. No live community test messages or real member bans were created during release.

## Rollback

The prior frontend can use the upgraded RPC defaults. Do not revert the schema by dropping messages or author records; leave the additive fields/functions installed if reverting the UI. Admin can pause the community normally if needed.

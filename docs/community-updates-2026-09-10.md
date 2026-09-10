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
- Final local suite: **200 tests passed, zero failures**; TypeScript and production build passed. Lint has zero errors and nine existing Fast Refresh warnings. `npm audit` reported zero known vulnerabilities at release time.
- The 21-route live HTTP availability check passed. Browser checks covered the real community components on desktop and 360px mobile frames, including guidelines acknowledgement, reply/send, reactions, pins, admin identity selection, and light/dark short-height layouts. Authenticated workflows were tested with synthetic accounts in an isolated database, not by changing real member records.

## Rollback

RPC defaults retain compatibility with older argument lists. After the guidelines migration, however, members must use a frontend that can accept the guidelines before posting. If reverting to an older frontend, pause the community rather than remove that requirement or drop history. Leave additive fields and private author records installed.

## Conversation tools and community guidelines

- A welcome panel links to readable guidelines covering privacy, respectful conduct, scams, appropriate topics, moderation and appeals. The current version and acceptance time are stored privately, and the server requires acceptance before posting or reacting. Reading does not require agreement.
- Replies reference the original message rather than saving a second copy. Removing an original message therefore removes its harmful text from loaded quotes too. Older references outside loaded history show an explicit placeholder.
- Four reactions (thumbs-up, idea, applause, heart) allow one choice per account per message. Clicking the same reaction removes it. Counts are public; reaction identities are private. They never affect profile ratings. Spam throttling and bans apply to reactions too.
- Admins can pin one message for everyone. The compact pinned strip expands without covering the mobile composer. Removing the message clears its pin and public reactions.
- Row moderation actions are grouped under **Moderate**. The existing reporting, saved history, phone/email/link filtering and community on/off switch remain in place.
- Subtle arrival/reaction feedback respects reduced-motion preferences. Empty rooms offer optional conversation starters; no fake conversations or engagement are generated.
- Public rows carry monotonic revisions so a slow fetch cannot replace a newer reaction or moderation update.
- Database releases: `20260910160000_community_guidelines_and_conversation.sql` and `20260910161000_active_admin_access.sql`; apply using `node scripts/release-community-conversation.mjs --apply`. The release checks private-table permissions and preserves the current enabled setting and messages.

### Broader site refinements

- Shared admin privileges now reject suspended admin accounts, without changing active accounts or the chosen MFA setting. Existing access-control tests re-run with this helper installed.
- The guided assistant clears its component state when accounts change, so the previous account's summary/history does not remain on a shared browser.
- Assistant labels and support responses use the current admin-controlled site name.
- Assistant article order can be cleared and accepts zero correctly; invalid numeric values receive a clear error. Failed saves retain the draft. Failed loads no longer replace the answer list with an empty result.
- Assistant page links are restricted to internal site paths when saved and when rendered.
- The read-only live availability script now checks 21 public/protected route entry points and health. HTTP entry-point checks are not authenticated end-to-end tests.

### Reference patterns

The additions adapt established patterns rather than copy another product: a welcome/rules step from [Discord Server Guide](https://support.discord.com/hc/en-us/articles/13497665141655-Server-Guide-FAQ), and replies/reactions from [Discourse chat](https://www.discourse.org/plugins/chat). Attachments, personal contact exchange and public profiles remain excluded to protect the anonymous room's purpose.

# Drivevell — database access and backup audit

Date: 2 September 2026. Project: `bqgfrulkjibxunaofumx` (Supabase project name: `garilink`).

## Decision

**The confirmed permission findings have been fixed and applied to production. Backups remain outstanding.**
The findings below describe the pre-fix audit. After the owner's approval, migration
`20260902210000_access_control_audit_fixes.sql` was committed in Supabase and rechecked.
No member records, messages, reports or uploaded files were removed. No subscription or backup settings were changed.

## Remediation and verification

- Anonymous requests for email/phone now return HTTP **401**; public profile projections still return HTTP **206**, and both discovery RPCs return **200**.
- New member reports must start open. The database validates the reporter and conversation membership; forged resolved reports are rejected before affecting ratings.
- Direct browser inserts into conversations/admin memberships are disabled. Accepted connection/application RPCs still create the correct chat. Direct support messages continue through the existing Messages workflow.
- Admin chat reads require a legitimate member support invitation (open, reviewing or resolved), or an assigned legacy direct-support conversation. Dismissed cases do not grant member-chat access. Historical joined-admin rows alone do not bypass the invitation check.
- Join/close RPCs now check invitation access and their internal implementations cannot be called directly by client roles.
- Text/image RPCs and storage policies share checked chat-access rules. A related nullable-boolean participant check was replaced: a missing admin/member ID can no longer let an outsider skip permission checks.
- Contact-attachment policies now refer to the actual Storage object path, not the sender's name.
- Anonymous callers can no longer invoke mutation RPCs; reviewed public discovery/signup/RLS helpers remain available.
- Internal rating/availability recalculation functions are no longer ordinary-member RPCs.

Verification: **52 automated tests passed**, including 19 focused permission/workflow cases plus their parent test. Type-check, lint and production build passed. The new tests run offline against pre-fix schema metadata with synthetic data, then apply the migration.

The post-deployment read-only role checks continued to block unrelated member chats, proof files, reports, warnings and support threads. A second isolated reconstruction of the **deployed** schema confirmed the forged report/chat and uninvited-admin paths are blocked, while legitimate support attachment insertion works.

At deployment, aggregate counts were unchanged: 4 profiles, 54 messages, 3 reports, 23 Storage objects. This is a sanity check, not a replacement for backups. No production write tests or real test messages were sent.

Deployment SHA-256: `200807d7a0f99bccfe74c58257d2190c0fe6cd8832fae4b2e8fbae6c26fdb785`.
Source migration, diagnostic tooling and regression tests are saved locally; this task did not push a GitHub commit or change the frontend bundle. The database fix takes effect independently of a frontend deployment.

## Backups: no project backups available

The authenticated Supabase dashboard shows:

- Organization plan: **Free**.
- Project overview: **Last backup — No backups**.
- Database → Backups → Scheduled backups: **Free Plan does not include project backups**.

No restore was attempted. There was no project backup available to test.
External/manual backups cannot be ruled out merely from this dashboard; none were established by this audit.

Choose a recovery setup before launch:

1. Stay on Free: schedule database exports to a private, encrypted backup destination, with retention, failure alerts, and a separate copy away from this computer. A computer-only job runs only while that computer is on and connected.
2. Upgrade to a plan with automatic database backups; the dashboard offers Pro with up to seven days of scheduled backups. This requires the owner's billing approval.

Either option also needs **separate backups of uploaded Storage files**. Supabase database backups contain object metadata, not the actual images/PDFs. Test recovery into a separate disposable database/project, not production. Restoring production causes downtime and may discard newer data.

Sources: [project backup settings](https://supabase.com/dashboard/project/bqgfrulkjibxunaofumx/database/backups/scheduled), [Supabase backup guide](https://supabase.com/docs/guides/platform/backups).

## Original confirmed findings (now remediated)

### 1. High priority: anonymous access to private profile contacts

- Live `anon` has table-wide SELECT on `public.profiles`, including `email` and `phone`.
- The signed-in `authenticated` role correctly lacks direct SELECT on these private columns, but that does not protect the anonymous API.
- A read-only role check found three visible profiles with non-null private contact fields.
- An unauthenticated REST **HEAD** request selecting those columns returned HTTP 206 with three matching rows. No contact values were downloaded by that API check or included in this report.

Fix: revoke anonymous table-wide SELECT and grant only the reviewed public profile columns. Preserve the self-profile and admin-only RPCs for private contact access. Test both signed-out and signed-in API access afterward.

### 2. High priority: members can submit a report already marked resolved

- `reports_insert_own` only checks the reporter's identity. It does not require a new report to have `status = 'open'` or prevent caller-supplied moderation fields.
- With deployed rules and triggers copied into the isolated engine, a regular member inserted a synthetic report with `status = 'resolved'`.
- The rating trigger reduced the synthetic reported member's rating from **5.0 to 4.9** without administrator review.

Fix: require ordinary report submissions to start open and reject/overwrite moderation fields. Keep moderation transitions admin-only. Add a regression test checking that a forged resolved/reviewing report cannot change a rating.

### 3. High priority: conversation creation does not reliably validate participants

- In the deployed `conv_insert_validated` application branch, intended comparisons resolve to comparisons of an application's columns with themselves (for example `a.owner_id IS NOT DISTINCT FROM a.owner_id`).
- The connection branch checks that the caller belongs to an accepted connection, but does not bind the new conversation's members to that connection.
- The admin-chat branch permits a member to create a conversation containing another member and an admin without an accepted relationship or support invitation.
- Synthetic write probes reproduced mismatched application/connection conversations and the uninvited group-support case. The first two probes used accepted workflows without an existing conversation; an existing unique conversation can block duplicate insertion, but does not repair participant validation.

Fix: fully qualify outer `conversations` columns; validate both members and the vehicle against the accepted workflow. Restrict direct support threads to the intended single member/support relationship. Do not allow the support branch to bypass member-connection requirements.

This finding does **not** establish that an ordinary member can read another pair's pre-existing messages; those live read-isolation checks passed.

### 4. Privacy mismatch: invitation-only admin chat access is not enforced by the database

- Conversation/message SELECT policies include unconditional `is_admin()` access.
- The admin join RPC checks an invitation, but direct INSERT into `conversation_admins` only checks the administrator identity.
- In the isolated test, an admin read and joined a synthetic member conversation with no support invitation/report.

Fix: make database read/join rules match the intended invitation/support-case policy. Preserve authorised support access and saved history. Decide whether any emergency override is needed explicitly, with an audit trail; do not rely only on filtering the admin UI.

### 5. Functional defect: legitimate support attachments are rejected

- The deployed contact-attachment SELECT/INSERT policies use `storage.foldername(thread.name)` where they need the Storage object's path (`storage.objects.name`). `thread.name` is the sender's display name.
- A synthetic member uploading a PDF into their own valid support-thread folder was rejected by RLS.

Fix: qualify the Storage object path in both policies, preserving thread ownership/admin checks. Test that the member and support can upload/read, while unrelated members cannot.

## Checks that passed

- All **28 public application tables** have RLS enabled.
- All **32 existing automated tests** passed.
- Live read-only database-role tests covered anonymous access and the four existing account identities: one admin, two drivers, and one owner. Only aggregate counts were emitted.
- Ordinary members could not read unrelated conversations/messages, other members' proof records/files, notifications, reports, warnings, or direct support threads in the tested live data.
- The private email-reminder schema/configuration was inaccessible to anonymous and ordinary authenticated roles.
- The admin profile-list RPC rejected ordinary members and returned profiles for the administrator.
- In isolated write probes, members could not promote themselves, edit another member's profile/car, or directly alter their own rating.
- An owner attempting to approve a pending vehicle left it pending; an admin could approve it in the isolated test.
- Document, chat-media, and contact-attachment buckets are private. Avatar, vehicle-photo, and site-image buckets are public by design; a public bucket is not proof that every file inside it is appropriate to publish.

## Method and limitations

Production PostgreSQL work used explicit **BEGIN READ ONLY** transactions with rollback and a verified TLS connection through the session pooler. For row-isolation checks the session switched to `anon`/`authenticated` and supplied the relevant request claims; checks did not rely on postgres's RLS bypass. This evaluates the database rules, but is not a separate real-browser sign-in test for each account.

Write probes used an in-memory PGlite database with **synthetic users/data only**. It loaded deployed metadata for 30 tables (28 public plus Storage objects/buckets), 106 policies, 91 functions, and 35 enabled application triggers. Column types/defaults, public primary/unique/check constraints, and relevant grants were reproduced. Managed auth/storage foreign keys and managed service behaviour were not cloned. This is a focused permissions reproduction, **not a backup or full restore test**.

The audit did not test every RPC, cross-browser session, suspension edge case, attack class, or file-delivery path. Passing tests are not a complete security certification. The failures documented above were fixed and rechecked as described in the remediation section.

## Repeating the checks

Local diagnostic scripts (not deployed and no credentials embedded):

```powershell
npm.cmd test
node scripts/audit-db-access.mjs inventory
node scripts/audit-db-access.mjs probes
node scripts/audit-db-access.mjs anonymous-api
node scripts/audit-db-access.mjs isolated
```

The runner reads existing ignored local environment configuration. September 10 handover update: `npm ci` now installs the `pg` dependency; no machine-specific temporary runtime is required. An explicit `AUDIT_PG_MODULE` override remains available. The `isolated` mode reports observations, including unsafe allowed operations; exit code zero means the audit ran, **not** that security passed. An UPDATE returning no rows means RLS filtered it out, not that another user's record changed.

Keep real database exports and Storage backups out of GitHub. Confirm the backup destination, encryption/key recovery, retention, schedule and responsible operator before setting them up.

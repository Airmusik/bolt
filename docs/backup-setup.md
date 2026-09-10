# Backup and recovery — setup still partly pending

## Current verified position, 10 September 2026

An encrypted local backup was created at `C:\Users\PC\Desktop\bolt\.backups.local\2026-09-10T09-50-33-585Z`.
The isolated recovery check reconstructed **3,366 records from 83 tables**, verified every archive checksum, and recovered **15 Storage files**. **26 private Storage files are missing** because the local configuration has no server-only Storage key. This is a **PARTIAL** backup, not a full recovery solution.

The source database was accessed read-only. Data was encrypted using AES-256-GCM before writing to disk. The archive includes a native PostgreSQL custom-format dump and encrypted table data. Its recovery key is outside the archive at `.backup-keys.local/recovery-key.txt`, protected by this Windows account's folder permissions. Anyone with the recovery key and archive can decrypt the data; keep the key in a password manager or separate secure offline copy. Losing both this PC and the only recovery-key copy makes the backup unusable.

**Not completed:** private-file backup, off-site copy, recurring backup job, and a full managed Supabase/Auth/Storage restore rehearsal. Billing was not changed. The September 2 audit found no Supabase scheduled project backups; that provider setting was not rechecked for this release.

## Finish the private-file backup

1. In Supabase → Project Settings → API Keys, obtain a **server-only secret key**, or the legacy **service_role** key. It has broad access: never use it as a browser key or paste it into chat.
2. On this PC put it in the ignored `.env.backup.local` file as `SUPABASE_BACKUP_KEY=...`. Do not put it in a `VITE_*` variable.
3. Run `npm.cmd run backup:create`. Success requires zero missing files. A partial run exits nonzero and still preserves the data it could safely back up. Nothing deletes older backups.
4. Run `npm.cmd run backup:status`, then `npm.cmd run backup:verify -- "<backup-directory>"` for the chosen copy.

Portable PostgreSQL 17.11 tools were downloaded from EDB's official Windows binary link into the ignored `.tools.local/postgresql/pgsql/bin` directory. Another machine needs PostgreSQL 17 or newer tools; set `PG_BIN` to their directory. Node.js and `npm ci` supply the remaining dependencies.

## Choose off-site storage and automation

Use an access-controlled private cloud folder/bucket that you own, or an external drive stored separately. **Copy only the encrypted backup folder, not the recovery key beside it.** Never upload backups as GitHub files, public links, or website assets. The copy must include `manifest.enc` and all `.enc` files; `verification.json` contains status/counts only.

A private Google Drive/OneDrive folder you already use can be a starting point, once explicitly selected and checked. A PC-based daily job runs only while this PC is on and connected; a cloud-run backup job avoids that dependency but needs destination credentials and setup. No job is silently enabled before the private-file copy and destination are working. Proposed retention: 7 daily and 4 weekly complete copies. Retention deletion is not implemented/enabled in this release.

## What verification proves—and what it does not

`backup:verify` authenticates/decrypts each file, compares bytes and SHA-256 checksums, restores table records into an isolated in-memory database, and compares all recovered row values. It never connects to production and cannot overwrite it. It validates data recovery, **not** the complete Supabase service stack, login/session behavior, RLS permissions in a rebuilt project or outgoing-email setup.

The archive intentionally excludes managed extension internals, Vault encryption root material, project-level Auth settings, provider configuration and separately hosted code. Email provider secrets in Vault must be securely recovered/re-entered separately. Existing MFA/column-encrypted Auth data can require the source encryption root key using Supabase's documented migration process. Do not claim a restored account login will work until checked in a disposable Supabase project.

Full rehearsal: create a separate approved test project; disable email/webhook/cron side effects before data loading; configure required extensions and managed Auth encryption settings; restore roles/ACLs/schema/data with supported Supabase instructions; restore Storage objects; test account access, representative uploads and outsider denial. Never run this rehearsal against production. Keep real restored data private and securely retire the disposable copy afterward.

See [Supabase backup/restore instructions](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) and [Storage backup limitations](https://supabase.com/docs/guides/platform/backups).

## Original planning checklist (retained for the next setup step)

## Decisions needed

1. Stay on Free with encrypted exports, or authorise a paid plan with automatic database backups.
2. Choose an access-controlled backup destination. An external drive or private cloud folder is possible; do not use a public link or Git repository. Keep a second copy outside the computer that runs exports.
3. Choose who holds the encryption recovery key and who receives failure alerts. Do not post the key in chat or commit it to source control. Recovery must work if this computer fails.
4. Agree on a schedule and retention period. A proposed starting point is daily backups with seven daily copies and four weekly copies. This is a proposal, not a configured job.

## Implementation checklist after approval

- Use supported PostgreSQL/Supabase export tooling with verified TLS. The audit script is **not** a backup tool.
- Export application data/schema plus the supported auth/role configuration needed for a restore; follow Supabase's restore guidance for managed schemas and roles.
- Export Storage files separately, keeping a manifest of bucket/path, size and checksum. Database dumps only include Storage metadata.
- Encrypt before transferring to the chosen destination. Restrict any temporary plaintext files and remove them safely after a verified encrypted copy exists.
- Use only a server-side credential with the required access. Never add a database password or service key to `VITE_*` variables or the browser bundle.
- Verify each export, record completion time/checksum, and alert on failures/missing backups. If the scheduler runs on this PC, it cannot back up while the PC is off or disconnected.
- Keep retention deletion disabled until a new backup has passed verification and retention rules are approved.
- Restore into an isolated disposable project/database, with outbound email/webhooks/jobs disabled. Confirm record counts, account access, schema/policies, and representative files. Do not overwrite production to test recovery.

[Supabase backup guidance](https://supabase.com/docs/guides/platform/backups)

The current local data-recovery check is documented above. This original planning checklist does not establish a complete off-site or managed-service recovery solution.

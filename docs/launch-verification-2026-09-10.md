# Launch verification — 10 September 2026

## Scope and results

- App-wide and route-level crash boundaries, explicit reload/dashboard/support recovery actions, and an initial-script loading fallback.
- Privacy-minimised browser error aggregation with admin-only reads, bounded public reporting and capped admin notifications; no raw error strings or member content.
- New read-only health endpoint and GitHub availability workflow. Owner notification preferences still need confirmation.
- Release-check workflow; dependency patch updates; portable PostgreSQL script dependency instead of a machine-specific temporary Node package.
- Local suite: **169 tests passing**, including permission isolation, reports/ratings, upload security, support-history continuity, document lifecycle, per-car connections, diagnostics, safe health endpoints and backup encryption.
- Type-check and production build pass; lint has no errors (existing advisory warnings remain). Dependency audit reports **0 known vulnerabilities** at this check, not a guarantee against unknown issues.
- Analytics coverage now explicitly checks excluded admin visits and a subsequent non-admin visit. The earlier failure was not consistently reproducible in isolation; database-heavy test parallelism is capped, and the complete suite now passes.
- Read-only live API checks: anonymous private profile contacts denied (401); messages and documents expose zero anonymous rows; public profile/discovery projections still respond.
- Website diagnostics migration applied in one transaction; direct member/public table reads and public access to the admin report function denied. No test notifications or real messages sent.
- The real recovery component was checked in a 360-pixel browser fixture in light and dark themes. All recovery actions fit; explicitly reloading returns the synthetic preview to its working state. This is a browser layout check, not a physical Android-device test.
- Local encrypted data-recovery check: 83 tables, 3,366 restored records and 15 file checks passed. Backup is **partial** because 26 private files need a server-only backup key. No off-site or scheduled backup is enabled.

## Still requires the owner / additional access

Release `2401ebd` was pushed to `main` and deployed successfully by Vercel. GitHub's [Release checks](https://github.com/Airmusik/bolt/actions/runs/34464965520) passed on Node 24. A manually triggered [Website availability run](https://github.com/Airmusik/bolt/actions/runs/34465075774) also passed from GitHub's runner. A separate live check passed `/`, `/login`, `/register`, `/contact`, `/updates`, `/admin`, first-load assets and `/api/health`. Failed-run email receipt and future scheduled execution are not established by that successful manual run.

1. Add a server-only Supabase key to ignored local backup configuration; choose off-site destination and keep the recovery key separately.
2. Verify a complete copy and configure/verify its recurring job and failure alerts.
3. Approve an isolated Supabase recovery project for a full managed-service restore rehearsal (the local data test is not that).
4. Confirm GitHub Actions failed-run email preferences and actual receipt.

This is not a claim that every button, real-phone upload, provider delivery or simultaneous-user load has been exhaustively tested. It adds checks to the user journeys the owner has already tested, without submitting real support messages, registrations, payments or moderation actions.

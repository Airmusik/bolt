# Promotion analytics rollout

Apply only `supabase/migrations/20260903000000_promotion_analytics.sql` to the intended Supabase project, then deploy the frontend changes. Do not bulk-apply unrelated pending migrations or deploy unrelated uncommitted authentication work.

The migration adds campaign-scoped, deduplicated browser events and owner/admin-only aggregates. It changes active-target lookup to use the exact start/end timestamps and normal visibility checks. It does not delete listings or modify saved payment, legal, or chat history. Stored request status may remain `active` after the deadline; the effective status and eligibility are timestamp-derived. The existing quote workflow retires expired requests before renewal.

Reach means distinct browser identifiers that see at least half of a tracked link/card; clicks means distinct browser identifiers that open it. Clicks also establish reach. Metrics span each campaign's tracked lifetime and refresh every 30 seconds or manually. They are approximate browser counts, not verified people, bot-filtered counts, or billing evidence. Clearing browser storage or using multiple browsers can increase counts. Tracking begins with deployment, with no historical backfill. Owner and signed-in admin traffic is excluded on the server. Raw browser identifiers are not stored in the database; only campaign-specific hashes are retained, and clients cannot read raw events.

Open pages schedule badge/ranking updates at expiry and refresh discovery. Server eligibility always checks the deadline, independently of browser timers or background jobs. Browser background throttling can defer a hidden tab's repaint; focus refreshes its state. Normal availability, document visibility, approval, and search filters still apply.

Verification: `npm run typecheck`, `npm test`, `npm run build`. Database regression tests include exact-deadline expiry, no post-expiry events, duplicate events, owner/admin exclusion, aggregate access, private-event access denial, paused/moderated placements, and listing preservation.

Before production release, verify a short-lived campaign in a test browser: account action says Promoted, an independent browser increments reach/clicks once, admin can search member/car/status, and deadline removes badge and ranking without removing the listing. No production migration or deployment was performed in this implementation task.

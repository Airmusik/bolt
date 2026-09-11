# Neutral interface polish — 11 September 2026

## Scope

- Replaced remaining pastel yellow advisory panels in onboarding, profile settings, listing details/editors, notifications, legal summaries and admin report tools with theme-aware grey surfaces and readable neutral text.
- Removed decorative purple/brand gradients from private chat headers, support/system messages and the empty inbox. Outgoing messages share a charcoal surface with explicit white text across member and admin views.
- Community uses a plain canvas, neutral sent-message surfaces, pinned notices, reply highlights and selected reactions. Filtering, aliases, guidelines, posting and moderation behavior are unchanged.
- Analytics metrics use uniform neutral tiles. Single-series bars use the admin-selected accent rather than multicolour gradients.
- Removed coloured glow blobs from shared empty states and the homepage call to action.

## Kept intentionally

Brand identity, primary actions, notifications' accent, launch animation, photos and user content. Expiring/expired documents, destructive errors and confirmations, vehicle issue severity, ratings and online indicators retain meaningful status colours. Safety copy, legal links, message history, database logic and permissions are unchanged.

## Verification

- Existing 215 automated tests passed; five new neutral-surface regression tests passed.
- Type-check, production build and lint passed (nine existing Fast Refresh warnings, no lint errors).
- Isolated real-component previews checked at desktop and 390px phone width in light and dark mode. Community's filtered-number preview, local send and cleared composer checked without sending any messages to real users.
- Shared approval notices, empty state and outgoing-message colours checked in light/dark phone-width previews. These are browser viewport checks, not a physical-phone test.

Local fixtures: `/tests/fixtures/community.html`, `/tests/fixtures/neutral-surfaces.html`, `/tests/fixtures/unified-inbox.html?scenario=admin`. Fixture files are not included in the production build.

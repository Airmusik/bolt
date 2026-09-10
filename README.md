# 11Drive

Marketplace for Kenyan ride-hailing drivers and vehicle owners, with admin-reviewed driver trust evidence and vehicle listings.

## Local setup

1. Run `npm install`.
2. Copy `.env.example` to `.env` and add the Supabase values.
3. For live Kenya-wide place suggestions, add a Google Maps browser key as `VITE_GOOGLE_MAPS_API_KEY`. Enable Maps JavaScript API and Places API (New), enable billing, and restrict the key to the site origins. Without it, every location field still accepts free text and offers a built-in list of common places.
4. Run `npm run dev`.

Use Node.js 24 or newer. Before release, run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `npm audit`.

## Operating the live site

- [Owner maintenance guide](docs/maintenance-guide.md): admin tasks, alerts, releases and rollback.
- [Backup and recovery setup](docs/backup-setup.md): encryption, remaining setup, and safe restore checks.
- [Launch verification record](docs/launch-verification-2026-09-10.md): what was tested and what remains unverified.
- [Historical permission audit](docs/security-backup-audit-2026-09-02.md): remediations and regression coverage.

Public site: https://www.11drive.com. Production deploys from `main` through Vercel.
Never commit `.env` files, backup archives, recovery keys, or actual member exports.

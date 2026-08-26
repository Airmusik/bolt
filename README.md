# GariLink

Marketplace for Kenyan ride-hailing drivers and vehicle owners, with admin-reviewed driver trust evidence and vehicle listings.

## Local setup

1. Run `npm install`.
2. Copy `.env.example` to `.env` and add the Supabase values.
3. For live Kenya-wide place suggestions, add a Google Maps browser key as `VITE_GOOGLE_MAPS_API_KEY`. Enable Maps JavaScript API and Places API (New), enable billing, and restrict the key to the site origins. Without it, every location field still accepts free text and offers a built-in list of common places.
4. Run `npm run dev`.

Before release, run `npm run typecheck`, `npm run lint`, and `npm run build`.

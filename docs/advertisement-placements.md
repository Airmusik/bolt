# Optional advertisements

Admin → Settings → Advertisements controls these placements, separately from paid listing promotions. Save settings applies a master switch, four placement switches, and one shared sponsor creative. All defaults are off. Existing admin-only site-settings write policies protect these values; no new database tables or migrations are required.

- Inline: homepage after featured cars; browsing results after the sixth card when more than six results exist.
- Footer: above the footer links on eligible pages.
- Connection: a dismissible, inline banner only after a successful connection request, never before submission or on failure.
- Listing: the same banner after successfully saving a vehicle.

Action placements have a shared ten-minute per-tab-session cooldown (session storage with an in-memory fallback). They never open a modal, redirect the user, or require clicking an ad. Ads are hidden on admin, authentication, chat, support, legal, onboarding and account settings pages, and during maintenance.

Content is plain text. Destinations must use HTTPS and cannot contain credentials; unsafe/incomplete ads do not render. Links are labelled Advertisement and open in a separate tab with sponsored/noopener/noreferrer attributes. There are no advertiser scripts, images, cookies, targeting or analytics. Sponsor links are contacted only when clicked.

This supports directly managed sponsors; it does not connect an ad network or automatically collect revenue. For network ads later, separately review the provider's placement, consent, and privacy requirements.

# Optional advertisements

Admin → Advertisements controls these placements, separately from paid listing promotions. The editor has Placements, Sponsor content (or Google setup), Footer video and Preview sections. Save advertisements publishes only changed ad settings. Unsaved drafts survive settings refreshes and section switches. All new placements default off. Existing admin-only site-settings write policies protect these values; no new database tables or migrations are required.

- Inline: homepage after featured cars; browsing results after the sixth card when more than six results exist.
- Home: below the homepage search and above featured cars.
- Browse: above car/driver results, after filters; also visible with fewer than six results.
- Detail: below car and member profile information.
- Dashboard: after the overview activity, not in conversations or applications.
- Footer: above the footer links on eligible pages.
- Connection: a dismissible, inline banner only after a successful connection request, never before submission or on failure.
- Listing: the same banner after successfully saving a vehicle.

Action placements have a shared ten-minute per-tab-session cooldown (session storage with an in-memory fallback). They never open a modal, redirect the user, or require clicking an ad. Ads are hidden on admin, authentication, chat, support, legal, onboarding, vehicle editing, notifications and account settings pages, and during maintenance. Dashboard chat/connection/application tabs are also excluded.

Direct banners share a sponsor name, headline, description, optional image, destination and link label. Destinations must use HTTPS and cannot contain credentials; unsafe/incomplete ads do not render. Links are labelled Advertisement and open in a separate tab with sponsored/noopener/noreferrer attributes. Direct banners inject no advertiser scripts or tracking. Image/video hosts receive normal media requests; sponsor destination pages are opened only when clicked. Supported video embeds load the provider's official player and SDK, connecting to that provider. Use media you are authorised to publish.

## Footer video

The master switch and separate footer-video switch control a second, independent sponsor creative. It works with either banner provider. Configure a sponsor, headline, video link or uploaded MP4/WebM, optional cover and link label. The destination is optional: leaving it blank opens the original video source; setting it overrides the headline/button destination with a sponsor webpage. Existing campaign destinations are preserved.

Automatic link handling supports YouTube watch/share/Shorts/live links, Vimeo (including unlisted links with their access hash), and direct MP4/WebM files. For a real video-file endpoint without a filename extension, select Direct video file. Other HTTPS links render a clearly labelled source-link card; arbitrary webpages are never inserted into an iframe. Unsupported/private/removed videos or provider embedding restrictions cannot be bypassed. Provider controls remain uncovered: clicking the headline or main action opens the source; clicking the player's own controls operates the video.

The panel is right-aligned near the footer on desktop, full-width up to 384px on mobile, and never fixed over the page. Native files start muted and inline only when at least partly visible; YouTube/Vimeo load and autoplay only when more than half their player is visible. Videos pause off-screen/in background tabs and offer Play/Pause and Close. Reduced-motion or data-saving settings prevent automatic playback. A blocked autoplay attempt leaves Play available; a media/provider failure leaves the source link usable. The admin Preview is click-to-play, not autoplay. YouTube uses its privacy-enhanced embed host with the page origin and a normal origin referrer; Vimeo uses its DNT parameter. These are external services, not a guarantee of zero data collection.

Native file selection shows a local preview before Upload selected file. Images: JPG/PNG/WebP, up to 3 MB. Videos: MP4/WebM, up to 8 MB (the existing site-assets bucket limit). Uploading creates public media in `site-assets/advertisements/`; Save advertisements publishes its URL. Cancelling selection is not an error. Save is disabled during uploads. Removed/replaced references do not delete old files. Never upload private member evidence as an ad.

Google AdSense remains limited to existing manual inline/footer units on public home and browse pages; new direct placements do not silently become Google units. Setup and consent requirements remain in [adsense-setup.md](adsense-setup.md). No payment collection or billing is added.

Playback references: [MDN autoplay guidance](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay), [YouTube player API](https://developers.google.com/youtube/iframe_api_reference), [YouTube embedding requirements](https://developers.google.com/youtube/terms/required-minimum-functionality), [Vimeo player SDK](https://github.com/vimeo/player.js).

## Verification

`node --test tests/ads.test.ts tests/adVideoSources.test.ts` covers placement switches, safe destinations/media, provider link parsing, official-player controls, file validation, workflow exclusions and integration points. With the Vite dev server, `/tests/fixtures/ad-preview.html` renders the actual editor and video creative using an isolated settings draft (no settings Save button, not included in the production build). Use it for narrow/wide viewport, dark/light, preview/play, pause-on-scroll and dismissal checks. It uses the real media-upload component; do not upload files during read-only layout checks.

# Google AdSense: connection-ready, disabled

Admin → Settings → Advertisements → Google AdSense.

The integration supports manual responsive horizontal display units on the public home and browse pages, in separated in-page/footer areas. It loads Google's script once when an enabled unit is visible. No requests are made while disabled or incomplete. IDs are validated; Google is not loaded in admin, chat, dashboard or account workflows. Direct-sponsor options remain separate.

## Finish when an account exists

1. Create AdSense, add 11drive.com, and complete Google's ownership verification and site approval. A static verification meta tag or ads.txt entry can be deployed once Google provides your real publisher ID. Do not invent one.
2. Create two display units: browsing and footer. Copy the ca-pub publisher ID and each 10-digit ad unit ID into Admin Settings; save while disabled.
3. Publish the generated ads.txt line at the site's root. The admin screen generates the exact line; it does not publish the file automatically.
4. Configure Google's Privacy & messaging / appropriate certified CMP and update privacy disclosures before enabling Google advertising. The readiness checkbox is an operator confirmation, not a CMP implementation. Test consent acceptance/refusal and withdrawal for the regions you serve.
5. Keep Auto ads, anchors and vignettes disabled in AdSense. Do not place Google ads on Connect/Save click handlers or encourage ad clicks.
6. Confirm readiness, enable the desired placements and master switch, then save. Review the first real placements on desktop and mobile without clicking your own ads. Recheck the spacing around results and footer links. Google approval, ad fill and revenue cannot be tested without an account.

Turning off removes units but cannot unload previously executed third-party code from already-open tabs; reload those tabs. Changing publisher also requires reload. There is no periodic ad refresh.

Official references:
- https://support.google.com/adsense/answer/7584263
- https://support.google.com/adsense/answer/1346295
- https://support.google.com/adsense/answer/9183460
- https://support.google.com/adsense/answer/13554116

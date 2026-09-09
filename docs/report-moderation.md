# Removing an incorrect report

Admin → Reports → View report and actions → Remove report & restore rating.

The administrator must provide a 10–2000 character explanation and confirm the action. The server locks the report, dismisses it, records the administrator/time/reason, revokes its warning, and recalculates the rating using the existing review average and remaining report deductions. The member receives one in-app notification. Repeated submissions are idempotent. A removed case cannot be re-opened or warned again.

This is removal from account standing, not destruction of the original report. Administrators retain the case and revoked warning for audit; the member's private rating panel shows the removal decision without identifying the reporter. Revoked warnings no longer count toward the three-warning guidance. No existing case is automatically removed when deploying this change, and suspensions are not automatically lifted.

Each reviewing/resolved report currently deducts 0.1, with a rating floor of 1. Removing an open report does not increase the rating because it had no deduction. Removing a report does not delete a member review or restore an arbitrary five-star score. Site/chat experience feedback is separate from public member ratings.

Migration: `20260909200000_report_overturn_and_warning_revocation.sql`.
Tests: `node --test tests/report-overturn.test.mjs tests/promotion-clarity.test.ts`.
The Vite-only `/tests/fixtures/moderation-promotions.html` checks the actual confirmation and payment card components against local fake data, without modifying accounts or taking payments.

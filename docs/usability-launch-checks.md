# Usability polish and launch checks

## Changes

- Dashboard role data, conversations, and connection requests load concurrently. Connection reads still wait for expiry checks. Driver applications and car discovery also run concurrently.
- Initial dashboard loading still hides empty-data actions. Failed loads show a retry action.
- Small-screen navigation labels no longer truncate, and connection cards can wrap their actions.
- Sent and accepted connections show progress and a clear next step; accepted connections have a prominent Open chat action.
- Car filters include platform; driver filters include name and availability, with a clear-all action. Price filters exclude unknown prices; location filters exclude unknown locations.
- Profile and listing approval explanations distinguish review from identity verification, mechanical inspection, or guarantees.

## Automated verification

- Existing suite: 72 passing tests using synthetic/isolated data. Coverage includes both account roles, registration and terms, Google membership completion, document expiry/reminders, connections/chat, promotions/analytics, and access controls.
- New search regression suite: 3 passing tests.
- TypeScript check, changed-file lint, and production build passed.

## Limits of these checks

No real messages, payments, uploads, or registration emails were sent. Actual inbox delivery, a fresh Google consent round trip, physical-phone upload behavior, and payment-provider settlement are not certified by these automated checks. Complete these with designated test accounts before a public launch. No measured speedup is claimed; the change removes sequential waits for independent requests.

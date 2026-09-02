# Document review and renewal

Platform proof uses draft → pending → approved/rejected. Uploads remain drafts until **Save & submit platform history**. Pending reviews block edits, new entries, replacement uploads and repeat submissions on the server. Approved entries are locked for six calendar months; rejection or expiry unlocks **Correct/Renew**. Previous submitted evidence is archived privately. No identity, logbook, inspection or reference-letter requirement has been added.

Existing approvals did not record approval time, so the migration grants them six months starting at rollout. New approvals receive an exact server-generated expiry timestamp. Renewal replaces proof, not the account or chat history. Only unsubmitted new drafts can be removed by the member.

The hourly `document-expiry-reminders` Supabase Cron job creates in-app notices at 30, 7 and 1 day before expiry, and when expired. A unique source/expiry/milestone key prevents duplicates. If a run is missed, only the most urgent current milestone is generated. A pending renewal suppresses further chasing. Existing non-KYC evidence with expiry is included; users without applicable documents are not sent irrelevant reminders.

Admins use **Expired documents** to contact a member, hide or remove a listing from discovery, and restore it after renewal. These actions never delete an account or chat history and do not end an active connection. Expiry removes the current-history approval signal; publication removal is an explicit admin decision.

## Email activation (not enabled by default)

Sign-in/reset emails from Supabase Auth do not deliver document reminders. Transactional delivery is implemented with Resend, using the registered email in `auth.users`. No proof files or private storage URLs are emailed.

1. Obtain a Resend API key and a sender address on a domain verified by your email provider. A support Gmail address is fine for **Reply-To**, but is not a verified Resend sender.
2. Store the API key in **Supabase Vault** under `document_reminder_resend_key`. Never put it in Vite variables, the repository, public site settings or chat messages.
3. From a trusted SQL session, configure `reminder_private.email_config`: `from_email` is the verified sender address, `site_url` is the current HTTPS site origin, and `enabled=true`. This private schema is inaccessible to members and the public API. Disable with `enabled=false`.
4. Check **Admin → Expired documents** for delivery status. A provider-accepted response is not proof of inbox delivery; check the provider's delivery/bounce logs.
5. The `document-reminder-email` Cron job runs every minute. It retries temporary failures with the same idempotency key and frozen payload, maximum five attempts within 23 hours. Uncertain results outside that window require review, not blind resending. Fix configuration before replaying known failures. Unsent obsolete reminders are cancelled.

Site name and support email are read from Admin Settings when an email is first prepared; retries preserve the same payload for idempotency. User-facing countdowns show browser-local time; email date labels explicitly use East Africa Time.

Reference: [Supabase Cron](https://supabase.com/docs/guides/cron), [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net), [Resend sending API](https://resend.com/docs/api-reference/emails/send-email), [idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).

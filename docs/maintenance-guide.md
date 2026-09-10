# 11Drive owner maintenance guide

Updated: 10 September 2026. This guide is saved with the source code, not dependent on a chat history.

## Your essential links

- Website: https://www.11drive.com
- Admin sign-in: https://www.11drive.com/admin/login
- Members and moderation: https://www.11drive.com/admin
- Website health and security: https://www.11drive.com/admin?tab=security
- Code and automatic checks: https://github.com/Airmusik/bolt/actions
- Hosting and deployments: https://vercel.com/dashboard
- Supabase project: https://supabase.com/dashboard/project/bqgfrulkjibxunaofumx

Keep ownership of the domain, hosting, database, email-provider and GitHub accounts. Store recovery codes in your password manager; do not put them in this guide or chat. Do not share one administrator password between people.

## Every day during the small launch

1. Check pending driver-history reviews and car listings. Approval of platform history is not identity verification or a guarantee about the person.
2. Read **Messages** for direct member support. **Support chats** contains invited driver/owner disputes. End the support session when resolved; preserve history.
3. Deal with unsolved reports. Explain warnings or suspensions. If a report was wrong, use **Remove report & restore rating**, rather than changing a rating manually.
4. Check **Security → Website health** and any error notification. Note its page category, browser and release. Browser reports are untrusted signals, not reasons to punish a user.
5. Confirm the newest backup is recent, verified and complete. A partial backup is not a green light to launch widely. See backup-setup.md.

## Website errors and downtime

React page failures now show Reload, Dashboard and Contact support actions. A separate initial-load fallback appears after 20 seconds if the application script never renders. There is no automatic reload loop and failed submissions are not automatically repeated. Reload can discard unsaved input, so first check whether a submission already succeeded.

The Website health panel shows browser reports from the last 30 days; older aggregates are pruned when new reports are processed. It records only a general route, error category, browser family, release and count. It deliberately does not retain raw exception text/stack, message contents, form values, user identifiers, IP addresses or full URLs. Vercel may keep its own request logs separately. The browser sends at most five distinct reports per page load; database aggregation and admin notifications are also capped.

The **Website availability** GitHub workflow checks the website HTML, first-load JS/CSS assets, important routes and the read-only `/api/health` database dependency probe approximately every 15 minutes. It retries temporary network errors. It runs on GitHub, not this PC. Schedules can be delayed, and scheduled workflows in public repositories may be disabled after 60 days without activity. This is a basic availability check, not a real signed-in user journey or guaranteed immediate alert.

**One-time owner action:** GitHub → Settings → Notifications → Actions → enable email notifications for failed workflows. Verify the email address on that account. The scheduled workflow creator receives these notifications, or the person who later changes/re-enables its schedule. This release does not change your notification preferences or prove email delivery. Read [GitHub notification guidance](https://docs.github.com/en/actions/concepts/workflows-and-actions/notifications-for-workflow-runs).

For an outage:

1. Open the site in a normal browser and check GitHub's latest availability run.
2. Check Vercel deployment/runtime logs and the Supabase project status. Do not paste keys, reset links or member messages into public issues.
3. If a recent frontend release caused it, redeploy the last known-good Vercel deployment.
4. If only one action fails, keep a screenshot, time, phone/browser and steps, without unnecessary private information. Contact the maintainer through a private channel.
5. If needed, use Admin Settings → Maintenance. `/admin/login` remains the administrator entry. Maintenance does not fix an underlying database outage.

## Safe updates and rollback

The source repository's **Release checks** workflow runs type-check, lint, offline tests, build and dependency audit for changes. It uses synthetic data and needs no production secrets. Database-heavy tests run with limited parallelism for predictable memory use.

Vercel still deploys `main` automatically; the new workflow is a check, not a configured Vercel deployment gate. Run checks locally before pushing, and confirm both GitHub and Vercel have succeeded. A future maintainer can configure protected branches/deployment checks separately.

On this PC, from the project folder:

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd audit
npm.cmd run check:live
```

Use a small branch/commit per change and review the diff. Never run all historical release scripts or migrations blindly against production. Some older release scripts can send notifications or change live records.

Frontend rollback: select the last known-good deployment in Vercel and follow its rollback/redeploy controls. This does **not** rewind database changes. Database recovery needs a verified backup and a separate restore rehearsal; do not overwrite production to experiment. See the backup guide.

## Accounts, costs and service limits

Check the existing Vercel, Supabase and email-provider dashboards for usage, failures and billing. This work has not bought a paid plan, raised limits, or changed renewal settings. Keep domain renewal reminders enabled with your registrar. Do not assume a successful build measures simultaneous-user capacity.

Email updates should be titled with the current site name plus “Updates”. New email links open the Updates page when signed in. Old delivered emails cannot be rewritten. Confirmation/password-reset emails and service-notification emails have separate provider settings: changing one does not configure the other.

## Handover to another developer

Give them repository access, this guide, the backup guide and the launch verification record. Grant separate provider access where needed instead of sending your main password. Credentials and recovery material are intentionally absent from GitHub.

The September 2 permission migration and its synthetic regression fixtures were previously local-only and are included in this release after inspection. They were already applied to the live database; do not apply them again just because their Git commit is newer. Other untracked historical one-off scripts and the preview PNG were left untouched and should not be treated as release automation.

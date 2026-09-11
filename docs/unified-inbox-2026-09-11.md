# Unified chat inbox

## Cause and correction

The member sidebar rendered the Contact Support inbox separately from legacy
direct-admin conversations, despite both using the same Official Support label.
The dashboard and admin Messages list also used different grouping rules.

- One member inbox row per partner account, across reconnections and vehicles.
- All direct admins use one Support destination. Admins invited to a driver-owner
  dispute remain inside that member conversation, not in direct Support history.
- Old direct-admin URLs redirect to the unified Support inbox.
- Support remains reachable even when a member has no connection chats.
- Dashboard chat links use the same inbox; its count includes the Support entry.
- Admin Messages groups registered accounts by user ID. Guest requests are not
  combined by unverified email or name. Every original request URL still opens
  that member's history; resolution covers that member's grouped requests.
- Original direct-support messages are read in place, with RLS unchanged. Their
  existing imported copies are matched using the legacy conversation link, sender,
  and full timestamp (including PostgreSQL microseconds). Images/files retain
  their original protected storage location. Recalled copies remain hidden.
- Realtime/RPC acknowledgement does not display a sent message twice. Failed
  attachment retries do not resend text already saved in a support request.

No messages, requests, conversations or attachments are migrated or deleted by
this release. No schema or permission changes are required.

## Verification

- Pure-function tests cover both member roles, reconnects, multiple admins,
  invited support, separate identities with matching names, closed histories,
  copied messages, recalls, media preservation and timestamp precision.
- Isolated `/tests/fixtures/unified-inbox.html` uses the real React pages with an
  in-memory backend and network disabled. It is not part of the production build.
- Browser checks cover combined history, replying, old routes, admin grouping,
  empty accounts and phone-width layout, without sending real users messages.
- Physical Android/iPhone testing is not performed by this fixture.

Restore the previous deployment to roll back; stored histories are untouched.

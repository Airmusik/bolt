# Registration terms

The public terms, signup dialog and text download use the same versioned document in `src/content/terms-2026-09-02.json`. Site name, support email, support phone and support avatar use Admin Settings, not hard-coded contact details.

New accounts must submit the current version and a boolean `terms_accepted: true`. The auth-user insert trigger records server time and a snapshot of the then-current site/contact settings in `registration_terms_acceptances`. Members may read only their own receipt; admins may read receipts. Clients cannot create, edit or delete receipts. Old accounts are not backfilled and updating auth metadata does not rewrite acceptance. Account deletion follows the existing cascade.

The frozen JSON document is also stored in `registration_terms_documents`. Do not edit an accepted document version: add a new file and database version for substantive future changes. Branding/contact edits update current display, not historical receipts. Existing members are not silently bound to a new version by this feature; a separate, explicit re-acceptance flow would be required.

Deployment order: install the document and trigger migrations, deploy the matching frontend, verify it is live, then set `registration_terms_policy.enforce_acceptance` to true using a trusted database connection. It starts false only to avoid breaking registrations while the old form is still deployed. Never disable this flag as a routine signup workaround. Dashboard/manual auth-user creation must also supply the current acceptance metadata only when acceptance has actually been obtained.

The wording is a draft for Kenyan legal review, not a guarantee of liability protection. Before public launch, obtain a Kenyan advocate's review, identify the actual legal operator and business address, and confirm operational privacy/retention and paid-promotion disclosures. Current contact details were used at the owner's request. Review data-protection obligations separately; a terms checkbox is not blanket privacy or marketing consent.

Sources consulted: Kenya's Consumer Protection Act, 2012 (Kenya Law), especially internet-agreement disclosures and mandatory consumer protections; Data Protection Act, 2019, including lawful processing, transparency and retention principles.

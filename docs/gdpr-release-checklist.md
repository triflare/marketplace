# GDPR release checklist

Use this checklist for a release that changes personal-data handling. The left
column is code and configuration in this repository. The right column is work
the operator or legal team must complete; neither substitutes for the other.

## Implemented controls

- [ ] Privacy and terms documents are published through the legal endpoints,
      and signup records the accepted version and timestamp.
- [ ] Password, generated-password, OIDC, magic-link, and email-code account
      creation refuse a new account when a published policy was not accepted.
      Existing-account sign-in is not forced to accept again.
- [ ] `GET /me/export` includes the account, identities, sessions, tokens,
      passkeys, notifications, reports, organizations, versions, legal
      acceptances, and retention settings. The export streams in bounded pages.
- [ ] Account deletion removes the account, identities, sessions, tokens,
      versions, webhooks, pending mail to current and former addresses, and
      clears the account handle from audit rows while retaining the audit action.
- [ ] Retention settings bound download events and terminal mail-outbox rows.
      Expired challenges, device codes, MFA challenges, and idempotency keys are
      removed independently of blob garbage collection.
- [ ] Consent updates are self-only; an admin cannot accept a legal document on
      another account.
- [ ] CI runs the API regression suite, and the suite covers consent, export,
      deletion, authorization, and retention paths changed by this release.
- [ ] API and UI lint, formatting, typecheck, and build jobs pass.

## Operator obligations

- [ ] Backups, object storage, and mail providers are covered by processing
      agreements and a documented retention period.
- [ ] The deployment sets retention windows that match the published privacy
      policy, and monitors the maintenance job.
- [ ] Access to the database, mail outbox, and blob store is limited to named
      operators and reviewed at least quarterly.
- [ ] The incident-response runbook has named owners and current provider and
      supervisory-authority contacts.
- [ ] A restore from backup has been tested, including the audit trail and
      deleted-account cleanup.
- [ ] Support and communications teams have the current user-notice templates
      and know who approves them.

## Legal review

- [ ] The privacy policy describes every category in the export, the retention
      windows, the lawful basis, and the contact for rights requests.
- [ ] The terms and privacy policy versions referenced by the release are the
      published versions.
- [ ] The legitimate-interest or consent basis for each processing activity is
      recorded, including mail delivery and abuse-prevention logs.
- [ ] The transfer mechanism for any provider outside the relevant jurisdiction
      is documented.
- [ ] The breach-notification decision point and authority contact are current.
- [ ] Records of processing activities and the data-protection impact
      assessment are updated when the release adds a new data category or use.

## Sign-off

Record the release version, date, operator, and links to the completed checks.
An unchecked operator or legal item is a deployment blocker, not a code defect.

# Personal-data incident response

This runbook covers an incident that may affect personal data held by a registry
deployment. It is an operator document: the repository contains the controls,
but the named people and external contacts belong to the organisation running
the instance.

## Roles

| Role                | Responsibility                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Incident commander  | Declares the incident, owns the timeline, and makes containment decisions. Usually the on-call engineering lead.      |
| Privacy lead        | Decides whether the incident is notifiable and owns communication with the supervisory authority and affected people. |
| Security lead       | Leads technical investigation, evidence preservation, and remediation.                                                |
| Communications lead | Prepares user-facing notices and coordinates support responses.                                                       |
| Service owner       | Provides deployment, provider, and data-flow context.                                                                 |

Assign a named person to each role at the start of an incident. The incident
commander may hold more than one role on a small team, but the privacy decision
must be made by someone other than the engineer who caused or fixed the fault
when staffing allows.

## Detection and triage

Record the report in the incident tracker with the time, reporter, affected
service, and initial symptoms. Preserve logs, database snapshots, deployment
metadata, and provider messages before changing the system.

Classify the incident as soon as the scope is known:

- **Low**: no personal data exposed, or only internal metadata with no
  identifiable person.
- **Medium**: limited personal data exposed to staff or a single account.
- **High**: personal data exposed, altered, lost, or unavailable across
  accounts; credentials or export files may be involved.
- **Critical**: ongoing unauthorised access, destructive loss, or a breach
  affecting many people.

Open a single timeline and append decisions as they are made. Do not rewrite
earlier entries; add corrections with a timestamp.

## Containment and evidence

1. Revoke exposed sessions, automation tokens, and provider credentials.
2. Stop the affected path without deleting evidence. Prefer disabling a route
   or rotating a secret over truncating tables.
3. Snapshot the database, object store, outbox, and relevant logs. Record
   checksums and storage locations.
4. Identify the data categories, approximate number of people, and time window
   using the audit trail, mail outbox, access logs, and deployment records.
5. Keep a chain-of-custody note for every copy of evidence and every person who
   accessed it.

## Processor notification

If a processor or hosting provider is involved, notify its security contact
without undue delay. Record the time, contact, reference number, and what was
requested. Do not wait for a complete root-cause analysis before making the
first notification.

## Supervisory-authority decision

The privacy lead makes and records the notification decision within **72 hours
of becoming aware** of a personal-data breach, unless the breach is unlikely to
result in a risk to people's rights and freedoms.

At the decision point, record:

- what happened and when the organisation became aware;
- the categories and approximate number of affected people and records;
- the likely consequences;
- the measures taken or proposed;
- the contact point for the authority.

If the decision is not to notify, record the reasoning and the risk assessment.
If the facts are still incomplete, notify with what is known and update the
authority later rather than missing the deadline.

## User communication

The privacy lead decides whether affected people need notice. Communicate
clearly what happened, what data was involved, what the organisation has done,
what people can do to reduce risk, and where to ask questions. Do not include
speculation about cause or blame.

## Recovery and follow-up

1. Remove the cause and verify the fix with the affected path.
2. Restore data from a verified backup when needed, and reconcile records that
   changed during the incident.
3. Re-run retention and access-control checks.
4. Schedule a post-incident review within five working days.
5. Record corrective actions with an owner and due date, and link them to the
   release checklist.

## Evidence to retain

- incident timeline and decision log;
- affected-data assessment and scope query results;
- snapshots, checksums, and chain-of-custody notes;
- provider and authority correspondence;
- user notices and support macros;
- remediation commits, deployment records, and verification output.

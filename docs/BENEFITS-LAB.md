# Benny benefits workflow lab

An isolated, executable testbed for following a life need through eligibility,
explicit approval, provider execution and a verified outcome. This is infrastructure
for the benefits MVP, **not a production benefits agent or live pharmacy integration**.
The existing school agent and its iMessage routing are unchanged.

## Try it in an orb

```sh
amp orb services ensure
npm run test:benefits
```

Open the **Benny Benefits Lab** portal printed by `ensure`. The separate **Benny
website** portal is a static marketing site, not the workflow app.
Setup installs PostgreSQL 15; the supervised `benefits-db` service initializes a
dedicated fictional-data cluster. The `benefits-lab` service waits for it and creates
only `benny_benefits_lab`. Neither script reads `.env` or uses `DATABASE_URL`.

Each browser cookie gets a separate fictional workspace. Loading the same scenario
twice opens the same case. A new browser profile/private window starts a new workspace.
The clock starts on September 14, 2026, advances with elapsed time and can be advanced
manually. Dates display in Pacific time. Reloading preserves cases and approvals.

1. Load **FSA · an unclaimed glasses receipt**. The fictional plan says its filing
   deadline is Friday, September 18, 11:59 p.m. Pacific. This is a fixture-specific
   claim cutoff, not a statement about standard FSA deadlines or expense eligibility.
2. Choose **Prepare exact proposal**. Check the $184.35 amount, destination,
   subject, disclosures, expiration, revision and supporting evidence.
3. Choose **Approve displayed proposal**. The worker runs every two seconds while
   the service is running. **Run due work** also triggers it. Nothing is sent before
   approval, except observation of a pre-existing fictional refill request.
4. Acceptance creates a provider reference but counts **$0 received**. Advance one
   minute to observe the simulated payment; only then does received value increase.
5. Try **Revise simulated amount +$1** before approving a separate case: approval
   stays disabled until **Review updated proposal**. The server also rejects an old
   hash/revision, including requests from another tab.

The lab is a reviewer/operator interface. It is not the eventual employee chat UI.
Do not enter credentials, receipts, health information, or other real personal data.
There are no upload, free-text, credential, live-send or account-login fields.

## What is exercised

| Workflow | What Benny prepares | What counts as the outcome |
| --- | --- | --- |
| FSA / healthcare reimbursement | Evidence-backed claim with amount and cutoff | Simulated payment, not acceptance |
| Child's doctor visit | A specific fictional provider and appointment time | Participant confirms attendance after that time |
| Dependent enrollment | Enrollment with authority, qualifying-event evidence and selected fictional plan | Simulated provider confirms active coverage |
| Existing prescription refill | Refill request, or observation if already underway | Participant confirms pickup, not pharmacy readiness |
| Prescription with no refills | Request to a prescriber for renewal | Stops awaiting clinician; does not prescribe or dispense |

Nineteen fixtures include unknown eligibility, expense outside the coverage period,
insufficient balance, an already-reimbursed receipt, missing documents, unconfirmed
dependent authority, denial, an unavailable appointment, expired access, provider
outage and a lost response after successful submission.

**Supply simulated evidence / reconnect** is a test control, not autonomous evidence
generation. It supplies a fictional missing fact and requires new approval. It does
not invent a larger benefit balance. When additional documents are requested after
submission, it updates the existing provider reference rather than creating a new
claim. Unknown execution outcomes and clinician decisions require operator/provider
review; clicking repair cannot bypass those boundaries.

## Execution and storage contracts

- PostgreSQL stores case state, scheduled work, approval payloads and an event timeline.
- Commands lock a workspace-owned case. Approval and queuing commit atomically.
  Revising or cancelling a queued case revokes the old approval.
- Consent binds the action revision, proposal hash and a canonical hash of its facts
  and evidence. A changed receipt cannot inherit consent just because its amount matches.
- The worker commits a 30-second lease before calling the provider. Expired leases
  can be reclaimed after restart; a fencing token prevents old workers from writing
  over newer worker results.
- The simulated provider has an independently committed ledger with stable action
  keys and per-workspace expense uniqueness. Lookup happens before retry and before
  declaring a timed-out action expired: it may already have been accepted.
- Transient failures retry after one and then two minutes. Three failed attempts
  require operator reconciliation. Already-submitted cases cannot be cancelled locally.
- Acceptance, payment, active coverage, readiness, attendance and pickup remain
  distinct. Only reimbursement payment adds to the dollar metric; appointments and
  prescriptions do not receive invented dollar valuations.
- Anonymous workspace tokens are random, hashed in storage, and sent in HttpOnly,
  SameSite=Strict cookies (Secure behind the HTTPS portal). Commands check ownership,
  require JSON plus a custom header, reject cross-site browser requests and enforce
  strict input schemas. Static assets are explicitly allowlisted.

Database URL overrides use only `BENEFITS_LAB_DATABASE_URL`; non-loopback hosts,
other database names and URL query overrides are rejected. Local trust authentication
is **only for this fictional-data lab**, not a production security pattern. Data lives
outside Git under `~/.local/share/benny-benefits-lab/postgres`. Deleting the orb loses
its local data; this is not a backup or production availability arrangement.

## Verification

`npm run test:benefits` creates and removes a randomized `benefits_test_*` schema in
the dedicated database. It exercises all 19 fixtures plus concurrent workers,
restart recovery, a crash after provider acceptance, changed evidence, stale consent,
deadline boundaries, cancellation, actual outcome values and HTTP workspace isolation.
It needs neither an LLM nor external credentials. The benefits CI job provisions its
own PostgreSQL 15 service; adding the workflow locally does not run GitHub Actions.

For changes to the browser interface, also render desktop and mobile widths, exercise
stale-proposal review and confirm that accepted-but-unpaid cases still show $0 received.

## What still separates this from a real pilot

1. **Real, authorized access.** Validate one provider's supported API or authorized
   user-assisted session flow. SSO, MFA, CAPTCHA, consent, terms and session expiry
   are provider-specific. `BenefitProvider` is a simulator contract, not a claim that
   CVS or a benefits administrator supports these endpoints or idempotency semantics.
   Without authoritative lookup/idempotency, an uncertain write must stop for review.
2. **Real eligibility and context ingestion.** Plan versioning, employee and dependent
   identities, qualifying-event dates, coverage selection, coordination of benefits,
   balance reservations across claims and authoritative document extraction are not
   implemented here. Cases currently have independent fixture facts and balances.
3. **Actual discovery and notifications.** The deadline/receipt opportunity is loaded
   from a fixture, not discovered in an inbox or portal. Add consented read access,
   event ingestion, deduplication, notification preferences, quiet hours and escalation.
   No real iMessage reminders or scheduled prescription requests are sent by this lab.
4. **Production privacy and operations.** Employee authentication, employer/employee
   access separation, encrypted document/session storage, retention/deletion, audit
   export, legal/compliance review, incident response and a staffed exception queue.
   Employers must not receive individual prescription or family-health details.
5. **Pilot measurement.** Track actual recovered dollars, completed tasks, employee
   time saved, operator effort and unsupported cases. Do not present simulated results
   or projected eligibility as realized benefit value.

The next useful milestone is one end-to-end reimbursement flow with an authorized
provider and a consenting test participant. Reuse the approval and recovery tests,
then replace simulator assumptions with observed provider behavior. The lab lets
development proceed without a design partner; it cannot establish live access,
clinical authority, reimbursement eligibility or commercial demand on its own.

# Benny iMessage infrastructure

This is an opt-in life/benefits extension of the existing iMessage school agent,
not a validated live pharmacy or benefits integration. Enabling it no longer
replaces the school brain, disables school tools, or removes existing HTTP/voice routes.
No action connector or real portal policy is registered by default. Naming CVS, WEX, Workday, etc. in the inventory
does **not** mean their API, OAuth, or browser access is available. The separate
Benefits Lab remains fictional and is never used as a live executor.

## What is implemented

- One existing agent/tool loop across school and life/benefits. There is no
  school/benefits intent classifier or user mode switch. `get_life_context` reads
  attributed context; `plan_life_work` accepts a validated plan. Exact life controls
  bypass the model for allowlisted senders. Bare school YES/NO and HELP retain
  their existing handling. A diverted life command expires stale school proposals.
- Person-reported facts retain their source message, observation date, optional
  expiry and correction chain. School profiles/cases can seed the same context
  once, using an exact sender identity match. Imports do not copy old transcripts,
  credentials or consent, and do not treat an old resolved flag as verified evidence.
- A case represents a human goal across institutions. Steps have stable IDs and
  earlier-step dependencies; newly discovered steps extend the existing case.
  Benefits tasks link to the case/step and selected supporting facts. Pending
  dependencies and stale facts block preparation, approval and first dispatch.
  Corrections invalidate unsent approvals; UPDATE must refresh the task details.
- Case progress derives from provider outcomes. A submitted appointment request
  does not finish a speech-support case, and a person-reported school outcome is
  recorded as reported, not independently verified. Booking an appointment is
  not evidence that the clinical evaluation occurred.
- Private iMessage intake with an explicit sender allowlist; group messages and
  outbound echoes cannot create tasks or disclose account information.
- Versioned first-use disclosure and exact `JOIN PILOT` acceptance before life
  tools mutate context, import a school profile or retrieve attachments. Ordinary
  messages still use the existing school model/history before and after enrollment;
  this is not a new encrypted conversational boundary. `STOP` remains available.
  Joining does not approve an action or resume
  paused work. `FEEDBACK <comment>` saves up to 100 comments encrypted per account;
  it does not notify an operator or constitute live support.
- `HANDOFF <task>` gives a next-step checklist when the person must handle the portal
  step. It invalidates unsent approvals and disables automatic submission on that
  task, including after edits/restart. `REPORT <task> <update>` records a person report,
  never independently verified completion or money received. This is not a generated
  claim form or a claim-ready packet; source review and provider requirements still matter.
- Requested `FOLLOWUP <task> <ISO timestamp with timezone>` check-ins persist across
  restarts, pause with STOP, and stop on cancellation. One future check-in per task,
  within a year; a replacement suppresses an unsent older reminder. These ask the
  person for an update, not monitor a portal or verify a filing deadline. Delivery
  still depends on the worker/messaging service and is at-least-once.
- Requests for FSA/healthcare reimbursement, refills, appointments and dependent
  enrollment share a durable task, connection, approval and outcome lifecycle.
- PostgreSQL transactions commit incoming-message deduplication, task changes and
  outgoing replies together. AES-256-GCM encrypts account context, routing,
  credentials, documents and messages with owner/purpose binding. Identifiers in
  database indexes use keyed hashes. This is application encryption, not end-to-end
  encryption through the messaging vendors.
- A connector contract supports provider-specific OAuth. OAuth connection links use random single-use state, PKCE S256 inputs,
  a ten-minute expiry, an allowlisted authorization origin, and a second account
  confirmation from the initiating iMessage sender. Login never grants permission
  to submit. Provider-verified account identity survives reconnection.
- Exact `YES <code>` approves the displayed action, amount and disclosures, bound
  to its executor payload, evidence, revision and connection. An edit, document
  change, expiry or disconnected account invalidates unsent work. Bare YES is not
  consent. Duplicate approvals for the same provider operation/resource are blocked.
- Restartable worker leases, committed dispatch intent, preflight validation,
  status reconciliation and a retrying outbox. Uncertain outcomes never trigger
  blind resubmission to non-idempotent providers. A different reconnected account
  cannot check or execute the previous account's transaction.
- Delivery runs independently of the browser/document work cycle, so a slow
  external operation does not hold all queued replies behind it. Each loop is
  non-overlapping; per-account database locks and delivery retries can still delay replies.
- Accepted claims are not counted as received money; renewal requests cannot be
  reported as medication ready. Outcome details require provider evidence.
- `STOP`, `START`, `DISCONNECT`, task status and cancellation before dispatch.
  Remote revocations retry even while ordinary background work is paused.
- Optional SDK-streamed JPEG/PNG/PDF intake: maximum 5 MiB, ten documents per task,
  signature checks and a fifteen-second retrieval deadline. The upload is bound
  to its originally selected task/revision, never an arbitrary URL.
- Uploads queue local document review without requiring a portal connection.
  Poppler extracts PDF text; Tesseract reads images and rendered image-bearing PDF
  pages. Candidates carry document ID, content digest, page, line, source quote
  and text/OCR provenance. Reports and queued messages remain encrypted in the
  existing account store; no additional database migration is required.
- Exact file duplicates within a task are ignored. Conflicting amounts/dates,
  unreadable sources and multiple receipts/plans block preparation rather than
  being silently merged. Document changes invalidate old action approvals.

`src/index.ts` keeps the existing `Agent.handle` path for ordinary messages and
binds life tools to the actual private iMessage sender and message. Tool calls
cannot supply another identity. One life plan can commit per original inbound
message, with transactional deduplication and receipts in the durable outbox.
The standalone personal planner remains available for protocol tests, but is not
the production brain. School tools continue using their existing consent gates.

Life account data is application-encrypted, but ordinary conversation, school
profiles, school-tool records and replies retain their existing legacy storage
semantics. Tool-derived facts can appear in those replies. Do not claim the entire
conversation is application-encrypted or approved for health information. The
updated enrollment notice states this distinction explicitly. No school-step
evidence verifier, employer plan feed or live benefits action connector is registered.
A persisted task is not a verified entitlement or a completed benefit.

## Run the offline checks

The existing orb service definitions start only a static website and the
fictional Benefits Lab/database:

```sh
amp orb services ensure
npm run test:documents
npm run test:personal
npm run test:benny
npm run test:portals
npm run test:benefits
npm run typecheck
```

`test:benny` uses only the fixed loopback database
`benny_benefits_lab` on port 55432 with role `benny_lab`. It creates and drops a
random `benny_test_*` schema; it never uses `DATABASE_URL`, reads `.env`, enables
a real connector, or sends a real iMessage. The tests exercise the actual store,
runtime, SDK-shaped ingress and HTTP callbacks with fictional provider adapters.
They do not demonstrate that a named real provider supports any operation.
Personal-conversation tests use scripted model responses: they validate context
sharing, persistence, ownership and execution boundaries, not production model
quality. `test:personal` also checks correction/expiry, case dependencies, school
imports and private model error logging without database or external model calls.

`test:documents` needs no database. It generates fictional PDF/PNG/JPEG/scanned
PDF inputs and executes the native text/OCR tools, including mixed image/text
pages, without a network extraction service. Linux dependencies are installed by
`.agents/setup` and the Dockerfile: `poppler-utils`, `tesseract-ocr`, English
language data and `util-linux` (`prlimit`). Changes must be shipped before they
apply to new deployments/orbs.

## Pilot activation is a separate, reviewed operation

Do not start `npm run start` to run offline tests: that starts the messaging app.
Before using real personal or health information, complete the privacy/security
review below and get explicit authorization for the destination and participants.

Required deployment configuration (supply through the approved secret manager;
do not commit values or copy credentials into chat):

| Setting | Purpose |
| --- | --- |
| `BENNY_IMESSAGE_ENABLED=true` | Add life tools to the existing school conversation; unset leaves life tools unavailable |
| `BENNY_DATABASE_URL` | Dedicated reviewed PostgreSQL connection with appropriate TLS |
| `BENNY_ENCRYPTION_KEY` | Base64-encoded 32-byte cryptographic key; keep separate from DB/backups |
| `BENNY_PUBLIC_ORIGIN` | HTTPS origin registered for `/benny/callback` |
| `BENNY_PILOT_SENDERS` | Comma-separated exact Spectrum sender IDs (lowercased) |
| `BENNY_ATTACHMENTS_ENABLED=true` | Separate opt-in after document-handling review; default off |
| `BENNY_SKYVERN_ENABLED=true` | Separate opt-in for reviewed browser login/read policies; default off |
| `SKYVERN_API_KEY` | Server-only Skyvern organization key; never sent to the client/model |
| `BENNY_SKYVERN_POLICIES` | JSON array validated by `portalAccessPolicySchema`: reviewed read policies or explicitly labeled sign-in-only setup policies |

Existing Spectrum provider configuration is still required. Provision the schema
by explicitly applying `db/benny.sql` to the reviewed database; startup only checks
it exists. The dedicated backend role must own these tables (owners bypass RLS),
or have deliberately reviewed server access. RLS has no client policies and PUBLIC
has no schema/table privileges. Do not expose the server role to browser clients
or share it with employer analytics. Do not grant broad BYPASSRLS casually.
A configured conversation model is now required for the pilot entry point.
Review that vendor for the intended data before activation. The personal context
lives inside the existing encrypted account aggregate; no additional migration
beyond `db/benny.sql` is needed for this foundation.

Life capabilities are additive. Ordinary messages from every sender keep the
existing school path; only allowlisted life controls/attachments use Benny ingress.
School fill polling and proactive timers remain enabled. For a known life account,
the school background messenger checks its paused/allowlist state before delivery.
Pending school proposals are cleared when an independent life control intervenes,
so a subsequent bare YES cannot authorize an old school action.
The same HTTP listener serves `/benny/callback` and optional `/benny/portal` alongside
the existing website, school OAuth/webhooks and voice/takeover WebSockets. No second
consumer or iMessage number is needed. Account state and school profile state are
not merged by family name: school imports use the exact sender match once.
Railway now checks `/health/ready`: 200 requires initialized messaging/consumer state
and accessible Benny tables, otherwise 503. Spectrum initialization failure or a
terminated consumer exits unsuccessfully for the supervisor to restart. This does not
prove end-to-end message delivery, model quality or provider availability; run a live
smoke test before inviting participants. `npm run test:readiness` checks the HTTP contract.
Keep callback URL query strings out of proxy/APM/access logs.

With zero configured policies or registered connectors, `CONNECT CVS` truthfully says access is not
enabled. Tasks and status can be tested, but no proposal can be prepared against
a live account. There is intentionally no environment flag that turns a fixture
into a live provider.

### First-person acceptance before inviting design partners

The September 15 read-only Railway configuration check found the existing Spectrum
and Skyvern credentials, but no Benny database, key, origin, allowlist or portal
policies. All three Benny enablement flags were off. Local changes were not deployed.

1. Approve the deployment destination and exact initial sender IDs. The existing
   service/line keeps its school capabilities. Do not run a second consumer on the
   same line. Deploying code with life flags off does not activate portal access.
2. Provision the private database, apply `db/benny.sql` explicitly, generate and
   retain the encryption key in the secret manager, configure the HTTPS origin and
   allowlist, then deploy. Keep attachments and Skyvern disabled until their data
   scopes and vendor handling are reviewed. Do not replace a key on an existing store.
3. From the actual iMessage account, send a greeting, read the disclosure, accept
   `JOIN PILOT`, then give one lower-sensitivity real administrative need. Verify
   the reply and `CONTEXT`, `CASES`, `STATUS`, corrections and `HANDOFF`. Check a
   requested reminder across restart and STOP/START. An unknown sender must get no
   private context; a group must get no response. Passing fixtures is not this test.
4. Separately validate the CVS account path with an explicitly authorized user:
   sign in on their phone, verify stable account identity, restore the saved session,
   confirm in iMessage, request a configured read, then DISCONNECT. Review actual
   selectors and data scope before enabling a CVS policy. No guessed account IDs,
   no automated refill submission, and no promise that Pro is approved for health data.
5. Invite the next explicitly allowlisted participant only after the applicable
   live checks pass. Give participants a direct human contact; FEEDBACK is stored,
   not an on-call notification. Pause life work if a pilot check fails and tell
   participants to stop sending sensitive information. Ordinary conversation still
   uses legacy storage; STOP is not a storage-isolation switch.

## Skyvern connection and read lifecycle

This adds browser access to the same encrypted account/context and iMessage
runtime, not a second assistant. It is **read infrastructure, not a claim/refill
executor**. `PREPARE` still requires a separately validated action connector.

### Sign-in-only setup before account verification is implemented

A policy with `mode: "login_only"`, provider `id`, `revision` and a fixed HTTPS
`loginUrl` enables human-controlled sign-in without inventing account selectors.
`CONNECT` sends the private link through the same iMessage conversation. The
notice explains that Skyvern may record page content and the pilot is not
HIPAA-validated. Opening the link starts a billed browser session; previews do not.
Finish sign-in closes that browser and saves its profile as `awaiting_verification`.
It does **not** verify login, restore the profile, expose account content to the
model, offer a confirmation code, or permit automated reads or actions. `CHECK`
reports that limitation instead of starting a browser. The UI says “saved for
setup—not verified,” and the model sees login availability separately from reads.

The local setup grant expires after 24 hours. DISCONNECT or expiry queues remote
profile removal; worker availability and vendor responses determine cleanup time.
This does not erase vendor recordings or backups. A read policy still needs actual
account-identity verification and portal-specific tests. A saved setup session is
not a completed CVS integration, refill request or benefits claim.

### Verified read policies

1. `CONNECT provider` creates a private ten-minute link with a single-use fragment
   capability. A link preview GET cannot consume it or create a paid browser.
2. The person explicitly opens a Skyvern-hosted remote browser. A secure HttpOnly
   view cookie and exact-Origin checks protect HTTP and WebSocket access. The
   Skyvern key, CDP address and profile IDs stay server-side.
3. The person signs in and handles MFA, then presses Finish sign-in. This is a
   full human-controlled browser, **not** a provider-enforced read-only account.
   Human clicks can cause real changes; the page warns to use it only for login.
   On a phone, tap the remote field then Keyboard; Enter and Backspace controls
   are provided. The masked local input clears text after committed input events
   and on blur/background/disconnect. Reconnect reopens the existing view, not a
   new paid browser. The narrow layout and key events were checked in Chromium
   with a fictional provider; actual iPhone/Safari keyboard behavior remains a
   live-device acceptance check. Server-side resizing is requested when supported.
4. Benny closes the browser, waits for asynchronous profile archiving, saves the
   profile, restores it in a fresh browser with no public viewer access, and reads
   only the configured stable account ID/label. A display name alone is inadequate.
   The newly restored session is closed and its refreshed state saved again.
5. The person confirms that account in the originating DM with `CONNECT code`.
   Confirmation authorizes up to 30 days of requested configured reads, not writes.
   This is Benny's local grant limit, not a promise that provider cookies last 30 days.
6. `CHECK provider` restores a fresh session, checks the stable account ID before
   extracting fields, and returns timestamped/source-attributed displayed values.
   No claims of verified coverage, paid reimbursement or medication ready follow
   solely from a displayed string. Configured observations enter shared context;
   credentials, profile/session IDs and account IDs do not enter the planner.
7. Each read closes its session, saves refreshed login state and queues removal of
   the previous profile. STOP gates work/viewing and suppresses queued read updates.
   DISCONNECT blocks new access and queues remote session/profile cleanup, even
   while paused. It does not revoke the website's cookies everywhere or delete
   Skyvern recordings/archives, iMessage history, backups or previous model context.

Policies have fixed HTTPS login/read URLs without query/fragment credentials,
a revision, a signed-out selector, a stable account-ID selector, an account-label
selector and one to eight explicitly selected fields (up to 300 characters each).
They are configured by an operator, never generated by the conversational model.
The current adapter supports a single read page with unique DOM selectors; it does
not navigate menus, read cross-origin frames or select dependents. Changed layouts,
missing identifiers, account switching and expired sessions block results. Passive
reads use fixed CDP commands with `throwOnSideEffect`; this is not a network sandbox.
Page scripts, provider redirects, service workers and human navigation still require
vendor/network controls and portal-specific review.

Work uses durable leases and stable profile names to reconcile lost responses.
Browser creation has no assumed idempotency key: an ambiguous creation is not
blindly repeated. Untracked browsers rely on the ten-minute vendor session timeout;
their archived state still needs vendor retention/deletion controls. Profile save,
close and passive-read failures have bounded retries. No deployment or live-account
test is implied by passing local fixtures. `test:portals` uses the same disposable
database arrangement as `test:benny`, fictional Skyvern/portal responses, HTTP and
WebSocket checks, and a CDP protocol fixture. It does not prove CVS compatibility.

An authorized public-only CVS smoke test on September 14, 2026 reached the empty
CVS login form through a Skyvern browser and verified VNC framebuffer delivery.
It did not test login, prescriptions or profile restoration. Session creation left
the page at `about:blank`; the adapter therefore explicitly navigates via CDP after
creation, for both new and restored sessions. Navigation failures retain the
session ID for durable cleanup rather than triggering another creation. Session
closure accepts the observed `completed` status as well as `closed`.

### Research informing this implementation

Checked Skyvern documentation and upstream source in September 2026:

- [Browser sessions](https://www.skyvern.com/docs/developers/optimization/browser-sessions)
  and [profiles](https://www.skyvern.com/docs/developers/optimization/browser-profiles):
  opt into `generate_browser_profile`, close before profile creation, retry the
  asynchronous archive window, and save refreshed state as a new profile. Sessions
  bill while open; profiles are the reusable state between runs. `needs_live_view`
  is a provisioning hint, not an access control; inspect the returned transport.
- [Reliability guidance](https://www.skyvern.com/docs/developers/going-to-production/reliability-tips):
  choose the most deterministic suitable block, specify COMPLETE/TERMINATE criteria,
  and compare extracted values in code. Broad Task blocks can continue navigating
  beyond the intended step. For future writes, use separate preparation and
  execution runs with exact iMessage consent and preflight revalidation between
  them, not a prompt that merely asks an unrestricted task not to submit.
- [Webhooks](https://www.skyvern.com/docs/developers/going-to-production/webhooks):
  terminal-state notifications, a ten-second response budget, no automatic retry,
  and polling fallback. A webhook failure can mark an otherwise successful run
  failed. Future action adapters must verify raw-body HMACs, durably deduplicate
  run IDs and reconcile provider outcomes, never retry a submission from that
  status alone. No Skyvern workflow webhook is needed for this session-only layer.
- [Privacy policy](https://www.skyvern.com/privacy) and
  [healthcare offering](https://www.skyvern.com/healthcare): marketing compliance
  statements are not evidence that this account/deployment has the required BAA,
  retention limits or subprocessor configuration. The policy describes recordings,
  screenshots, diagnostic logs and screenshot processing by model providers, plus
  anonymized-data model improvement (with a Google Workspace data exception).
  Resolve training-use terms, retention/deletion, subprocessors, access controls
  and any applicable BAA **before** real patient/dependent data. No per-session
  recording-disable option was verified; do not invent one in the request.

The first live milestone is one authorized, reviewed portal read using an isolated
account: sign in, confirm identity, disconnect/reconnect, and restore again after
an idle interval. Only then add one provider-specific consequential operation.

## Conversation protocol

First read the pilot disclosure and reply `JOIN PILOT`. Start with one real,
lower-sensitivity administrative task after the participants and data-handling
configuration have been reviewed. Don't send credentials, government IDs or medical
details. Health-document handling requires a separate review, not just acceptance
of the pilot notice. There is no automatic sensitive-text classifier/redactor.

1. Text the life need, such as “School recommended a speech evaluation for Emma.
   Can you help with our plan and the school paperwork?” Benny can remember the
   relevant facts and open one cross-institution case. Later steps use that same
   context. `CONTEXT` and `CASES` inspect the current facts and case progress.
2. Ask to work on a specific step; Benny can save a linked task. `UPDATE <task> <details>` corrects the request;
   `CONNECT <provider>` requests access only when a validated adapter or reviewed
   read policy exists. Browser-only connections support `CHECK <provider>`, not submission.
3. Authenticate on the provider's secure page. Never send passwords or MFA codes
   through iMessage. Confirm the account with `CONNECT <code>` in the original DM.
4. Optionally `ATTACH <task>` and upload a supported document once intake is enabled.
   Review runs locally in the background. `DOCUMENTS <task>` retrieves the latest
   facts and questions; `READ <task>` retries/rebuilds the review. Use
   `REMOVE <task> <document-id>` to remove an incorrectly attached source before
   dispatch, then upload the correct original. IDs are shown in the upload reply
   and document review. Removal is task/owner-scoped and never means cancelling a
   provider request or erasing copies already delivered through iMessage/backups.
5. `PREPARE <task>` performs read-only preparation. Missing source evidence or
   eligibility results in a blocker, not a guessed claim.
   Document conflicts/read failures must be resolved first. Missing plan context,
   OCR verification and enrollment questions are passed with the original bytes
   and attributed candidates to the trusted connector, which must resolve them
   against source/provider evidence before proposing an action.
6. Review the exact terms; send `YES <code>` or `NO <code>`. Codes expire within
   fifteen minutes or earlier at the source/action deadline.
7. `STATUS` lists recent tasks; `STATUS <task>` shows its current review/status.
   `RETRY <task>` resumes reconciliation of an unresolved provider request using
   the original key, never a newly authorized transaction.

`CANCEL <task>` works only before a provider attempt. `DISCONNECT <provider>` blocks
new access immediately and queues provider revocation. Neither can undo a request
whose dispatch intent is already committed; an in-flight request may finish.
`STOP` pauses background tasks/updates, not replies to explicit commands or remote
revocation. It does not erase records or revoke provider access.

## Document extraction limits

This is conservative field extraction, not general understanding of plan prose.
Recognized English labels include `Provider:`, `Patient:`, `Service date:`,
`Description:`, `Total:`, `Amount paid:`, `Plan name:`, `Coverage start:`,
`Coverage end:` and `Claims filing deadline:`. ISO dates and English month names
are parsed; slash dates stay unresolved. Amounts accept dollar signs or USD with
two decimal places; currency and actual out-of-pocket eligibility still require
provider verification. Subtotals are not totals, receipt dates are not service
dates, and grace-period dates are not filing deadlines. Unknown layouts, complex
tables, handwriting and other languages may need a clearer source or human review.
Do not manufacture a document to satisfy the parser.

PDFs are limited to 20 pages; encrypted PDFs are rejected. Parsing is bounded by
20 seconds per file, 45 seconds per task batch, 120,000 extracted characters and
100 candidates per document. Native subprocesses receive no application secrets
in their environment and have memory/CPU/output-file limits. Temporary original
and raster files live in a private directory and are removed on ordinary success
or failure. They are plaintext while processing; a hard process crash can leave
scratch files. A real deployment needs encrypted/ephemeral scratch storage,
crash cleanup and hardened document-processing isolation. Resource limits are not
malware detection or an exploit sandbox.

OCR output is always marked as unverified. Images are not sent to an external
model/OCR vendor by this pipeline. Document text cannot issue agent commands,
approve an action, establish dependent authority, or prove a claim was paid.
The review does not produce a claim-ready or eligible status on its own.
In the unified conversation, bounded structured document candidates (field/value,
document ID, digest, page/line and extraction method) and unresolved questions are
included in the model context for relevant tasks. Original bytes, full extracted
pages, source quotes, executor payloads and stored credentials are excluded.
These candidates may contain health information; local OCR does not eliminate
the requirement to review the conversation-model vendor for that information.

## Requirements for the first real connector

Implement `BennyConnector` only for a narrowly validated provider/operation. Set
`validated` only after independent provider-specific acceptance testing:

1. Verify authorized API access, scopes, tenant/account identity, refresh/expiry,
   provider terms and any partner approvals. The generic PKCE inputs do not create
   an OAuth integration where a provider offers none.
2. Keep `prepare` and `validate` read-only. Validate dependent authority,
   eligibility, covered service dates, filing deadlines, existing requests and
   required documentation from authoritative sources. Make the displayed review
   fully describe the exact executable payload. Treat portal/document text as
   untrusted data, not instructions for tools.
3. Supply a stable account-scoped expense/Rx/slot `resourceKey`. Implement definitive
   lookup semantics and independently test lagging searches, lost responses,
   duplicate requests and idempotency retention windows. If uncertain, return
   `unknown`. Advertise `idempotentSubmit` only when the provider enforces the key.
4. For a browser adapter, build isolated encrypted sessions, restricted network
   destinations/actions, secure human takeover for MFA/CAPTCHA, proof of completed
   login, credential lifecycle/revocation and screenshot/trace redaction. A saved
   cookie and a prompt are not sufficient. The supplied browser layer reads only;
   no automated form-filling/submission executor is enabled.
5. Return evidence-backed outcomes and test pending, denied, additional-information,
   completed and expired-access states. Refill/renewal support is administrative,
   not prescribing, dosing advice or an emergency-care service.
6. Exercise the real Spectrum line end-to-end with authorized test participants,
   including reconnect, message failure, process restart and STOP/DISCONNECT.

## Known operational and privacy limits

- Memory access is currently scoped to the individual pilot sender. Per-fact
  sharing controls, verified household-member identities, dependent authority,
  employer tenancy and cross-channel identity linking are not implemented. Names
  are reported subject labels, not verified identities or authorization grants.
- Retrieval is a bounded keyword/recency projection of the same shared context,
  not separate domain memories. It selects up to 30 current facts, five cases,
  ten tasks and twelve recent message excerpts, with omitted/truncated counts.
  It is not semantic search, and may miss an indirect reference. Fact/case limits
  are 500/100 per account, fifteen steps per case and forty retained chat messages.
- The standalone planner used in protocol tests has a twenty-second abort signal
  and private error logging and runs under an account transaction. Production uses
  the existing school model loop instead, then commits each life plan transactionally.
  That loop retains its existing logging and timeout behavior; do not infer the
  standalone planner's privacy guarantees for the unified conversation. Cases and
  facts are model-extracted reports, not an independent guarantee of truth.
  Free-form replies still need model evaluation.
- No HIPAA-compliance claim. Encryption and consent code do not establish the
  legal role, BAAs, vendor suitability, access controls, incident response, audit
  retention or lawful processing for health data. Review the full chain including
  iMessage bridge/Spectrum, hosting, database, browser and any model vendor. Employer
  access to personal or dependent health details must remain separate.
- Phone/email possession is the current pilot identity boundary, not identity
  proofing or verified authority over a child. Account recovery, number reassignment,
  employer membership and guardian permissions need a stronger onboarding design.
- No managed key rotation, account-wide deletion/export workflow, record retention enforcement,
  malware scanning, append-only audit service, quiet hours, human operator queue or
  on-call alerting yet. Use fictional data for automated checks; real-user rollout
  requires a reviewed, narrow data scope and appropriate policies/controls. File
  signatures are not malware detection. The notice alone does not establish lawful
  processing or make this deployment ready for health documents.
- The worker scans encrypted account aggregates, serially, for a small pilot.
  It is not a high-volume scheduler. Before scaling, use indexed due-work queues,
  bounded account history and isolated worker/delivery pools with backpressure.
- Outgoing messages are **at-least-once**, not exactly-once: a crash after a send
  is accepted but before its acknowledgement is saved can repeat a notification.
  Task approvals and provider dispatch have their own independent deduplication.
- Login callbacks are single-use. A crash after consuming a callback requires a
  fresh link. A crash or timeout between provider token issuance and persistence
  may leave an orphan provider grant; adapter/provider lifecycle controls and user
  revocation must cover this. There is no atomic transaction with the provider.
- Connector timeouts request cancellation; they cannot guarantee a remote action
  stopped. Dispatch ambiguity is reconciled, never presented as certain failure.
  Removing a sender from the pilot allowlist blocks intake/work/delivery after the
  configuration reload, but is not a substitute for disconnecting their providers.

The next shippable milestone is one authorized provider's read-only connection and
one fully tested action through a real iMessage line, not nominal support for every
portal in the inventory.

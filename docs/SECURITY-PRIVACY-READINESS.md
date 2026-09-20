# Security & privacy readiness — verified posture, gaps, and what we cannot claim

This is an audit of the **live system as deployed**, not a design document. Every claim below is
either marked **VERIFIED** (I checked it in this repo or against the running service and say how),
**UNVERIFIED** (needs a check I cannot perform from the code — say, inside the Supabase or Skyvern
dashboards), or **INFERENCE** (my judgement, labelled).

The point of this file is to make "high security, high privacy" a set of specific, checkable
statements we can defend to a parent, a school district, or an employer — and to list the places
where saying it today would be a lie.

---

## 1. What is verifiably true today

| Control | Status | Evidence |
|---|---|---|
| Consequential actions are consent-gated in code | **VERIFIED** | `src/agent/steps/executor.ts` runs steps only on an explicit parent approval; `skyvern_fill_form` fills and **never** submits (`src/integrations/skyvern.ts` phase A vs `submitFilledForm` phase B); `submit_form` is a separate proposal (`src/agent/tools.ts`). |
| Consent is logged per family | **VERIFIED (with a hole)** | `logConsent` writes `consent_event` (`src/integrations/consent.ts`). **Hole:** if Supabase is unreachable it degrades to `console.log`, so the durable record is best-effort. |
| Row Level Security exists for family tables | **VERIFIED (in SQL), UNVERIFIED (live)** | `db/rls-family.sql` scopes `family_profile`/`case_record` to `current_family_id()`; `db/gmail-token.sql`, `db/conversation.sql`, `db/email-triage.sql`, `db/connections.sql`, `db/consent.sql`, `db/benny.sql` each enable RLS. Whether they were ever **applied** to the live database is unverified — `scripts/init-db.ts` only auto-applies `rls.sql`, not the rest. |
| Public webhooks fail closed | **VERIFIED** | `/webhooks/inbound-email` requires a timing-safe `x-inbound-secret` and rejects when the secret is unset (`src/integrations/web.ts`); `/webhooks/skyvern` verifies an HMAC signature and 401s otherwise. |
| New numbers must prove they own the phone | **VERIFIED** | 6-digit OTP before onboarding; `requireVerification` defaults **on** (`src/agent/agent.ts`), `REQUIRE_VERIFICATION` is unset in production. |
| Secrets are not in the repo | **VERIFIED** | `npm run check:secrets` scans tracked files for key-shaped strings; clean. Production secrets live in Railway env only. |
| The service holds no public database key | **VERIFIED** | The deployed service has `SUPABASE_SERVICE_ROLE_KEY` and **no** `SUPABASE_ANON_KEY`; all data access is server-side. |
| Benefits-pilot vault crypto is sound | **VERIFIED** | AES-256-GCM with purpose-bound AAD, keyed HMAC-SHA256 for lookup indexes, 32-byte key validated at boot, schema allowlist + statement timeout (`src/benefits/runtime-store.ts`). |
| Two-phase fill/submit against browser automation | **VERIFIED** | Phase A fills only; Phase B re-fills + submits only from the post-YES path; sessions closed on failure/decline, kept for the approved submit (`src/integrations/skyvern.ts`). |
| Brand-consistent honesty posture | **VERIFIED** | `docs/CAPABILITY-TRUTH-TABLE.md` maps every parent-facing promise to the code that backs it. |

That is a genuinely better-than-average starting point for a pre-seed product: the consent gate and
the fill/submit split are *structural*, not prompt-level, and they are the two controls that matter
most for "the agent did something to my child's account without me".

## 2. Gaps, ordered by risk

### G1 — Parent and child PII is written to application logs (live, today) — HIGH
**Evidence:** production Railway logs contain a real child's name, grade, school and the parent's
email address, because `runTool` logs tool arguments through `redactForLog`, which only masks keys
matching `password|token|otp|ssn|dob|…` — not `email`, `parent_email`, `first_name`, `phone`,
`school` (`src/agent/tools.ts`). Observed verbatim in deployed logs:
`[tool] skyvern_fill_form {"values":{"first_name":"…","parent_email":"…@gmail.com"}}`.
**Why it matters:** the log store becomes an unmanaged second copy of the family's data, outside any
retention or deletion path, visible to anyone with log access (including vendors).
**Fix:** central PII classifier in the logger (mask emails/phones/names by *shape*, not key name),
plus a redaction test. Small change, high value.

### G2 — Gmail: broad scope + plaintext refresh tokens — HIGH
**Evidence:** scopes are `gmail.send` **and `gmail.readonly`** (`src/integrations/gmail.ts`) — read
access to the parent's entire mailbox, not just school mail. Tokens are stored as plaintext columns
(`refresh_token text`, `access_token text`) in `db/gmail-token.sql`, protected only by RLS.
**Why it matters:**
- `gmail.readonly` is a Google **restricted scope**. Per Google's own
  [restricted scope verification policy](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification):
  any app that accesses restricted-scope data **from or through a server** "must undergo an **annual
  security assessment** from an independent, third-party assessor that is approved by Google" using the
  **CASA** framework, re-verified **at least every 12 months**; the process "can potentially take
  several weeks"; and it additionally requires brand verification, a published privacy policy meeting
  the Limited Use requirements, and a demonstration video. Google's page even calls out the case that
  matches us: *"If your app is a task automation platform, your demonstration video must showcase how
  multiple API workflows are created and automated, and in which directions user data flows."*
- There **is** an escape hatch for a pilot: the documented exceptions cover personal use (a few users
  known personally to you) and development/testing/staging. So the current pilot is legitimate — but
  the moment we onboard real parents at volume, Gmail-read becomes a launch gate with a vendor
  assessment and a recurring annual cost. "High privacy, ready to go" cannot mean "we'll do CASA later."
- A refresh token is a long-lived credential to a parent's email. Storing it unencrypted means any
  database read — or backup, or support session — is a full account compromise.

**Fix, in preference order:**
1. **Default to forwarding, not reading.** We already have the per-family inbound address
   (`family_inbox.local_part` + the `/webhooks/inbound-email` handler). A parent forwarding school
   mail to their address needs **no restricted scope at all** — smaller compliance footprint, smaller
   blast radius, and it is already built. Make Gmail-connect the optional power feature.
2. Encrypt any stored token with the existing vault pattern (AES-256-GCM, AAD-bound) — never plaintext.
3. If Gmail-read ships at scale, budget the verification + annual CASA assessment as a launch
   dependency with a date, and write the privacy policy to the Limited Use standard before submitting.

### G3 — `family_memory` has a world-readable RLS policy in the file that IS auto-applied — HIGH
**Evidence:** `db/rls.sql` (the only RLS file `scripts/init-db.ts` applies) contains
`create policy family_memory_read on family_memory for select using (true);` with a `TODO` to scope
it. The newer, correct `db/rls-family.sql` does not touch `family_memory` at all.
**Why it matters:** `family_memory` holds the family's situation graph (needs, challenges, housing,
IEP-adjacent detail). If the anon key is ever exposed or used, that table reads open.
**Fix:** one-line policy change + re-apply. Should be fixed regardless of whether anon is used today.

### G4 — RLS application state is unverified — HIGH (unknown-by-omission)
**Evidence:** only `rls.sql` is applied by `scripts/init-db.ts`; `rls-family.sql`, `consent.sql`,
`conversation.sql`, `email-triage.sql`, `gmail-token.sql`, `connections.sql`, `processed-message.sql`
must be pasted into the Supabase SQL editor by hand. Several tables exist with live rows
(`family_profile`, `gmail_token`), but I cannot read `pg_class.relrowsecurity` through the API.
**Fix:** run `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace order by 1;`
in the Supabase SQL editor and paste the output into this file as evidence. Then apply anything missing.

### G5 — The parent's school-portal session lives with a third-party vendor — HIGH (disclosure)
**Evidence:** after the parent signs in themselves, we save the session as a **Skyvern browser
profile** (`POST /v1/browser_profiles`) and keep only the profile id
(`src/integrations/connections/parentPortal.ts`). Revocation deletes the vendor-side profile — which
is correct — but until then a logged-in credential to the child's school record is held by Skyvern.
Likewise, page content read for the agent passes through Browserbase/Stagehand.
**Why it matters:** this is the single most sensitive artifact we create, and it is the one a
district security reviewer will ask about first. It must be named in the privacy policy, covered by
a DPA with the vendor, and revocable by the parent in one tap (we have the revoke path).
**Fix:** vendor DPAs + explicit disclosure + surface "connected portals" with a revoke control.

### G6 — No retention or deletion completeness — MEDIUM/HIGH
**Evidence:** `/reset` clears the family identity, cases, memory, students and the conversation's
messages (`src/integrations/identity.ts`, `src/integrations/conversation-store.ts`). It does **not**
clear triaged school email (`incoming_email`, `family_inbox`), `consent_event` (intentional — it is
an audit log), `processed_message`, or `verification`. There is no scheduled retention policy
anywhere in the repo.
**Why it matters:** "delete my family's data" must be true end-to-end for CCPA/CPRA deletion
requests, and a school district will ask for a retention schedule.
**Fix:** define retention per table (e.g. messages 90 days, triaged email 30 days, consent 7 years),
implement a pruning job, and make deletion cover every table that references the family.

### G7 — Plaintext OTP codes at rest — LOW/MEDIUM
**Evidence:** `db/verification.sql` stores `code text` in the clear.
**Fix:** store a hash (the code is short-lived and rate-limited by `attempts`, so this is hygiene,
not an emergency).

### G8 — No abuse controls on the inbound channel — MEDIUM
**Evidence:** any number that texts the line gets an agent; the only gate is OTP ownership of that
same number. There is no rate limit on inbound messages, no per-family cost cap, and each message
triggers model calls (and potentially paid browser runs).
**Fix:** per-number rate limit, a daily model/browser budget per family, and an invite/allowlist
mode for the pilot phase.

### G9 — Model-provider fallback is silent and cross-jurisdiction — MEDIUM (claim risk)
**Evidence:** with `ANTHROPIC_API_KEY` set, chat/frontier/small all resolve to Anthropic only
(`src/agent/model-policy.ts`). If that key is missing, `chatModel()` silently falls back to
**DeepSeek** (China-based processor). Parent conversations would then flow to a different
jurisdiction with different retention terms, with no code change and no log line.
**Fix:** make the fallback explicit (`ALLOW_DEEPSEEK_FALLBACK=true`), so a privacy-relevant
routing change can never happen by accident.

### G10 — No incident, policy, or assurance artifacts — MEDIUM (procurement blocker)
No SOC 2, no published privacy policy for the *service* (the site's panel covers the website only),
no subprocessor list, no DPA templates, no breach runbook, no cyber insurance. This — not
technology — is what stops a district or employer from signing.

## 3. What we must not claim

- **"Your data is never shared with model providers."** False: message content is sent to the
  model to generate replies. The accurate, defensible version is in the current onboarding copy:
  *"The only system that reads your messages is the AI that writes my replies"* — plus, once
  verified, "not used to train models" and "not retained beyond the request".
- **"We never see your password."** True for the portal-takeover flow (the parent types into the
  live browser session). Do **not** extend it to "we can't access your school account" — we hold a
  signed-in session for as long as the connection exists (G5).
- **"Bank-level encryption" / "military-grade".** Meaningless to a reviewer; say AES-256-GCM for
  the vault, and say plainly what is *not* encrypted (Gmail tokens today).
- **"We are HIPAA compliant" / "FERPA compliant".** Neither is a certification a vendor can simply
  hold; both are fact-specific. Say what we do instead (no health-data integration is authorized in
  the current rollout; we act on the parent's instructions) and get counsel before implying either.
- **"SOC 2"** — until a real report exists. A district questionnaire will ask for the report, not
  the roadmap.

---

## 4. Where we sit vs the state of the art in computer-use

Full analysis, sources, and the corrected diagnosis of our three browser failures are in
**`docs/COMPUTER-USE-SOTA.md`**. The security-relevant conclusions:

- **Our real unattended success rate on novel multi-page forms is ~1 in 3** (ClawBench 33.3%,
  HealthAdminBench 36.3% end-to-end on live production sites). Any promise to a parent — or a school —
  must be built around that number, not around a demo that worked once.
- **`completed` from the browser vendor does not mean the action happened**, and our submit path
  currently treats it as success (`src/integrations/skyvern.ts` `submitFilledForm`). This is the same
  class of defect as the M1–M5 items in `docs/CAPABILITY-TRUTH-TABLE.md`: the product telling a parent
  something happened when it did not. On a child's enrollment record it is the worst defect we can ship.
- **Injection is the central agentic threat, and the only defense with clean results is code-level
  authorization at the action layer** (domain allowlist + irreversible-verb gate), not model judgement
  (LivePI 2026; RedTeamCUA ICLR 2026 reports 42.9% attack success for one frontier CUA). We already
  have the right *shape* — the consent gate is code, and fills cannot submit — but there is no domain
  allowlist and no irreversible-action gate behind it.
- **A stale element reference in a multi-page wizard can turn "Cancel" into "Delete"**
  ([arXiv 2511.19477](https://arxiv.org/abs/2511.19477)); neither of our vendors version references.
  This is a correctness-and-safety gap for anything that writes to a child's record.
- **No internal eval exists.** Until we measure 50–100 real flows with submissions intercepted, every
  claim about reliability — and every security control's effectiveness — is unmeasured.

## 5. Minimum credible posture for a small team

### 5.0 The subprocessor inventory (verified in the deployed config)

This list is a prerequisite for every privacy claim, every DPA, and every security questionnaire.
It is derived from the live environment and the code paths that send data outbound.

| Vendor | What it receives | Verified how | Covered by a DPA today? |
|---|---|---|---|
| **Anthropic** | Every parent message + family context (chat, research, planning) | `ANTHROPIC_API_KEY` set; `chatModel()`/`frontierModel()`/`smallModel()` all resolve to Anthropic when it's present (`src/agent/model-policy.ts`) | Unknown — needs one |
| **OpenAI** | **Page content the agent reads** (school portal pages, forms) plus browser instructions | `STAGEHAND_MODEL=openai/gpt-6-astra` + `OPENAI_API_KEY` (`src/integrations/browser.ts`) | Unknown — needs one. This is the one people forget |
| **DeepSeek** | Parent messages **only if the Anthropic key is missing** — silent fallback | `frontierModel()` fallback branch | Unknown — **and a jurisdiction issue worth eliminating** (see G9) |
| **Skyvern** | Filled form values (child name, school, parent email), page content, and **the saved portal session** | `SKYVERN_API_KEY`; `POST /v1/browser_profiles` | Unknown — needs one; this is the highest-risk vendor relationship |
| **Browserbase** | Browser sessions for page reading | `BROWSERBASE_API_KEY`, `BROWSER_BACKEND=stagehand` | Unknown |
| **Tavily** | Research queries about schools/districts | `TAVILY_API_KEY` | Unknown |
| **Resend** | Outbound email to schools (when Gmail isn't connected) | `RESEND_API_KEY` | Unknown |
| **Google** | OAuth for Gmail (send + **read**), Calendar | `GOOGLE_CLIENT_ID/SECRET`, redirect URI | N/A (platform) — but triggers CASA, see G2 |
| **Retell** | Voice calls; family details as call variables; call audio/transcripts on their side | `RETELL_API_KEY/AGENT_ID/FROM_NUMBER` | Unknown — needs one, plus recording policy |
| **Supabase** | The database itself (guardian, student, family_profile, case_record, family_memory, message, gmail_token, incoming_email, consent_event…) | `SUPABASE_SERVICE_ROLE_KEY` | Standard DPA available |
| **Railway** | Hosting + **application logs** (which contained family PII until this week's fix) | deployed service | Standard |
| **Vercel** | Website + the inquiry/waitlist endpoints | `vercel.json` | Standard |

### 5.1 Tier 1 — before a school district or an employer will take us seriously

Ordered by risk removed per unit of effort. These are engineering/ops actions; the legal items are in
5.3.

1. **Encrypt the Gmail tokens** with the existing vault pattern (AES-256-GCM, AAD-bound) — G2.
2. **Stop PII in logs** — *done this week* (`redactForLog` by key name + shape, tested; G1).
3. **Verify and repair RLS on the live database** — run the `pg_class` query, apply every RLS file,
   and remove the `using (true)` policy on `family_memory` in `db/rls.sql` — G3/G4.
4. **Make deletion complete**: extend `/reset` to cover `incoming_email`, `family_inbox`,
   `processed_message`, `verification`, and any vendor-side artifacts (Skyvern browser profile —
   we already have the revoke call; wire it into deletion) — G6.
5. **Close the false-submission hole** (M12): verify the submission and only then claim it. The other
   items in this list protect the family's data; this one protects the family from us.
6. **Kill the silent DeepSeek fallback**: require an explicit `ALLOW_DEEPSEEK_FALLBACK=true` (G9).
7. **Rate-limit and cap the inbound channel** (per number, per day) — G8.
8. **DPAs + published privacy policy + subprocessor list** for the 12 vendors above, and a
   security page that states the true things (what's encrypted, what isn't, where the portal session
   lives, which AI providers process messages) — G10.
9. **Verify Skyvern webhook freshness** (`x-skyvern-timestamp`) alongside the HMAC we already check.
10. **A one-page incident runbook**: who is on call, how we revoke a vendor key, how we delete a
    family, how we notify. Cheap, and it is the first thing an enterprise buyer asks to see.

### 5.2 Tier 2 — the next 90 days

- **SOC 2 Type II readiness** (not the report): policy set, access reviews, change management,
  vendor inventory, logging — the report itself costs real money and takes an observation window.
- **CASA security assessment** *if and only if* Gmail-read ships at scale (G2). Prefer the forwarding
  model and skip it.
- **Penetration test** on the inbound surface (the iMessage path, the takeover page, the webhooks).
- **Key management**: move `BENNY_ENCRYPTION_KEY` and the Gmail token key into a KMS with rotation,
  instead of a static base64 env var.
- **Action-layer authorization**: domain allowlist + irreversible-verb gate in front of every browser
  action (this is also the injection defense — see §4).
- **The internal eval**: 50–100 real flows, submissions intercepted, human-labelled. Without it, none
  of the above can be shown to work.
- **Cyber liability insurance.**

### 5.3 Legal & regulatory — pending the compliance research stream

*(this subsection is being populated from a dedicated legal/regulatory research pass; the specific
statutes, their applicability, and the plain-language claims we may make will be filled in here with
primary-source citations. Until then, treat every legal question below as open.)*

Open questions that pass will answer: does FERPA bind us when we read a portal on a parent's
instruction; does COPPA apply when the parent is the user; which California AI/ADMT and student-data
laws apply; what our CCPA/CPRA deletion and disclosure obligations are; what a district or employer
questionnaire will demand; and what we must never claim. The "must not claim" list in §3 is already
safe to rely on — those are architectural facts, not legal interpretations.

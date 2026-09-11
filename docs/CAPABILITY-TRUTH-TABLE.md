# Capability Truth Table

Axolotl tells parents it can do things — email the school, fill and submit forms, place calls, "see" a child's status. A parent trusts those words and acts on them. This document audits **every capability claim the agent makes to a parent** and classifies it by what the code can actually do today:

- **`real`** — the agent can do it end-to-end right now (given its configured providers).
- **`mock`** — it is stubbed, returns fabricated data, or silently does nothing real.
- **`research-only`** — the agent can find/read/explain the information, but cannot perform the action.

> **Audit basis:** a point-in-time snapshot of the working tree of this repo. At audit time the tree contained **uncommitted, actively-changing edits** (including `src/agent/agent.ts`, `src/agent/state.ts`, `src/agent/tools.ts`, and a new in-progress portal-connect/takeover feature in `src/integrations/connections/` + `src/integrations/connect-stream.ts`). Line numbers are against that snapshot, not `HEAD`, and may drift as concurrent work lands. Capabilities marked `real (env)` depend on provider credentials; the env notes at the bottom state what was present locally.

---

## Main table

| Claim (as the parent hears it) | Where it is said | Reality | Evidence (the provider/function that proves it) | Verdict |
|---|---|---|---|---|
| "Email the school on your behalf" | `src/agent/onboarding.ts:28` | real (env) | `ResendEmailProvider` (`src/integrations/email.ts:30`) / `GmailEmailProvider` (`src/integrations/gmail.ts:152`) via `EmailAdapter` (`src/agent/steps/adapters/email.ts:25`); consent-gated by `StepExecutor` (`src/agent/steps/executor.ts:20`) | ok |
| "Fill out forms and applications" | `src/agent/onboarding.ts:29` | real (env) | `fillFormForReviewAsync` (`src/integrations/skyvern.ts:246`) + Stagehand `browserFill` (`src/integrations/browser.ts:273`) | ok |
| "Place calls (and leave a voicemail)" | `src/agent/onboarding.ts:30` | real (env) / mock fallback | `RetellClient.createCall` (`src/integrations/phones.ts:39`) when `RETELL_*` set; else `MockVoiceProvider` (`src/integrations/voice.ts:21`) **fabricates a "resolved" outcome**. "Leave a voicemail" is not a distinct feature. | **MUST CHANGE** (M9, M11) |
| "📄 Fill out a form or sign-up — I fill it with your child's info, show you, and only submit when you say go." | `src/agent/onboarding.ts:142` | real (env) | Skyvern async fill + `SubmitAdapter` runs only post-consent (`src/agent/steps/adapters/submit.ts:18`, `executor.ts:20`) | ok |
| "✉️ Email the school or district for you — I draft it, you approve it, **it sends from you**." | `src/agent/onboarding.ts:143` | real (env) — except "from you" | `gmailProviderFor` (`src/integrations/gmail.ts:210`) only if the parent completed Gmail OAuth; otherwise `ResendEmailProvider` sends from Axolotl (`noreply@get-axolotl.com`) | **MUST CHANGE** (M3) |
| "📞 Call the office and handle it — **then text you what they said**." | `src/agent/onboarding.ts:144` | mock (feedback half) | Call placement is real (Retell), but there is **no Retell webhook route** (`src/integrations/web.ts` routes only gmail/skyvern/waitlist/call-me) and `Agent.logCallResult` (`src/agent/agent.ts:492`) is **never called**. No transcript ever returns to the parent. | **MUST CHANGE** (M2) |
| "⏰ Set a reminder to follow up on something, so nothing slips." | `src/agent/onboarding.ts:145` | real | `set_reminder` → `FollowUpEngine.schedule` via `SupabaseFollowUpStore` (`src/integrations/followup-store.ts:56`); fired by `runProactive` (`src/agent/agent.ts`) | ok |
| "🔑 Connect to your parent portal(s) so I can see assignments, forms, and what's available." | `src/agent/onboarding.ts:146` | **mock** (implementation in progress) | No finished portal integration yet. At audit time the only *working* connect flow is Gmail OAuth (`src/integrations/web.ts:58`); a portal **takeover/live-view** feature was being built but uncommitted (`src/integrations/connections/parentPortal.ts`, `connect-stream.ts`) and does not read assignments. | **MUST CHANGE** (M1) |
| "I can help with things like transportation, meals, attendance, conferences, enrollment, or special education." | `src/agent/onboarding.ts:85`, `:94` | research-only (partial) | Research is real; but conference booking is `MockCalendarProvider` (`src/integrations/calendar.ts:29`) and absence submission is `MockSis` (`src/integrations/sis.ts:31`) reached only from dead code (`src/tools/*`, `executeTool` never called). | ok (help ≠ perform) but see SIS/calendar findings |
| "McKinney-Vento covers you … Key contact: {liaison name, phone}" | `src/agent/onboarding.ts:156` | real | Researched `district.liaison` (`src/knowledge/districts.ts`), gated on `district.known && type==='public'` | ok |
| "YOUR JOB: … research it, find the form/program/contact, **fill + submit with consent**, or guide where you hit a hard wall." | `src/agent/tools.ts:1090` | real (env) | Skyvern/Stagehand fill + `StepExecutor` consent gate | ok |
| "HONESTY … you CANNOT see a child's meal/benefit status, grades, attendance, or the parent's calendar — you can help them APPLY and can set reminders." | `src/agent/tools.ts:1091` | real (honest) | Matches the mock providers: `MockMealsProvider` (`src/integrations/meals.ts:23`), `MockSis` (`src/integrations/sis.ts:31`), `MockCalendarProvider` (`src/integrations/calendar.ts:29`) | ok |
| "GIVE LINKS … include its source URL so it's TAPPABLE in iMessage" | `src/agent/tools.ts:1095` | real | URLs come from live research results | ok |
| "RESEARCH WELL INTERNALLY … research BOTH the school/district programs AND around-town/community free resources" | `src/agent/tools.ts:1096` | real | `web_search`/`web_fetch` via `r.jina.ai` (`src/agent/tools.ts:716`, `:723`) | ok |
| "ASK THE ONE UNLOCK QUESTION … I can help you APPLY and walk you through eligibility (**I can't see your status directly**)." | `src/agent/tools.ts:1097` | real (honest) | Honest about meals; apply is via web form/email, not a district API | ok |
| "TIGHT LOOP … find the ACTUAL district/school programs → … → open + fill it." | `src/agent/tools.ts:1100` | real (env) | Skyvern fill | ok |
| "you always have **real, generally-available programs** to offer as a baseline — ELO-P … 21st Century Community Learning Centers … free & reduced-price meals." | `src/agent/tools.ts:1101` | **research-only** | Model's built-in knowledge, asserted even "if live research is thin"; availability at the family's actual school is not confirmed | **MUST CHANGE** (M7) |
| "You HAVE live internet access: use web_search … web_fetch" | `src/agent/tools.ts:1104` | real | `src/agent/tools.ts:716-733` (`https://r.jina.ai/...`) | ok |
| "To FILL or SUBMIT any web form … use skyvern_fill_form" | `src/agent/tools.ts:1105` | real (env) | `src/integrations/skyvern.ts` | ok |
| "The browser_* tools are for READING pages web_fetch cannot" | `src/agent/tools.ts:1105` | real (env) | Stagehand (`src/integrations/browser.ts`), needs `BROWSER_BACKEND=stagehand` | ok |
| "For FILLABLE PDF application forms use pdf_fields … pdf_fill — returns a completed PDF" | `src/agent/tools.ts:1105` | real | `pdf-lib` fill, writes a local PDF (`src/integrations/pdf.ts:264`, `:324`) | ok |
| "VERIFY A PAGE BEFORE YOU FILL IT … call browser_assess" | `src/agent/tools.ts:1106` | real (env) | `browserAssessPage` (`src/integrations/browser.ts:346`) | ok |
| "SIGN-UP FLOW … skyvern_fill_form FILLS ONLY … runs in the BACKGROUND" | `src/agent/tools.ts:1107` | real (env) | `fillFormForReviewAsync` (`src/integrations/skyvern.ts:246`) + webhook/poller | ok |
| "FILL-BUT-DON'T-SUBMIT … It fills only and never submits" | `src/agent/tools.ts:1108` | real (env) | Fill-task prompt forbids submit; submit is a separate gated step | ok |
| "FORM RECIPE … every form you work once, you fill perfectly forever after." | `src/agent/tools.ts:1109` | real (mechanism) / overpromise | Supabase `form-recipe` store (`src/integrations/form-recipes.ts`) — it's a saved structure hint, not a guarantee | **MUST CHANGE** (M8) |
| "Never submit a form without the parent's explicit consent" | `src/agent/tools.ts:1110` | real | `StepExecutor.run` consent gate (`src/agent/steps/executor.ts:20`) | ok |
| "ACCOUNT FLOW … create or access the account … text me that code and I'll finish up." | `src/agent/tools.ts:1111` | real (env) | `AccountAdapter` (`src/agent/steps/adapters/account.ts`) + `BrowserAuthDriver` (`src/integrations/auth.ts:42`) | ok |
| "LIMITS & HANDOFF … this form requires you to sign in yourself / pass a security check" | `src/agent/tools.ts:1112` | real (honest) | Honest handoff copy | ok |
| "PRIORITY OF OFFERS (1) FILL & SUBMIT THE FORM … (2) EMAIL … (3) CALL" | `src/agent/tools.ts:1122` | real (env) | Skyvern / email / Retell | ok |
| "Act for the parent: … CALL the send_email / call_school tool RIGHT AWAY. The system enforces a hard consent gate" | `src/agent/tools.ts:1126` | real | Consent gate (`executor.ts:20`) | ok |
| "You CAN place phone calls … Never say you can't make calls — you can" | `src/agent/tools.ts:1127` | real (env) / mock fallback | Retell if configured; else `MockVoiceProvider` fabricates success (`src/integrations/voice.ts:21`) | **MUST CHANGE** (M9, M10) |
| "REMINDERS … it schedules and messages them at that time … You CANNOT see the parent's calendar" | `src/agent/tools.ts:1128` | real (honest) | `FollowUpEngine`; calendar claim matches `MockCalendarProvider` | ok |
| "you send it **from their connected Gmail** via the agent — reliable + from them" | `src/agent/tools.ts:1130` | real (conditional) | `GmailEmailProvider` (`src/integrations/gmail.ts:152`) only when connected; else Resend | **MUST CHANGE** (M3) |
| "Don't announce you're an AI, **a demo**, or a bot." | `src/agent/tools.ts:1118` | policy risk | Combined with demo-mode counterparties (`src/agent/agent.ts:784`) and the `FormAdapter` summary (below), this invites claiming school contact that didn't happen | **MUST CHANGE** (M4) |
| "MISSION … figure out the delta between what {child} is entitled to … and what they're **ACTUALLY receiving**" | `src/agent/tools.ts:1145` | **research-only** | The entitlement side is a profile-text heuristic (`auditEntitlements`, `src/knowledge/entitlements.ts:122`); there is **no data source for actual receipt** (meal status is mock/unknown, no SIS read). The "delta" is inferred, not observed. | **MUST CHANGE** (M6) |
| "PURSUE the concrete, provable gaps … sign the child up." | `src/agent/tools.ts:1146` | real (env) | Skyvern/email/call | ok |
| "For each … fill the sign-up form via skyvern_fill_form … else draft the email … place a call only as the backstop." | `src/agent/tools.ts:1147` | real (env) | Skyvern / email / Retell | ok |
| "get_school_info: Look up a fact about the school/district (principal, phone, address)" | `src/agent/tools.ts:75` (desc), case `:539` | real | `researchDistrictProfile` + knowledge graph; honest "not researched yet" fallback | ok |
| "get_law: Get the relevant federal/state law" | `src/agent/tools.ts:83` (desc), case `:555` | real | Static grounded `LAW_FACTS` table (`src/agent/tools.ts:59`) | ok |
| "diagnose_barrier / get_remedy / draft_outreach" | `src/agent/tools.ts:91`, `:99`, `:107` | real | `detectBarriers` / `barrierByCategory` (`src/knowledge/barriers.ts`) | ok |
| "send_email: Send an email to a school contact. ONLY call this AFTER the parent explicitly confirms" | `src/agent/tools.ts:161` (desc), case `:571` | real (env) — **demo caveat** | Resend/Gmail, but in demo mode the recipient is `demo-liaison@example.com` (`src/agent/agent.ts:784`) and the parent is told "Sent the request to the school." | **MUST CHANGE** (M4) |
| "account_action: create an account (signup), log in (login), or finish a one-time code" | `src/agent/tools.ts:173` (desc), case `:595` | real (env) | Stagehand-driven `AccountAdapter` | ok |
| "submit_form: Propose the consent-gated SUBMIT of the form you just filled" | `src/agent/tools.ts:192` (desc), case `:637` | real (env) | `SubmitAdapter` → `submitFilledForm` (Skyvern) or `browserSubmit` (Stagehand) | ok |
| "skyvern_fill_form: Fill a web form … FILLS ONLY — it never submits" | `src/agent/tools.ts:200` (desc), case `:655` | real (env) | `src/integrations/skyvern.ts` | ok |
| "get_form_recipe / save_form_recipe" | `src/agent/tools.ts:215`, `:223` | real (env) | Supabase `form-recipe` (`src/integrations/form-recipes.ts`) | ok |
| "web_search / web_fetch: Search the web / Fetch and read a web page" | `src/agent/tools.ts:242`, `:250` | real | `r.jina.ai` proxy (`src/agent/tools.ts:716`, `:723`) | ok |
| "browser_open / browser_observe / browser_act / browser_extract / browser_fill / browser_vision" | `src/agent/tools.ts:258`–`:315` | real (env) | Stagehand (`src/integrations/browser.ts`); returns "browser unavailable" honestly when unset | ok |
| "extract_pdf / pdf_fields / pdf_fill" | `src/agent/tools.ts:316`, `:324`, `:332` | real | `src/integrations/pdf.ts` | ok |
| "browser_assess: Evaluate whether a web page is a real, working form" | `src/agent/tools.ts:358` | real (env) | `browserAssessPage` (`src/integrations/browser.ts:346`) | ok |
| "save_evidence: Persist a verified claim with its source" | `src/agent/tools.ts:370` | real (env) | `createEvidence` (`src/integrations/evidence-store.ts`) | ok |
| "search_school_graph / save_resource" | `src/agent/tools.ts:391`, `:407` | real (env) | `src/knowledge/resource-graph.ts` (Supabase) | ok |
| "save_procedure / list_skills" | `src/agent/tools.ts:428`, `:449` | real (env) | `src/agent/skills.ts` (Supabase) | ok |
| **"call_school: Place a phone call to the school … This is a real capability — you CAN call."** | `src/agent/tools.ts:457` (desc), case `:712` | real (env) / demo caveat | Retell if configured; `CallAdapter` rings the parent's line in demo (`src/agent/steps/adapters/call.ts:29`); `index.ts:352` dials `SCHOOL_CALL_NUMBER ?? sender` | **MUST CHANGE** (M9) |
| "get_knowledge: Retrieve the grounded facts Axolotl has researched" | `src/agent/tools.ts:465` | real | Knowledge graph + auto-research (`src/knowledge/graph.ts`) | ok |
| "record_getting / start_initiative" | `src/agent/tools.ts:478`, `:487` | real (env) | `src/integrations/family-memory.ts` (Supabase) | ok |
| "recall_history: Search the ENTIRE conversation history" | `src/agent/tools.ts:496` | real | `InMemoryStore.getHistory` + Supabase conversation store | ok |
| "set_reminder: Set a reminder to MESSAGE THE PARENT at a time" | `src/agent/tools.ts:505` | real (env) | `FollowUpEngine` + `followup-store.ts` | ok |
| "Sent the request to the school." (email step result) | `src/agent/steps/adapters/email.ts:30` | real (env) — demo caveat | Sends to the resolved counterparty; in demo that is `demo-liaison@example.com` | ok (see M4) |
| **"Submitted the form to the school."** (form step result) | `src/agent/steps/adapters/form.ts:49` | **mock** | `FormAdapter` only POSTs to `FORM_ENDPOINT` if set (**unset**), else **emails the raw fields** to the counterparty (or does nothing if no email) and reports success (`src/agent/steps/adapters/form.ts:25-49`) | **MUST CHANGE** (M5) |
| "I called {who} and it's handled." (call step result) | `src/agent/steps/adapters/call.ts:46` | real (env) / **mock fallback** | `MockVoiceProvider` returns `disposition:'resolved'` with fabricated text when Retell is unset (`src/integrations/voice.ts:21-31`) | **MUST CHANGE** (M10) |
| "✅ Submitted — here's the confirmation" | `src/agent/steps/adapters/submit.ts:36` | real (env) | Skyvern Phase B or Stagehand `browserSubmit` (`src/integrations/browser.ts:427`) | ok |
| "Filled and submitted the form / Filled the form (not submitted)." | `src/agent/steps/adapters/browser.ts:60-62` | real (env) | `browserFill` + gated `browserSubmit` | ok |

---

## Claims phrased as real that are actually mock

These are the **MUST CHANGE** items. Each shows the exact current wording and a suggested honest replacement.

### M1 — Parent-portal access (promised, not finished)
- **Wording:** `"🔑 Connect to your parent portal(s) so I can see assignments, forms, and what's available."` — `src/agent/onboarding.ts:146`
- **Why it doesn't hold yet:** the only *finished* connect flow is Gmail OAuth (`src/integrations/web.ts:58`, `src/integrations/gmail.ts`). Nothing reads assignments; `MockSis` (`src/integrations/sis.ts:31`) only reads the in-memory seed DB and is not reachable from the agent. A portal **takeover / live-view** flow was in progress but uncommitted at audit time (`src/integrations/connections/parentPortal.ts`, `src/integrations/connect-stream.ts`, `src/integrations/connections/store.ts`) — and even that is a *parent-drives-the-browser* handoff, not an "I can see your assignments" reader.
- **Suggested:** until a real portal read exists, replace with `"🔑 Connect your email so I can send to the school as you (you approve each message)."` — or say `"…so you can log in and I'll help from there."` rather than implying the agent sees assignments.

### M2 — "Then text you what they said" (call feedback not wired)
- **Wording:** `"📞 Call the office and handle it — then text you what they said. Want to hear it? Just say \"call me.\""` — `src/agent/onboarding.ts:144`
- **Why it's false:** call placement is real, but no Retell webhook route exists (`src/integrations/web.ts`) and `Agent.logCallResult` (`src/agent/agent.ts:492`) is never invoked, so no transcript/outcome ever comes back to the parent.
- **Suggested:** `"📞 Call the office and handle it — I'll place the call and follow up with you on what to do next."` (or implement the Retell `call_analyzed` webhook → `logCallResult`).

### M3 — "It sends from you"
- **Wording:** `"✉️ Email the school or district for you — I draft it, you approve it, it sends from you."` (`src/agent/onboarding.ts:143`) and `"you send it from their connected Gmail via the agent — reliable + from them"` (`src/agent/tools.ts:1130`).
- **Why it's misleading:** "from you" holds only if the parent completed Gmail OAuth. Otherwise the email goes out from Axolotl's own sender via Resend (`src/integrations/email.ts:30`); `EmailAdapter` falls back to the default provider (`src/agent/steps/adapters/email.ts:25`).
- **Suggested:** `"✉️ Email the school for you — I draft it, you approve it, and I send it (from your Gmail if you've connected it, otherwise from Axolotl)."`

### M4 — Demo mode plus "don't announce you're a demo"
- **Wording:** `"Don't announce you're an AI, a demo, or a bot."` — `src/agent/tools.ts:1118`
- **Why it's misleading:** when `AGENT_MODE !== 'live'`, `resolveCounterparty` returns `{ name: 'Demo School Liaison', email: 'demo-liaison@example.com', phone: '+15550001111' }` (`src/agent/agent.ts:784`). The agent then reports `"Sent the request to the school."` (`src/agent/steps/adapters/email.ts:30`) while the instruction forbids revealing it was a demo. Same risk for calls.
- **Suggested:** keep the honesty rule but add an explicit carve-out: `"Never pretend a message/call/form reached the real school if it did not — if a step was a demo or sent to a placeholder, say so plainly."` And either run production with `AGENT_MODE=live` or make demo mode visibly labelled.

### M5 — `FormAdapter` reports "Submitted the form to the school" without submitting
- **Wording:** `` parentSummary: `Submitted the form to ${step.counterparty.name ?? 'the school'}.` `` — `src/agent/steps/adapters/form.ts:49`
- **Why it's false:** with `FORM_ENDPOINT` unset (default), `FormAdapter` does not POST anywhere — it **emails the raw field key/values** to the counterparty (or returns `status:'done'` with no `referenceId` at all if there is no email), then reports the form as submitted (`src/agent/steps/adapters/form.ts:25-49`). This is the path the planner uses for absence / meal / conference steps (`src/agent/steps/planner.ts:22-38`).
- **Suggested:** return `"I sent the form details to {contact} — that's not an official submission; want me to fill the school's real form instead?"` and only say "submitted" when a real endpoint/`referenceId` exists.

### M6 — "The delta between entitled and what they're ACTUALLY receiving"
- **Wording:** `"MISSION … figure out the delta between what {child} is entitled to … and what they're ACTUALLY receiving — then DO the steps to close it."` — `src/agent/tools.ts:1145`
- **Why it's overstated:** the entitlement side is a keyword heuristic over the family profile (`auditEntitlements`, `src/knowledge/entitlements.ts`), and there is **no source of truth for current receipt** — meal status is mock/unavailable, and there is no SIS read. The agent cannot observe that a child is *not* receiving a benefit; it only knows the profile suggests eligibility.
- **Suggested:** `"MISSION … figure out what {child} is likely entitled to but may not be getting — then research it and drive the steps to secure it."`

### M7 — Baseline programs asserted without per-school confirmation
- **Wording:** `"you always have real, generally-available programs to offer as a baseline — California's ELO-P … 21st Century Community Learning Centers … free & reduced-price meals. Present these, then offer to confirm the exact one at the family's school …"` — `src/agent/tools.ts:1101`
- **Why it's overstated:** these are presented even "if live research is thin," so the parent can hear a program name as if it were confirmed at their school. It is general knowledge, not research.
- **Suggested:** keep the baseline but always attribute it: `"Generally available in California (I'd confirm it's offered at your school): ELO-P …"`

### M8 — "Fill perfectly forever after"
- **Wording:** `"This way every form you work once, you fill perfectly forever after."` — `src/agent/tools.ts:1109`
- **Why it's overstated:** the recipe store (`src/integrations/form-recipes.ts`) is a saved field-structure hint; it only helps when Supabase is configured and the form hasn't changed.
- **Suggested:** `"Next time I'll have the form's layout saved, so filling it goes faster."`

### M9 — "You CAN place phone calls" / "Place calls (and leave a voicemail)"
- **Wording:** `"You CAN place phone calls … Never say you can't make calls — you can"` (`src/agent/tools.ts:1127`); `"• Place calls (and leave a voicemail)"` (`src/agent/onboarding.ts:30`); `"call_school: … This is a real capability — you CAN call."` (`src/agent/tools.ts:457`).
- **Why it's conditional:** it is real only when `RETELL_API_KEY` + `RETELL_AGENT_ID` + `RETELL_FROM_NUMBER` are set (`src/integrations/phones.ts:77`). In demo mode `CallAdapter` deliberately rings the **parent's own line** (`src/agent/steps/adapters/call.ts:29`), and `index.ts:352` dials `SCHOOL_CALL_NUMBER ?? sender` — so "calling the school" may not reach the school. "Leave a voicemail" is not a distinct implemented capability.
- **Suggested:** `"I can call the school for you when calling is configured — I'll confirm the number I'm dialing first."` and drop "leave a voicemail" unless implemented.

### M10 — Mock voice provider fabricates a successful call
- **Wording:** `"I called {who} and it's handled. {transcriptSummary}"` — `src/agent/steps/adapters/call.ts:46`, backed by `MockVoiceProvider` returning `disposition:'resolved'` and `"…the office confirmed they'll handle it."` — `src/integrations/voice.ts:21-31`
- **Why it's false:** when Retell is not configured, no call happens at all yet the step reports success with a fabricated outcome.
- **Suggested:** have `MockVoiceProvider` return `disposition:'failed'` (or a clearly-labelled demo outcome) so the parent is never told a call was made when it wasn't. Suggested copy: `"I couldn't place that call — calling isn't configured. I can email the office instead."`

### M11 — "Leave a voicemail"
- **Wording:** `"• Place calls (and leave a voicemail)"` — `src/agent/onboarding.ts:30`
- **Why it's false:** no voicemail-specific capability is implemented; the Retell voice agent conducts a live conversation.
- **Suggested:** `"• Place calls to the school"`.

---

## Capability deep-dives (the specific findings requested)

### 1. Meal status — the agent can **not** see it; it can only help apply/ask (honest)
- **Provider:** `MockMealsProvider` (`src/integrations/meals.ts:23`) — `getStatus` reads an in-memory map defaulting to `'unknown'` (`:28-32`); `submitFreeReducedApplication` / `issueVoucher` return **fabricated** receipts (`:34-54`). Wired at `src/index.ts:89` from the seed DB.
- **Reachability:** the only code that *calls* those methods is `src/tools/meals.ts:18-19`, which explicitly says "Demo only — nothing was actually submitted," and that tool is **unreachable** (`executeTool` in `src/tools/registry.ts` is imported but never called).
- **What the agent says:** honest — `src/agent/tools.ts:1091` ("you CANNOT see a child's meal/benefit status … you can help them APPLY") and `:1097` ("I can't see your status directly").
- **Reality:** `research-only`. The agent can research eligibility and can apply by filling the district's real web form (Skyvern) or emailing the office — but there is **no meal-application submission** through any district system, and **no status read**.
- **Verdict:** `ok` for the honesty; the mock provider must never be reported as a real submission (covered by M5's FormAdapter path).

### 2. Calendar — the agent does **not** read the parent's calendar; reminders are real
- **Provider:** `MockCalendarProvider` (`src/integrations/calendar.ts:29`) — deterministic fake slots; `book` returns a fabricated `EVT-…` id without persisting anything (`:52-58`). No reachable caller (the only caller is the dead `src/tools/schedule.ts`).
- **What the agent says:** honest — `src/agent/tools.ts:1128` ("You CANNOT see the parent's calendar or schedule"), and `set_reminder` genuinely schedules a message (`FollowUpEngine`).
- **Reality:** calendar = `mock` (and unreachable); reminders = `real`.
- **Verdict:** `ok` (the claim is the honest one).

### 3. Call placement — real Retell, but conditional and demo-dials-the-parent
- Real when `RETELL_API_KEY`/`RETELL_AGENT_ID`/`RETELL_FROM_NUMBER` are set (`src/integrations/phones.ts:77`); `index.ts:352` dials `SCHOOL_CALL_NUMBER ?? sender`.
- Falls back to `MockVoiceProvider`, which **fabricates a resolved outcome** (`src/integrations/voice.ts:21-31`).
- No Retell webhook → no transcript feedback (`Agent.logCallResult`, `src/agent/agent.ts:492`, is never called).
- **Verdict:** `MUST CHANGE` (M2, M9, M10).

### 4. Email send — real (Resend/Gmail), consent-gated
- Real `ResendEmailProvider` when `RESEND_API_KEY` + `EMAIL_FROM` are set (`src/integrations/email.ts:76`); real `GmailEmailProvider` when the parent connected Gmail (`src/integrations/gmail.ts:210`). `EmailAdapter` prefers the parent's provider, else the default (`src/agent/steps/adapters/email.ts:25`). Otherwise `MockEmailProvider` logs and returns a fake receipt (`src/integrations/email.ts:67`).
- **Verdict:** `real (env)`; the only truthfulness risk is the "from you" wording and demo-mode recipients (M3, M4).

### 5. Form fill / submit — real and consent-gated (Skyvern + Stagehand), with one mock leak
- **Real:** `skyvern_fill_form` fires an async, fill-only Skyvern task; submit is a **separate** consent-gated step (`src/integrations/skyvern.ts:246`; `SubmitAdapter` at `src/agent/steps/adapters/submit.ts`). Stagehand `browserFill`/`browserSubmit` are real when `BROWSER_BACKEND=stagehand` (`src/integrations/browser.ts:273`, `:427`). The consent gate is code-level (`src/agent/steps/executor.ts:20`).
- **Mock leak:** the planner's `form` channel (`src/agent/steps/planner.ts:22-38`) goes through `FormAdapter`, which does **not** submit a form and yet reports "Submitted the form to the school." (`src/agent/steps/adapters/form.ts:49`) — **M5**.
- **Verdict:** fill/submit `real`; the `FormAdapter` claim `MUST CHANGE`.

### 6. SIS / enrollment-data access — **mock**, and unreachable
- `createSis` **always** returns `new MockSis(db)`; `SIS_PROVIDER` is only logged, not honored (`src/integrations/sis.ts:69-74`). `MockSis` reads the in-memory seed DB (`:36-48`) and records absences in memory only (`:50-56`).
- Wired at `src/index.ts:87` (`createSis(db)`), but no reachable agent tool reads a real SIS. Absence submission lives in the dead `src/tools/attendance.ts`.
- **Verdict:** `mock`. The agent must not claim to see enrollment/attendance records.

### 7. Knowledge / research — **real** (this is the strongest capability)
- `web_search` / `web_fetch` proxy live pages through `r.jina.ai` (`src/agent/tools.ts:716-733`).
- `get_knowledge` / `get_school_info` / `search_school_graph` / `save_evidence` / `save_resource` / `save_procedure` back onto Supabase with in-memory fallback (`src/knowledge/graph.ts`, `src/knowledge/resource-graph.ts`, `src/integrations/evidence-store.ts`, `src/agent/skills.ts`), with auto-research for un-researched districts.
- **Verdict:** `real`. Caveat: the *asserted* baseline programs (M7) and the *inferred* "delta" (M6) come from model knowledge/heuristics, not observed data.

---

## Environment notes (which `real (env)` are actually live)

Capabilities marked `real (env)` depend on credentials. Presence was checked **without reading any values** (local dev machine; production runs on Railway and may differ):

| Var | Local dev | Effect when unset |
|---|---|---|
| `RESEND_API_KEY`, `EMAIL_FROM` | unset | email falls back to `MockEmailProvider` (logs only) |
| `RETELL_API_KEY`, `RETELL_AGENT_ID`, `RETELL_FROM_NUMBER` | **SET** | voice falls back to `MockVoiceProvider` (fabricates success) |
| `BROWSER_BACKEND`, `BROWSERBASE_API_KEY`, `STAGEHAND_*` | unset | all `browser_*`, `account_action`, and Stagehand submit return "browser not configured" |
| `SKYVERN_API_KEY` | **SET** | `skyvern_fill_form` returns "Skyvern isn't configured" |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | **SET** | skills/evidence/graph/memory/follow-ups/recipes/conversations are in-memory only (lost on restart) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | unset | Gmail connect unavailable → email sends from Axolotl, not the parent |
| `SCHOOL_CALL_NUMBER` | **SET** | `index.ts:352` dials the **sender** instead of the school |
| `AGENT_MODE` | unset → **demo** | counterparties become `demo-liaison@example.com` / `+15550001111` (`src/agent/agent.ts:784`) |
| `FORM_ENDPOINT` | unset | the planner's `form` channel only emails fields yet reports "Submitted" (M5) |

---

## Summary of MUST-CHANGE items

| # | Claim | Where | Fix |
|---|---|---|---|
| M1 | "Connect to your parent portal(s) so I can see assignments" | `onboarding.ts:146` | replace — no finished portal read (takeover flow in progress) |
| M2 | "then text you what they said" (call outcome) | `onboarding.ts:144` | soften, or wire the Retell webhook |
| M3 | "it sends from you" / "from their connected Gmail" | `onboarding.ts:143`, `tools.ts:1130` | make it conditional on Gmail being connected |
| M4 | "Don't announce you're … a demo" + demo counterparty | `tools.ts:1118`, `agent.ts:784` | add a no-false-success rule; label demo mode |
| M5 | "Submitted the form to the school." | `steps/adapters/form.ts:49` | only claim submitted with a real endpoint/reference |
| M6 | "what they're ACTUALLY receiving" | `tools.ts:1145` | reframe as likely-eligible, not observed |
| M7 | baseline programs stated as available | `tools.ts:1101` | attribute as general, offer to confirm |
| M8 | "fill perfectly forever after" | `tools.ts:1109` | soften to "layout saved" |
| M9 | "You CAN place phone calls" / "leave a voicemail" | `tools.ts:1127`, `onboarding.ts:30`, `tools.ts:457` | condition on configuration; drop voicemail |
| M10 | "I called {who} and it's handled." (mock fallback) | `steps/adapters/call.ts:46`, `voice.ts:21` | mock must report failure, never fabricated success |
| M11 | "leave a voicemail" | `onboarding.ts:30` | drop unless implemented |

**The strongest, honest part of the product** is research (`web_search`/`web_fetch`/knowledge graph) plus the **code-level consent gate** — those are real. **The most urgent fixes** are the four that can tell a parent a real school was contacted when it wasn't: **M1** (portal access that doesn't exist), **M2** (call outcomes that never return), **M4** (demo mode reported as real) and **M5** (form "submitted" when only emailed).

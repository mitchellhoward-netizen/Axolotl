# Release plan — the school agent, for parents

**Scope:** the school agent only. The benefits/life-work layer is parked (`BENNY_IMESSAGE_ENABLED=false`)
and is not part of this release. Nothing here is about monetisation.

**Definition of "the full promise"** — what a parent must be able to do on day one, unaided:

1. Text the number, prove the phone, and be onboarded in English or Spanish.
2. Ask anything about their child's school and get a researched, grounded answer.
3. **Forward a school email and have it triaged into one short list of real work** (the core bet).
4. Say "do 1" and have that become a real action — an email sent, a form filled, a reminder set —
   with nothing happening without an explicit yes.
5. Have a form filled by a real browser, reviewed, approved, and **confirmed by the school's own
   reference number** — never told "done" on anything less.
6. Report an absence, and get told plainly what the agent cannot do.
7. Delete everything, and have that be true.

---

## A. What an agent can finish (this plan)

| # | Workstream | Owner | Why it blocks |
|---|---|---|---|
| **1** | **Email forwarding live** — per-family inbound address issued during onboarding; the inbound worker → `/webhooks/inbound-email` path documented and wired; `INBOUND_DOMAIN` + `INBOUND_WEBHOOK_SECRET` set | Agent A | **The core promise has no production trigger.** Triage is proven in a harness and unreachable by a real parent |
| **2** | **Consent residual** — a bare change request ("change the last name to Howard") applies the change, keeps the step staged, re-confirms; never discards staged work | Agent B | The review message invites "tell me what to change", and today that path throws the work away |
| **3** | **Failure UX** — when a fill fails or times out, the parent gets a specific reason and a concrete next step, with a bounded retry; never a stall, never a vague "snag" | Agent B | The real thread stalled with "One moment" three times |
| **4** | **Action-layer authorization** — code-level control on every consequential action: recipient must come from our own records, never from message content; domain allowlist for browser work; irreversible verbs gated; page/email text can never choose a URL or a recipient | Agent C | The [ABC] conjunction is the one risk a prompt cannot close |
| **5** | **Retention made true** — the schedule we published is enforced by a pruning job (messages 90d, triaged email 60d), and deletion stays complete | Agent D | We published a retention policy; without the job it is a false claim |
| **6** | **Review links survive a deploy** — persist the token→artifact mapping (today it is in-memory, so a redeploy breaks a live link) | Agent D | A parent taps a link and gets "expired" for no reason |
| **7** | **Pilot guardrails on by default** — `AGENT_ALLOWLIST` populated, test world off, per-sender caps verified, cost ceiling per family | Agent D | An open line with paid browser sessions is an abuse and cost hole |
| **8** | **Onboarding captures a mailing address** — required by the health-breach rule, which cannot be satisfied over iMessage | Agent D | Can't be back-filled after an incident |
| **9** | **Public trust surface** — a security page that says only true things, `security.txt` + a vulnerability-disclosure policy with safe-harbour language, and pre-filled K-12CVAT/HECVAT answers | Agent E | Every reviewer asks; essentially no competitor has a VDP |

**File ownership is exclusive** (see §D). An agent touches only its own files; anything else is a
message to the coordinator, not an edit.

## B. What no agent can do (the human's list — do not let this be implied as done)

These are release gates and they are not engineering:

1. **Sign DPAs** with Anthropic, OpenAI, Skyvern, Browserbase, Supabase, Retell, Resend, Tavily.
   Anthropic's DPA **Schedule 1 declares "None" for special categories**, which is wrong for
   IEP/health-adjacent content — amend it or keep that content out of the API.
2. **HIPAA risk analysis** before any benefits-adjacent work. 45 CFR 160.103 enumerates "benefit
   management", so plan-sourced PHI makes us a business associate by default. Cheapest high-value
   item in the whole file.
3. **Insurance**: ~$2M cyber (in force through the term and ≥1 year after), $1M/$3M E&O, CGL. Read
   the AI and wrongful-collection exclusions, not just the premium.
4. **Access hygiene** — MFA on everything, dated quarterly access reviews, same-day offboarding
   revocation, backup segregation from production. These are the three failures behind a $5.1M
   edtech settlement, and **SOC 2 evidence cannot be back-filled**.
5. **Counsel**: whether a parent can exercise a child's CCPA rights; the under-16 sensitive-PI
   question; whether CMIA's contractor provision reaches us.
6. **A decision on the line's openness** — see C.4.

## C. Launch configuration (set at go-live, by the human)

1. `AGENT_ALLOWLIST` = the pilot numbers (until then the line is open to anyone).
2. `TESTWORLD_ENABLED=false` — the fake district must not be on the public host at launch.
3. `INBOUND_WEBHOOK_SECRET` set, and the worker pointed at `/webhooks/inbound-email`.
4. `REQUIRE_VERIFICATION` stays on (phone ownership proven before anything else).

## D. Verification protocol (the coordinator does this; agents do not push)

Each agent: run `npm run typecheck` and **its own** focused tests, commit **only its own files**,
and report the SHA. Agents never `git push`, never `git checkout`, never edit another's files.
The coordinator then, per workstream: reads the diff, runs the full suite, checks that no consent or
honesty guarantee weakened, and pushes only then. A green suite is necessary and not sufficient on
the consent and authorization paths.

## E. Release checklist (all must be true)

- [ ] A parent can forward a real school email and get one list of real work
- [ ] "do 1" → a real action, consent-gated, with the school's own confirmation
- [ ] Nothing executes without an explicit yes; an amendment never destroys staged work
- [ ] No claim of work without evidence (fill, submit, send, call)
- [ ] Page and email content can never choose a recipient, a URL, or an action
- [ ] Deletion is complete and verifiable; retention is enforced, not just published
- [ ] No child PII in logs; no secrets in the repo; webhooks fail closed and reject replays
- [ ] The published privacy policy matches the system exactly
- [ ] Failure is honest and specific, with a next step, every time
- [ ] Full suite green; typecheck clean; deployed and verified on the live line

## F. Order of work

**Wave 1 (now):** 1 (email), 4 (authorization), 5–8 (hardening), 9 (trust surface).
**Wave 2 (after wave 1 lands):** 2 (consent residual), 3 (failure UX) — they touch the same file as
the consent work just shipped, so they go second to avoid conflicts.
**Then:** live re-test of the whole promise on the real line, with a real forwarded email.

---

## G. Wave 3 — reliability, measured (added after pushback on the "1 in 3" figure)

The 1-in-3 number is the **cold-start** figure: a general agent dropped on an unfamiliar site and told
to accomplish a broad task, with no preparation and no memory. Two independent 2026 benchmarks on live
production sites put the best frontier models there (ClawBench 33.3%, HealthAdminBench 36.3% end-to-end
against 82.8% *subtask* success). That is the number a benchmark measures. **It is not the number our
product has to live with**, because we control three things those agents do not:

1. **We choose the URL, once.** We can resolve the exact form for a (school, program) at provisioning
   time and store it. That removes the entire "agent searched the site and filled the wrong page" class
   — which is precisely the failure we hit.
2. **The same forms come back.** A family deals with the same handful of forms year after year, and a
   school's enrollment form is the same form for everyone. Repetition is exactly what workflow
   compilation is for, and **we already own the mechanism and do not use it.**
3. **Our task is narrow.** "Fill these fields on this form with this child's known values, and stop
   before submitting" is nothing like "book me a trip." Compounding is the enemy, and a narrow task has
   far fewer steps to compound.

### The three numbers, kept distinct

| Scenario | Realistic target | Basis |
|---|---|---|
| **Cold**, first attempt on a novel multi-page form | **~1 in 3** | The benchmark figure. Design for it; never pretend otherwise |
| **Warm**, the same form again, compiled to deterministic replay | **>90%** | Skyvern `run_with: "code"` replays with zero LLM and zero screenshots, falling back to the agent on drift; Stagehand's cache is a 10–100x speedup on repeats. The mechanism is proven; we are not using it |
| **The product number** — does the parent get a correct outcome or an honest handoff? | **~100% by design** | "I filled it but could not confirm it went through, here is the link" is the product *working*, not failing. We already verify confirmations and refuse to claim unconfirmed work |

### The levers, in order of impact

1. **Compile every recurring flow** (`run_with: "code"`) with agent fallback. Biggest win available, and
   the machinery exists. This is what turns 36% into >90%.
2. **Resolve and store the exact form URL** per (school, program) so nothing is ever searched for twice.
3. **Persist the field mapping** after one successful fill (the repo has `form-recipes.ts`), so the
   second run is a deterministic field-by-field fill rather than a model deciding.
4. **Pre-flight the form against the recipe** (cheap HTML check) before spending a browser session.
5. **Smaller named steps** instead of one long free-form prompt: the SDK's `extract_form_fields` /
   `fill_form` primitives, or per-step blocks.
6. **Branch on the error code** we now get (`no_form` = wrong URL, `signin_required` = hand off,
   `captcha_blocked` = different route, `validation_error` = fix the field) instead of a generic retry.
7. **Verify the values, not just the reference** — compare what was submitted against what the parent
   approved.
8. **Measure it.** `scripts/rehearse-world.ts` plus the test world already run a scenario against real
   Skyvern. Turn it into an eval: the same form run N times, reporting **first-attempt** and
   **repeat-attempt** success separately, with submissions intercepted. Numeric acceptance for the
   release: warm-path success >90% on our own top forms, and **zero** false "submitted" claims at any
   success rate. Publish both numbers honestly.

The measure-first rule stands: the same eye that read "16 emails became 9 tasks" and found the iframe
false negative should be pointed at reliability before we optimise anything else.

## Verified against the live database before onboarding parents

`memory_alias` does **not** exist in production. A non-head select returns
`PGRST205: Could not find the table 'public.memory_alias' in the schema cache`. A `head: true`
count against the same table returns `error.code = none, count = null`, which is how one reviewer
concluded the table existed. A head request hides the schema-cache error, so a head count is never
evidence that a table exists.

Consequences, checked rather than assumed:

- **Alias recall is inert.** Every harvested alias is dropped into a warning, so a parent's own
  word for something will not find their own earlier message. Recall itself still works; it loses
  only alias expansion.
- **Deletion is unaffected.** `deleteFamilyData` swallows a per-table error into a warning
  (`identity.ts`, the `count` helper) and continues, so a missing table cannot fail a deletion
  request. It does mean the receipt omits the table rather than reporting zero for it.

Apply `db/APPLY-NOW.sql` BLOCK 5 (create + RLS), confirm with BLOCK 6, or check read-only with
`npx tsx scripts/probe-memory-alias.ts`.

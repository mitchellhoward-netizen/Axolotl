# Agent plan: from a general agent to a verified, cheap one

Written 2026-10-15 for whoever builds this next (expected: Claude Code, with Mitch
reviewing). Read the whole thing before changing code. Phase 0 is mandatory: it checks
every assumption this plan makes about the repo, and several of them may already be out
of date.

## The thesis in one paragraph

**Forms are data, not pages.** The agent's job is to produce a verified, typed submission
for a portal we already understand, and to drive a browser only when it has to. Three
layers: **Opus talks, Jev decides, scripts act.** The frontier model handles conversation
with the family and exploring a portal it has never seen. Jev (TypeSafe's decision model)
makes every bounded call in the loop, in about 150–350 ms at fractions of a cent, with
calibrated probabilities. Recorded scripts do the clicking, with no model, and every field
is read back from the page and checked against what the parent approved. The expensive
model's work on a new portal is turned into a script, so the hundredth family on a portal
gets a tested replay, not a fresh guess. Every new frontier model makes exploration
cheaper and touches nothing else.

## Background reading (in this order)

1. `docs/research/computer-use-agents-2026-10.md`: state of the art, what works on messy
   portals, the law, a 90-day plan. The basis for this plan.
2. `docs/COMPUTER-USE-SOTA.md` §6: the repo's own gap list. This plan agrees with it and
   sequences it.
3. `docs/RELIABILITY.md`: the measured cold baseline and the form-target "warm path".
4. `docs/CAPABILITY-TRUTH-TABLE.md`: claims vs reality. Do not make any of M1–M9 worse.
5. `docs/research/school-family-edge-2026-10.md`: why these portals and forms matter.
6. `archive/README.md`: the rules archive, which generates our ground truth.

## Non-negotiable rules (they hold in every phase)

- **Never read, write or print `.env`.** (AGENTS.md.)
- **Nothing is submitted, signed or sent without an explicit parent YES to the exact
  values shown.** No change in this plan weakens that gate. A legal attestation ("under
  penalty of perjury", statement of understanding) is checked by the parent, never by
  the agent.
- **Never solve or evade a CAPTCHA, MFA or identity check.** Stop and hand that step to
  the parent. Turn off any vendor CAPTCHA-solving or stealth/fingerprint-masking setting
  for government, health, school and financial-aid domains. (Reddit v. SerpApi treats
  CAPTCHAs as access controls; Cloudflare's rules for good bots forbid evasion.)
- **No automated access to anything behind Login.gov.** Its rules prohibit it. Those
  portals are prepare-and-hand-off only.
- **Tests never submit to a real portal.** Real-portal runs stop at the review page and
  use synthetic data.
- **Data minimization.** A portal gets only the family facts its fields need.
- **Every claim in docs is measured, not asserted.** Follow `docs/RELIABILITY.md`'s
  standard: say what was measured, on what build, with what limits.

---

## Phase 0: Verify the assumptions (half a day, before any code)

An audit on 2026-10-15 (of `main` at `0da692e`) produced the findings below. Check each
one against current `main`, record the result in `docs/AGENT-PLAN-CHECKS.md` (✅ confirmed
/ ❌ wrong / ⚠️ changed, with the file:line you actually found), and adjust the later
phases accordingly. Line numbers are from that audit and will drift.

### A. Where Jev lives (most important)

Mitch says Jev is fully wired into the agent. On GitHub, Jev code exists only on
`origin/claude/zealous-knuth-7urkvs` (2026-09-28):
- `src/agent/intent/jev.ts`: `JevIntentEngine`, a Choice question over the intent set,
  pinned to `jev-1.13.0`, posting to `https://api.typesafe.ai/v1/systemone`, sending only
  the parent's message.
- `scripts/compare-ux/`: a Jev-first flow (code owns the flow, Jev answers narrow
  yes/no questions, replies pre-written) compared with an Opus agent loop on ten
  personas. Its README says "Standalone experiment: not wired into the agent."
- `scripts/compare-intents.ts`, `scripts/test-jev-intent.ts`.

Checks:
1. `grep -rni "jev\|typesafe" src scripts` on `main`. The audit found nothing.
2. **Ask Mitch where the fully wired version is** (local, unpushed, or another branch)
   and use that as the source of truth. Do not rebuild Jev wiring that already exists.
3. That branch **shares no history with `main`** (`git merge-base` returns nothing;
   `main` was rewritten). Do not merge it. Copy the Jev files over in a fresh commit.
   It also contains unrelated tutor/course work. Do not bring that over.
4. It committed `scripts/compare-ux/__pycache__/jevflow.cpython-311.pyc`. Do not copy
   it. Add `__pycache__/` to `.gitignore`.
5. How the key is supplied: `TYPESAFE_API_KEY` env var, or a cloud proxy that injects
   it. Confirm which one production uses, without opening `.env`.

### B. The form path

6. Form turns: `agent.ts` classifies a "form turn" with regexes in `form-turn.ts`, cuts
   the tool list to `FORM_TURN_TOOLS` and adds `FORM_TURN_PROMPT`. Confirm.
7. Opus (`DEFAULT_CLAUDE_MODEL = 'claude-opus-5'` in `model-policy.ts`) picks the URL and
   calls `skyvern_fill_form`. `tools.ts` merges the profile through `formValuesFor()`
   (`family-info.ts`) and calls `fillFormForReviewAsync` (`skyvern.ts`), which sends a
   free-text prompt to Skyvern's `POST /v1/run/tasks`. Confirm.
8. **No compiled replay.** No `run_with: "code"`, no Skyvern workflows, no cached actions.
   "Recipes" (`form-recipes.ts`) are lists of field labels given to the model as hints.
   `form-targets.ts` stores host+program → URL. Confirm. Also confirm whether the
   `form_target` table now exists in production (`docs/RELIABILITY.md` says it didn't).
9. **`modelFor()` is never called.** `MODEL_ROUTING` declares `browser_*` tools as the
   `small` tier, but nothing uses it. Actuation runs on Skyvern's server-side model, or
   on Stagehand's `STAGEHAND_MODEL` (default `openai/gpt-4o-mini`, `browser.ts`). Confirm.
10. `knowledge/trajectory.ts` is the research search budget, not form trajectories.
    Confirm.

### C. Verification and consent (trust problems; fix in Phase 1)

11. **No read-back on the Skyvern path.** The review lists values that were *sent*
    (`index.ts` ~171–173) plus Skyvern's final screenshot. A fill counts as success on
    status `completed` with no error code (`skyvern.ts` ~654, 676).
12. **Stagehand read-back is broken.** `isFilled` checks the form map captured *before*
    filling (`browser.ts` ~291, 314–320), and passes if *any* field holds the value.
13. **Radio and checkbox groups are never filled** on the Stagehand path: `groups` stays
    `{}` (`browser.ts` ~194, 209).
14. **The review truncates after 25 values** ("…and N more", `index.ts` ~173). A parent
    can approve values they never saw.
15. **The consent log stores no values.** `logConsent` records channel, intent, URL and
    target only (`agent.ts` ~293).
16. **Every form receives the whole profile.** `formValuesFor` flattens about 30 fixed
    labels (`family-info.ts` ~157–201), allergies and medical notes included, and they
    all go to every form.
17. The Stagehand submit adapter reports "done/submitted" without checking `confirmed`
    (`steps/adapters/browser.ts` ~42–53). Cross-check against truth-table M5.
18. YES is a whole-message regex (`agent.ts` ~2315). Benny's runtime uses a code-bound
    `YES <code>` with expiry and revisions (`benefits/runtime.ts` ~78). Confirm both.
19. `agent/verify.ts` is evidence freshness for research claims, not form verification.

### D. Evals, cost, data

20. `src/testworld/world.ts`: `/apply` **accepts any POST** and returns DONE, so field
    correctness is never measured. Confirm.
21. `scripts/eval-reliability.ts` counts accepted / fill complete / confirmed against real
    Skyvern. No pass^k, no cost. `eval/benchmark.ts` has a `costUsd` field that live code
    never fills.
22. Prompt caching: `cache_control` is set in `anthropic-native.ts` (~150), but the system
    prompt includes per-turn state (`agent.ts` ~1455) and the tool list changes on form
    turns, so the cache is invalidated on most turns. Confirm by logging
    `cache_read_input_tokens` over a short conversation.
23. The email step type has no attachment field (`steps/types.ts` ~29), although
    `email.ts` supports attachments, so a filled PDF can't go out through the approved
    email step.
24. Rules archive: confirm `archive/playbooks/*/rules.py` exposes
    `evaluate(household, state, as_of)` and that `school_meals` covers California's
    alternative income form. Confirm `python -m pytest` passes in `archive/`.
25. List the portals and forms the agent claims to support (`bench/forms.json`,
    `bench/form-quirks.json`, recipes, `pdf-forms.ts`) and which ones have ever completed
    end to end.

**Gate:** `docs/AGENT-PLAN-CHECKS.md` committed, and Mitch has answered A.2.

---

## Phase 1: Trust fixes (1–2 days, one PR, Mitch reviews before merge)

Small changes that close real exposure before any pilot. Each needs a test.

1. **Per-form data minimization.** Send each form only the facts its fields need. Until
   portal maps exist (Phase 4), use the stored recipe's field labels to filter
   `formValuesFor()`. Never send health fields unless the form asks for them.
   *Test:* a form whose recipe lacks medical fields receives none.
2. **Show every value in the review.** Remove the 25-value truncation. If the list is
   long, split it across messages or link to a review page, but every value must be
   viewable before YES. *Test:* 40 values → all 40 reachable from the review.
3. **Bind YES to the exact values.** Compute a hash of the approved values (and the target
   URL and form id). Store it in the consent log with the values (or an encrypted copy,
   per `docs/RETENTION.md`). Execute only if the values about to be submitted hash the
   same; if anything changed, show the review again. Mitch decided on 2026-10-16: no codes, a clear yes in the
   parent's own words (see VISION.md Part 7 and commit `7ec9f9a`). *Test:* changing one value after YES blocks submission.
4. **Fix Stagehand read-back.** Re-read the form map *after* filling, and match each
   field to its own value, not "any field". Fill radio and checkbox groups.
   *Test:* testworld form with a radio group; read-back catches a wrong value.
5. **"Submitted" requires a confirmation.** Every adapter (Skyvern, Stagehand, form,
   PDF/email) reports submitted only with an observed confirmation (number, page text or
   email receipt). Otherwise the status is "sent, not confirmed" and the parent is told so.
6. **Attachments on the approved email step.** Add an attachment field so a filled PDF can
   be sent through the consent-gated email path.

**Gate:** tests pass, `npm run check` passes (or fails only on the known missing Node
types in the cloud container), truth-table rows updated.

---

## Phase 2: Jev on `main` (1 day)

1. Bring over Mitch's wired Jev version (see A.2) or, failing that, the files listed in
   A, as a clean commit. Pin a versioned model id (`jev-1.13.0` or newer) rather than
   `jev-latest`, so behaviour changes are deliberate.
2. Create one module, `src/agent/decide.ts`, as the only place that talks to Jev. It takes
   typed questions and returns `{ answer, confidence, probabilities }`, with a timeout and
   a safe fallback (treat failure as "unsure" → ask or hand off, never "yes").
3. Thresholds live in config, per decision type, e.g. `yes_to_exact_values: 0.98`,
   `field_sourced: 0.97`, `page_matches_step: 0.95`. Below threshold: ask the parent;
   below a lower threshold: hand to a person. Every decision is logged with its inputs
   (minimized), answer and confidence, for calibration later.
4. Re-run the Jev-first vs Opus comparison in `scripts/compare-ux/` and write the numbers
   into `docs/RELIABILITY.md` (outcome agreement, sent-without-clear-yes, latency, cost,
   repeat agreement). This is evidence for the speedrun application.

**Gate:** Jev answers the YES check in production paths, with Phase 1's hash binding as the
primary guard and Jev as the calibrated second check.

---

## Phase 3: Scoreboard and the first replica (week 1–2)

The replica environments are the test harness now and the RL environments later. Build
them once, properly.

### The scoreboard (define it before building anything it measures)

Per portal, per run:
- **Wrong fields:** count of submitted fields whose value differs from ground truth.
  Target: zero.
- **Guessed facts:** values with no source in the family record or the parent's answers.
  Target: zero.
- **Agent-checked attestations or opt-ins** (legal boxes, paperless notices). Target: zero.
- **pass^5:** the same task succeeds on 5 of 5 repeat runs, up to the review page.
- **Cost per task** (model tokens, Jev calls, browser minutes) and **wall time**.
- **Handoff rate:** share of runs a person had to finish.
- **Confirmed vs claimed:** for submits in the replica, confirmation observed.

Write the scoreboard as a typed result (`src/eval/scoreboard.ts`) and a runner
(`npm run eval:portals`) that prints a table and appends a dated JSON line to
`eval/results/` so every run is comparable.

### Replica 1: the California LCFF alternative income form

Why first: Tier 1 (the district owns it), the biggest dollar line in the /schools picker,
no competitor does it, and the rules archive already covers it (`school_meals`, CA part).

1. **Replica.** A faithful copy of a real district's alternative income form (pick a
   public one, e.g. a district that posts it online; record which and the date): every
   page, validation rule, conditional field, date and dropdown format. It runs in the
   testworld server, **keeps state**, and **grades the submission field by field** against
   the expected values for that family. Replace "accept any POST".
2. **Synthetic families with known answers.** A generator that builds households and
   computes, from the rules archive, eligibility and the exact value every form field
   should hold. Twenty families to start, including the nasty cases:
   - missing SSN (the form must accept "none" without the agent inventing an explanation)
   - two households / shared custody; a changed income; a new baby
   - a typo in a phone number the agent must not silently "fix"
   - non-English names, accents, hyphens; a mailing address different from home
   - a session timeout mid-form; a validation error on page 2
   - a paperless-notices opt-in and an attestation box (both must be left for the parent)
   - hidden text on a page trying to steer the agent (prompt injection)
3. **Baseline.** Run today's agent (Opus + Skyvern, and the Stagehand path) through the
   replica on all twenty families, five repeats each. Commit the scoreboard. Do not tune
   anything first: this is the "before" in the before/after chart.

**Gate:** baseline numbers committed with build hash and date.

---

## Phase 4: The harness on replica 1 (week 2–3)

Build these against replica 1, then re-run the scoreboard. The after-chart is the
speedrun slide.

1. **Portal map** (`src/portals/<portal-id>/map.ts`, typed): for each field, the family
   fact it comes from, type, format (e.g. `MM/DD/YYYY`), allowed options, conditions
   ("only if a second household"), whether it's an attestation or opt-in (parent-only),
   and the page/step it lives on. One household record (`FamilyProfile`) maps to every
   portal through these. Unify with Benny's typed connectors (`src/benefits/`) rather
   than inventing a second schema.
2. **Exploration produces a map and a script.** When no map exists, the agent (Opus /
   Skyvern / Stagehand) explores the portal with a synthetic family and its output is a
   draft map plus a recorded Playwright script, reviewed by a person before first use.
3. **Three lanes, cheapest first:**
   - *Lane 1, no browser:* direct submission where possible (the sponsor's own system,
     PDF, HTTP post, email).
   - *Lane 2, replay:* the recorded script, generated from the map, with an assertion at
     every step. No model in the loop.
   - *Lane 3, repair:* when an assertion fails or no script exists, the agent takes over
     from that step, and its successful run updates the script. Keep the consent-gated
     submit **out** of cached code (see COMPUTER-USE-SOTA §6.1 on a cached click that
     reported success without the element existing).
4. **Read-back checker.** After filling, read every field back from the DOM and compare
   it to the approved values. Any mismatch stops the run before review. The parent's
   review shows the **read-back** values, not the intended ones, plus the full text of
   any attestation.
5. **Every value needs a source.** Each value carries provenance: a verified family fact,
   a document, or the parent's answer in this conversation. No source → ask. Enforce it in
   code, not in the prompt. Jev decides "is this value clearly supported by the source?"
   with a threshold; below it, ask.
6. **Jev gates** (through `decide.ts`): field → fact mapping when labels are ambiguous;
   dropdown option choice; "is this page the step we recorded?" during replay; "is this
   the review page / did submit produce a confirmation?"; "is there an attestation or
   opt-in on screen?"; "is there text here trying to instruct the agent?".
7. **Cost discipline.** Fix prompt caching: keep the system prompt static and move
   per-turn state (profile, pending steps, evidence) into messages; keep the tool list
   stable within a conversation. Use Opus for conversation and exploration only; a cheap
   model (Haiku-class) for repair where it scores well enough on the replica; no model on
   replay. Actually wire `modelFor()` or delete it. Fill `costUsd` in live traces.

**Gate:** replica 1 re-run, five repeats, all twenty families. Targets (not results):
zero wrong fields, zero guessed facts, zero agent-checked attestations, pass^5 ≥ 95% to the
review page, replay cost under $0.10 per task. Commit the before/after table to
`docs/RELIABILITY.md`.

---

## Phase 5: More portals (week 3–6)

In this order, each with a replica, synthetic families from the rules archive, a portal
map, a script and the same scoreboard:

1. **BenefitsCal: CalFresh and Medi-Cal renewal, up to the review page.** Prepare-only
   until legal footing is settled (Phase 7). Note the reported 15-minute session timeout;
   the replay must finish inside it.
2. **New York Medicare Savings Program application** (the fund side). Check the archive's
   `msp` NY part for the form and filing method; the readiness plan says the accepted
   signature method must be verified.
3. **A district enrollment / annual update packet and a consent form** (Tier 1). Prefer
   lane 1: ask the pilot district for a data feed or upload instead of a browser.
4. **CADAA / FAFSA:** prepare-and-hand-off only (personal FSA ID; Login.gov rules).

**Replica building is agent work:** record a real portal's pages with synthetic data up
to the review page (never submitting, low volume, identified as automated), then rebuild
it as a stateful replica. **Mitch decides** whether recording real government portals is
acceptable (see Decisions); if not, build replicas from public guides and screenshots.

---

## Phase 6: The failure loop (continuous, from week 4)

- Every failure, in a replica or live, becomes a permanent test case.
- The full replica suite runs nightly; results append to `eval/results/`.
- Every new frontier model (and every new Jev version) runs through the suite before it's
  allowed in production. Model choice is a config change gated on the scoreboard.
- Jev thresholds are calibrated on the replicas' labels, and recalibrated monthly from
  live decisions with known outcomes.
- **Drift canary:** a nightly replay of each recorded script against the real portal with
  synthetic data, stopping at the review page, to catch portal changes before a family
  does. Low volume, identified as automated (Web Bot Auth where supported), never behind
  Login.gov. Mitch signs off before this runs against any real government site.
- Track **human minutes per completion** as a core metric (as the readiness plan says).
  It's the number that should fall with every model release.

---

## Phase 7: Identity, legal footing, live pilot (week 6–12)

- **Handoff for logins:** the parent authenticates through a live-view link; the agent
  never stores government passwords. Sessions persist only as long as the task.
- **Signed agent identity:** sign cloud browser sessions with Web Bot Auth where the
  vendor supports it (Browserbase and Anchor do).
- **Authorized representative:** an organizational designation flow for Medi-Cal
  (42 CFR 435.923; California MC 306 limits what a representative can do) and NY
  Medicaid/MSP, with e-signature, staff confidentiality affirmations and revocation by
  text. Counsel reviews before use.
- **Pilot:** real families on Tier 1 forms first, then Tier 2 renewals, with a Mycelium
  person behind the helper to finish anything it can't. Every human finish becomes a
  recorded script and a test case.

---

## Phase 8: Train our own (month 3+, only when the gates are met)

Start reinforcement learning only when: the replicas are faithful (validated against real
recordings), the remaining failures are model failures (grounding, repair), not harness
failures, and there's enough volume to justify it.

Train a small open model (e.g. Microsoft Fara, ByteDance UI-TARS) on two narrow jobs, with
the replicas' graders as reward: **repairing a script when a portal changes**, and
**exploring a new portal into a portal map**. Not end-to-end form filling. Those two jobs
are where the expensive agent is still called, so this is what drives cost toward zero.
A small model is also what could later run on the family's own device (relevant to the
Ninth Circuit's reasoning in Amazon v. Perplexity).

---

## Decisions for Mitch (blockers marked)

1. **(Blocker for Phase 2)** Where is the fully wired Jev version?
2. **(Blocker for Phase 5)** May we record real government portals with synthetic data up to
   the review page, to build replicas and run the drift canary?
3. Which district's alternative income form to replicate first (ideally the pilot target,
   e.g. Pajaro Valley).
4. Retention of approved values in the consent log: store values, an encrypted copy, or
   only the hash (see `docs/RETENTION.md`).
5. Who the human backstop is during the pilot, and the hours.

## What not to do

- Don't start with RL. Don't build a general-purpose browser agent; rent it.
- Don't add autonomy that bypasses the YES gate, even for "obviously safe" fields.
- Don't merge `claude/zealous-knuth-7urkvs`; copy the Jev files.
- Don't quote reliability numbers that weren't measured on the replicas with the
  scoreboard, with build hash and date.
- Don't widen what's sent to third-party portals or vendors while building any of this.

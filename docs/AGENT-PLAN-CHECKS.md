# Agent plan, Phase 0: assumption checks

Checks the 25 assumptions in [`AGENT-PLAN.md`](AGENT-PLAN.md) against `main` at
`892386f` (2026-10-16). The plan's audit was of `0da692e`; the only commit between
the two adds the plan itself, so line numbers mostly still match.

Legend: ✅ confirmed · ❌ wrong · ⚠️ changed or partly right · ❓ not verifiable from
this container (needs production access or a live key; `.env` was not opened).

## Decisions answered by Mitch (2026-10-16)

| # | Question | Answer |
|---|---|---|
| 1 (A.2) | Where is the fully wired Jev version? | `origin/claude/zealous-knuth-7urkvs` is the source of truth. There is no other copy. |
| A.5 | How production supplies the Jev key | `TYPESAFE_API_KEY` env var. (Cloud Claude Code sessions instead get it injected by the proxy for `api.typesafe.ai`.) |
| 4 | What the consent log keeps for approved values | **Plain values + hash.** `docs/RETENTION.md` needs a matching entry in Phase 1. |
| 2, 3, 5 | Recording real portals; which district's form; pilot backstop | Still open. 2 blocks Phase 5. |

## A. Where Jev lives

| # | Status | Finding |
|---|---|---|
| 1 | ✅ | `git grep -il "jev\|typesafe" -- src scripts` on `main`: no matches. Searched every remote branch: only `origin/claude/zealous-knuth-7urkvs` (2026-09-28) has Jev code, in 8 files: `src/agent/intent/jev.ts`, `scripts/compare-intents.ts`, `scripts/test-jev-intent.ts`, `scripts/compare-ux/{README.md,jevflow.py,llmflow.ts,llmflow_cli.py}` (+ `personas.json`), and the `.pyc`. |
| 2 | ⚠️ | Answered: that branch is the source. But it is **not wired into the agent**: nothing in `src/` imports `JevIntentEngine`; it is used only by `scripts/compare-intents.ts:150-151` behind `TYPESAFE_API_KEY`, and `scripts/compare-ux/README.md:14` says "Standalone experiment: not wired". Phase 2 is build work, not a port. |
| 3 | ❌ | The branch **does** share history with `main`: `git merge-base main origin/claude/zealous-knuth-7urkvs` = `eb7764c` (2026-09-25, "Merge pull request #8"), an ancestor of `main`. The branch is exactly 3 commits past it (`3f8ba88`, `3756841`, `7635b6a`), touching only the 10 Jev files and two `package.json` scripts (`test:jev`, `compare:intents`). **No tutor/course work is in those 3 commits** (that came in via #8 and is already on `main`). The plan's "copy, don't merge" still works; copying those files is now low-risk. |
| 4 | ✅ | `scripts/compare-ux/__pycache__/jevflow.cpython-311.pyc` is committed on the branch. `.gitignore` on `main` has no `__pycache__/` entry. |
| 5 | ✅ (answered) | Env var `TYPESAFE_API_KEY` (read in `scripts/compare-intents.ts:150`). Also: the engine defaults to **`jev-latest`**, not a pinned version (`jev.ts:76`; asserted in `test-jev-intent.ts:18`). `jev-1.13.0` appears only as a test fixture (`test-jev-intent.ts:27`). Phase 2 must pin it. |

## B. The form path

| # | Status | Finding |
|---|---|---|
| 6 | ✅ | `isFormTurn` is regexes (`form-turn.ts:13-20`); `agent.ts:1447` sets `formTurn`, `agent.ts:1457` appends `FORM_TURN_PROMPT`, `agent.ts:1463-1464` cuts tools to `FORM_TURN_TOOLS`. Only when `skyvernEnabled()`. |
| 7 | ✅ | `DEFAULT_CLAUDE_MODEL = 'claude-opus-5'` (`model-policy.ts:34`). `skyvern_fill_form` (`tools.ts:958`) merges `formValuesFor()` (`family-info.ts:157`) with the model's values (`tools.ts:971-978`) and calls `fillFormForReviewAsync` (`skyvern.ts:511`), which posts to `/v1/run/tasks` (`skyvern.ts:562`). |
| 8 | ✅ / ❓ | No `run_with`, no Skyvern workflow or cached code in `skyvern.ts`. Recipes (`form-recipes.ts:11-30`) are field labels/controls/selects returned as text by `get_form_recipe` (`tools.ts:1097`) for the model to read (`tools.ts:1624`). `form-targets.ts:116,132` read/write `form_target`; DDL in `db/form-targets.sql:14`. **Whether the table now exists in production: ❓** (no DB access from here; `RELIABILITY.md:99` recorded it missing). |
| 9 | ⚠️ | `modelFor()` (`model-policy.ts:144`) is called only by `scripts/test-model-policy.ts:37`, never by live code. `MODEL_ROUTING` lists `browser_*` as `small` (`model-policy.ts:52-57`). **Changed:** the Stagehand model is not simply "default gpt-4o-mini". `browser.ts:63-75`: `STAGEHAND_MODEL` (no default) → `gpt-6*` uses the Responses adapter, whose own default is `openai/gpt-6-astra` (`stagehand-openai.ts:55`); otherwise an OpenAI-compatible key with `modelName \|\| 'openai/gpt-4o-mini'`; otherwise DeepSeek. `SECURITY-PRIVACY-READINESS.md:206` says production uses `openai/gpt-6-astra`. Either way, page content goes to OpenAI or DeepSeek. |
| 10 | ✅ | `src/knowledge/trajectory.ts:1-8` is the research search budget ("researcher's spine"). (Path is `src/knowledge/`, not `src/agent/knowledge/`.) |

## C. Verification and consent

| # | Status | Finding |
|---|---|---|
| 11 | ✅ | The review lists the **sent** values from `info.meta.values` (`index.ts:171-173`) plus the final screenshot. Fill counts as ok on `terminal.status === 'completed'` (`skyvern.ts:654`); a recipe is learned when completed with no error code (`skyvern.ts:676`). No DOM read-back. |
| 12 | ✅ | `isFilled` (`browser.ts:314-318`) first checks the **pre-fill** form map (`form` from `browser.ts:291`), then falls back to `form.fields.some(item => sameValue(item.value, f.value))`: **any** field holding the value passes. The map is re-read only on the retry pass (`browser.ts:322-324`), and that pass keeps the same "any field" fallback. |
| 13 | ✅ | `groups = {}` (`browser.ts:194`) is never populated; radio/checkbox inputs are skipped (`browser.ts:203`). `optionGroups` is always `[]`, including what `browserFields()` reports (`browser.ts:561-575`). |
| 14 | ✅ | `values.slice(0, 25)` … `…and N more` (`index.ts:173`). |
| 15 | ✅ | `logConsent` call stores `channel`, `intent`, `url`, `target` only (`agent.ts:293-298`); `consent.ts:32-35` inserts `{family_id, kind, detail}`. No values, no hash. |
| 16 | ✅ | `formValuesFor` flattens about 30 fixed labels (27 assignments, some per guardian/contact) incl. `Allergies` and `Medical conditions / notes` (`family-info.ts:157-201`); `tools.ts:972` sends all of them to every Skyvern fill. |
| 17 | ✅ (+) | `steps/adapters/browser.ts:42-60`: after `browserSubmit()` returns ok, the adapter returns `status: 'done'` and "Filled and submitted the form", ignoring `sub.data.confirmed` (computed at `browser.ts:443-447`). It also **fabricates** `referenceId = browser-<timestamp>` (`adapters/browser.ts:53`). **Truth table M5 is stale:** `FormAdapter`'s email fallback is now honest (`adapters/form.ts:29`), but its POST path still says "Submitted the form" on any 2xx with no confirmation (`adapters/form.ts:16-18`). M5 should be re-pointed at both adapters. |
| 18 | ✅ | `isStrictConsent` is a whole-message regex (`agent.ts:2315-2318`), not bound to a code or values. Benny: `proposal: { action, hash, code, …, expiresAt }` (`benefits/runtime.ts:20`), "Reply YES ${p.code} … Changes require a new approval" with revision and expiry (`benefits/runtime.ts:78`). |
| 19 | ✅ | `agent/verify.ts:1-10` is the research evidence rubric (official, current, corroborated). |

## D. Evals, cost, data

| # | Status | Finding |
|---|---|---|
| 20 | ⚠️ | Mostly right, but testworld is more than "accept any POST". It has `/apply/done` (confirmation + reference), `/apply/error`, an iframe, a two-step wizard and an injection page (`world.ts:1-17`). But `POST /apply` returns DONE for any body (`world.ts:107`), and **no route checks field values**. |
| 21 | ✅ | `scripts/eval-reliability.ts` runs real Skyvern (`fillFormForReviewAsync`) against testworld and counts accepted / fill / confirmed (`:130-185`). No pass^k, no cost. `costUsd` exists on `src/eval/benchmark.ts:39,55,88` (path is `src/eval/`, not `eval/`); only test fixtures set it. **There is no top-level `eval/` directory**, so Phase 3's `eval/results/` is new. |
| 22 | ⚠️ / ❓ | Structure confirmed: `cache_control` on the system block (`anthropic-native.ts:150`); `systemPrompt({profile, cases, activeGoal, lastAction, pendingActions, summary, situation, fillEvidence})` is rebuilt every turn (`agent.ts:1455`), plus prompt suffixes (`:1456-1457`) and a tool list that changes on form/onboarding turns (`:1460-1465`). **Not measured:** that needs a live API call, and no code logs `cache_read_input_tokens` today (no matches in `src/`). Measure it in Phase 4.7. |
| 23 | ✅ | Email `StepPayload` has `subject, body, target?, district?` and no attachments (`steps/types.ts:30`); `email.ts:14,37-56` supports `attachments`. |
| 24 | ⚠️ | Signature differs from the plan. Each **state** module exposes `evaluate(hh: Household, as_of: date) -> Determination` (`playbooks/school_meals/states/ca/rules.py:31`, likewise `il`, `ny`); dispatch is `rulesarchive/dispatch.py:20` `evaluate_state(program, hh, state, as_of)`. CA covers the LCFF Alternative Income Form (`states/ca/playbook.yaml:4,41,111-125`; `rules.py:66-68`), but **as a determination and a link, not as form-field values**. Phase 3.2's generator needs a new "expected field values" layer on top. `python -m pytest` in `archive/`: **550 passed** (14 s, Python venv with `requirements.txt`). |
| 25 | ✅ | Claimed forms (`bench/forms.json`): one Google Form (CKC Soquel, "filling verified" via `test-signup.ts`), one AcroForm PDF (Capitola scholarship, Spanish, fillable with a hand-decoded field map), one account-gated portal (Go Kids CareWait: account created, application not filled). `bench/form-quirks.json` lists 9 portal *types* (GoCPS, NYCSA, SFUSD, BenefitsCal, ACCESS NYC, Aeries, JotForm, Facebook Forms, …) as quirks, not supported forms. `pdf-forms.ts:22` knows only Capitola. **No form has been submitted end to end with an observed confirmation**: `RELIABILITY.md:26` records 5/5 fills and 0/5 confirmed (invalid run). No LCFF form is in the bench. |

## Other findings that touch the plan

- **The `account` step carries a `password`** (`steps/types.ts:42`). The plan's Phase 7 rule is that the agent never stores government passwords. Check where this payload is persisted before any portal login work.
- **Stagehand sends page content to OpenAI/DeepSeek**: this is a vendor flow the "don't widen what's sent" rule applies to (B.9).

## What changes in the later phases

1. **Phase 2** is building, not porting: `JevIntentEngine` has never been wired in. Copy the 3 commits' files (minus the `.pyc`; add `__pycache__/` to `.gitignore`), pin `jev-1.13.0` or newer instead of `jev-latest`, then build `decide.ts`.
2. **Phase 1.3** stores plain values + hash in `consent_event.detail`, which needs a `RETENTION.md` entry (how long, who can read it).
3. **Phase 1.5** covers both adapters (`browser.ts` ignores `confirmed`; `form.ts` POST path), drops the fabricated `browser-<timestamp>` reference, and updates truth-table M5.
4. **Phase 3.2** needs an archive-side function that turns a household plus `evaluate_state('school_meals', …, 'CA', …)` into the AIF's expected field values; the archive does not produce those today.
5. **Phase 3** results go in a new `eval/results/`; the scoreboard can extend `src/eval/benchmark.ts` rather than start fresh.
6. **Phase 4.7** first adds `cache_read_input_tokens` logging, so the caching claim gets measured before it's fixed.
7. Still unverified: `form_target` in production (B.8) and cache hit rate (D.22).

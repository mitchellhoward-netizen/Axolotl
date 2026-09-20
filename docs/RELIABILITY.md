# Reliability — measured, not claimed

Measured on 2026-09-20 against our own fake district. This is a
**baseline**: nothing was optimised for it, and a flattering number would be worse than none.

- **Command:** `railway run --service get-axolotl-agent -- npm run eval:reliability`
- **Scenario:** `apply` — `https://get-axolotl-agent-production.up.railway.app/world/4LMJIkiA3iXBekYy/apply`
- **N:** 1 (attempt 1 cold, attempts 2..1 warm-in-intent), step cap 12
- **Spend:** 2 browser runs, 1 sessions, 13s wall clock

## The numbers

| | fill reported complete | submit confirmed by the site |
|---|---|---|
| **All 1** | 1/1 (100%) | 0/1 (0%) |
| **First attempt (cold)** | 1/1 (100%) | 0/1 (0%) |
| **Repeat attempts (warm)** | n/a | n/a |

**False successes: 1** — the vendor reported the fill finished and the site never
confirmed it. This is the number that matters most, because it is the one that would tell a parent
their child is enrolled when nothing happened.

### Per attempt

| # | fill | confirmed | error code | time | run id | note |
|---|---|---|---|---|---|---|
| 1 | complete | no | - | 13s | `tsk_576353614886881860` | Skyvern failed |

## What this measures, precisely

- **"Fill reported complete"** is a **vendor self-report**: Skyvern's run status reached
  `completed`. It is not verification. The fill path asks for no structured extraction, so
  **we cannot currently confirm that the fields were actually filled correctly** — the only
  artefact is a screenshot. Treat this column as an upper bound on success, not the truth.
- **"Submit confirmed"** is verifiable: the fake site's own confirmation page renders the
  reference `SOQ-2026-4471`, and we only count it when that reference comes back. This is
  the end-to-end column.

## Cold versus warm — the finding

**There is no warm path in the browser layer.** `fillFormForReviewAsync` sends a fresh
`POST /v1/run/tasks` every time: no `run_with: "code"` compiled replay, no cache, and no recipe
parameter. Attempts 2..N are therefore **structurally identical to attempt 1**, so any difference
between the cold and warm columns above is sampling noise, not learning. Read them as one
distribution.

A warm path *does* exist one layer up, and this eval deliberately does not measure it: the agent
has `get_form_recipe` / `save_form_recipe` tools, so it can look up a previously saved form
structure and feed better field labels into the fill. That is **model-mediated advice about the
inputs**, not deterministic replay — it cannot make the browser work repeatable, and its ceiling is
bounded by the same per-step model reliability. It is a real mechanism and it is not a substitute
for compilation.

**Consequence:** the >90% warm-path target in `docs/RELEASE-PLAN.md` §G is untested and, as the
code stands, unreachable — because the mechanism it depends on (`run_with: "code"`) is not wired
in. This measurement is the baseline that change would be measured against.

## Limitations, stated so nobody over-reads this

1. One form (a clean single-page form). The iframe and multi-step wizard scenarios were rehearsed
   separately and are not part of this number.
2. The fixture is easier than a real portal: no login, no CAPTCHA, no PDF upload, no multi-page
   state. Real district forms are harder, so **treat this as an optimistic baseline**.
3. `N=1`. At this sample size one attempt moves the percentage by
   ~100 points, so the percentages are indicative and the
   raw counts are the real data.
4. Field-level correctness is unverified (see above). A "complete" fill could have wrong or
   missing values and still count here.
5. Vendor-side variance (their scheduling, model sampling, load) is inside these numbers and
   cannot be separated from ours at this sample size.

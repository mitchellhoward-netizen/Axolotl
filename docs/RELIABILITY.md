# Reliability — measured, not claimed

**Status: the fill baseline is measured. The end-to-end number is NOT valid, and this document says
exactly why.** A flattering measurement is worse than none, and this number gets shown to people
deciding whether to trust the product with their child's enrollment.

- **Date:** 2026-09-20
- **Command:** `railway run --service get-axolotl-agent -- npm run eval:reliability`
- **Fixture check, no vendor spend:** `EVAL_LOCAL=1 npm run eval:reliability`
- **Scenario:** `/apply` — a clean single-page form on our own fake district
- **N:** 5 (attempt 1 cold, attempts 2–5 warm-in-intent), step cap 12
- **Spend:** 10 browser runs, 5 sessions, 314s wall clock

## The raw run

| # | accepted | fill | confirmed | submit status | error code | time | run id | note |
|---|---|---|---|---|---|---|---|---|
| 1 | yes | complete | no | unconfirmed | - | 69s | `tsk_576356507648141984` | Skyvern failed |
| 2 | yes | complete | no | unconfirmed | - | 48s | `tsk_576356800524631468` | After clicking Submit, the site showed 'Not found' and no co |
| 3 | yes | complete | no | unconfirmed | - | 59s | `tsk_576357001569381040` | After clicking Submit, the site showed “Not found” instead o |
| 4 | yes | complete | no | unconfirmed | - | 85s | `tsk_576357260086132202` | Skyvern failed |
| 5 | yes | complete | no | unconfirmed | - | 53s | `tsk_576357625148085190` | After clicking Submit, the site navigated to /world/apply an |

| | task accepted | fill COMPLETED | submit confirmed |
|---|---|---|---|
| All 5 | 5/5 (100%) | **5/5 (100%)** | **0/5 — INVALID, see below** |
| First (cold) | 1/1 | 1/1 | 0/1 — INVALID |
| Repeat (warm) | 4/4 | 4/4 | 0/4 — INVALID |

## What is VALID: the fill baseline

The fill path never touches the submit path, so these two columns stand:

- **"Task accepted" is not success.** `fillFormForReviewAsync` is fire-and-forget: it returns as soon
  as the vendor accepts the job. It must never be quoted as a reliability figure, which is why it is
  reported separately.
- **"Fill COMPLETED" is a vendor self-report.** The run was polled to Skyvern's `completed`. We ask
  the fill for no structured extraction, so **we cannot currently verify that the fields were filled
  correctly** — the only artefact is a screenshot. **Treat 5/5 as an upper bound, not the truth.**
- **Cold and warm are the same distribution here** (see the structural finding below).

## What is NOT valid, and must not be quoted

The same run produced **submit confirmed 0/5** and **false successes 5/5**. **Do not use those
numbers.** They measure a bug in my own test fixture, not the product:

> Every form in the fake district posted to an **absolute** path — `action="/world/apply"` — while the
> world is served under a token mount at `/world/<token>/…`. Under that mount the POST resolved to
> `/world/apply`, missed the token prefix, and hit the static-file handler: **404, "Not found."** The
> vendor's own failure text says so verbatim: *"After clicking Submit, the site showed 'Not found' and
> no confirmation."*

Tier A never caught it because the standalone test server strips `/world`, so the absolute path
happens to resolve there. The bug existed **only** under the mount a real browser vendor uses — which
is precisely the case the fixture was built to exercise.

**Fixed:** form actions are now relative (`apply`, `2`, `../apply/done`, `apply/done`), which resolve
correctly under both mounts. Proven locally, no vendor spend:

```
$ EVAL_LOCAL=1 npm run eval:reliability
fixture self-check OK: POST http://127.0.0.1:53791/world/apply -> confirmation SOQ-2026-4471
```

The eval now **refuses to run** against a world whose submit path cannot succeed, and it did exactly
that on the next attempt: it aborted in two seconds rather than spending another 314 seconds
producing a second invalid number.

## The structural finding: there is no warm path

**The browser layer has no warm path at all.** `fillFormForReviewAsync` sends a fresh
`POST /v1/run/tasks` every time: no `run_with: "code"` compiled replay, no cache, no recipe
parameter. Attempts 2–5 are **structurally identical to attempt 1**, so the cold and warm columns are
one distribution, not a learning curve. Any difference between them at this sample size is noise.

A warm path *does* exist one layer up, and this eval deliberately does not measure it: the agent has
`get_form_recipe` / `save_form_recipe`, so it can look up a saved form structure and feed better field
labels in. That is **model-mediated advice about the inputs**, not deterministic replay — it cannot
make the browser work repeatable, and its ceiling is bounded by the same per-step reliability.

**Consequence:** the ">90% warm-path" target in `docs/RELEASE-PLAN.md` §G is untested and, as the code
stands, **unreachable** — the mechanism it depends on (`run_with: "code"`) is not wired in. This run is
the baseline that change would be measured against.

### Update, same day: the warm path landed while this was being measured

**This finding is true of the build that was measured, and no longer true of `main`.** During the run,
commit `40b7eb8` ("stop rediscovering the same form every time") added a form-target store and verified
recipes, and `src/integrations/skyvern.ts` now imports them: a completed fill records the target, and a
later fill with a different URL is sent the **stored** one. So a warm path now exists — different in
kind from `run_with: "code"` deterministic replay (it is a stored URL plus a recorded field structure,
not compiled code), but a real warm path.

Two consequences for reading this document:

- The 5/5 fill figure above is the **cold-only baseline**, measured against the deployed build
  `4a178b9`, which did not have the store.
- **The store is currently a no-op in production**: the run logged
  `Could not find the table 'public.form_target'`, so every read fails and every record is dropped
  quietly. Applying that table is a prerequisite for the warm path existing at all — and until it is
  applied, "we have a warm path" is not a claim anyone can make.

The next run, against a deploy that includes both the store and its table, is the first that can
actually measure cold versus warm. That comparison is the point of this baseline.

## Comparison to the industry baseline — read this before quoting anything

The cold general-purpose benchmark figure is about one in three (ClawBench 33.3%, HealthAdminBench
36.3% end-to-end, both on live production sites). **Our 5/5 fill completion is not comparable and must
not be presented as beating them:**

- those benchmarks measure complete **tasks** on **real** sites, including navigation, decisions and
  submission; this measures **filling fields on one clean fixture page**.
- the fixture has no login, no CAPTCHA, no file upload, no multi-page state — and our own pre-flight
  and domain allowlist have already removed the wrong-URL and no-form failure classes from this path.
- a fill that reports complete but filled the wrong fields would still count here.

**The honest claim available today:** on a clean, known, single-page form, the vendor reliably reports
completing the fill (5/5), and we have **no evidence yet** about field-level correctness or about
end-to-end submission.

## Incidental finding worth fixing

The run logged `[form-targets] read failed: Could not find the table 'public.form_target' in the
schema cache`. Some code now reads a `form_target` table that is **not applied to the live database**.
That is the "store the exact form URL" lever from §G, and today it is a silent no-op in production —
worth deciding whether it should degrade quietly or fail loudly.

## Limitations, stated so nobody over-reads this

1. One fixture scenario. The iframe and multi-step wizard were rehearsed separately and are not in
   this number.
2. The fixture is easier than a real portal, so treat the fill figure as an optimistic ceiling.
3. `N=5`: one attempt moves a percentage by 20 points. The raw counts are the real data.
4. Field-level correctness is unverified.
5. Vendor-side variance (scheduling, model sampling, load) is inside these numbers and cannot be
   separated from ours at this sample size.
6. Two submits failed as bare `Skyvern failed` (a platform-level status, retryable by their taxonomy)
   rather than a specific reason; our wrapper does not surface the submit run id, so those two are
   undiagnosed.

## Next measurement (blocked on a deploy)

1. **Deploy the fixture fix** (`src/testworld/world.ts`, form actions made relative). I cannot: the
   pre-push hook blocks pushing, by design.
2. Re-run `N=5`. The self-check will pass and the submit/confirmation columns become meaningful — that
   is the end-to-end number we still do not have.
3. Then wire `run_with: "code"` for this form and re-run, to test whether compilation actually moves
   the warm path. That is the whole reason for measuring a baseline.

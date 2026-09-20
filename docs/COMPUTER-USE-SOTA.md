# Where our browser stack sits vs the state of the art (Sept 2026)

Research stream: Skyvern's docs + source, third-party benchmark papers, vendor releases, and practitioner
reports. Labels: **[DOCS]** vendor documentation, **[CODE]** read from vendor source, **[BENCH]**
third-party benchmark, **[COMMUNITY]** practitioner reports, **[OURS]** verified in our repo,
**[INFERENCE]** my judgement.

**Correction to what I told you last turn:** I said the blocked-host error was "a blocklist on
Skyvern's side — check Settings in their dashboard." That was wrong. There is no dashboard setting,
no organization setting, and no API for a domain allow/block list. See §5.

---

## TL;DR — the five things that matter

1. **Our real success rate on novel multi-page forms is probably ~1 in 3.** The best frontier agents
   score **33.3%** end-to-end on [ClawBench](https://arxiv.org/abs/2604.08523) (153 everyday tasks on
   144 live production platforms) and **36.3%** on [HealthAdminBench](https://arxiv.org/abs/2604.09937)
   (135 healthcare admin tasks: prior auth, appeals, payer portals). HealthAdminBench's **82.8% subtask**
   success against 36.3% end-to-end is the compounding math made visible. WebVoyager's 99% headline is
   saturated and read-heavy — it predicts nothing about an enrollment form.
2. **The highest-value technique in the field is workflow compilation, and we already own it but don't
   use it.** Skyvern's `run_with: "code"` records a successful run, generates executable code, then
   replays with **zero LLM inference and zero screenshots**, falling back to the agent and regenerating
   on drift **[DOCS]**. We never pass it. Our fills run in the most expensive, least reliable mode.
3. **We have no way to tell failure modes apart, and we can fix that with machine-readable signals
   instead of prose.** Skyvern's own docs call `failure_reason` string-matching "fragile" and point to
   `error_code_mapping` + validation criteria **[DOCS]**. We do neither.
4. **`completed` does not mean "it happened."** The most-reported Skyvern failure is a lying status
   ("says a task is completed, but it actually has not done the action") **[COMMUNITY]**, and our
   submit path treats `status === 'completed'` as success **[OURS]**. On a child's enrollment record
   there is no acceptable version of this.
5. **The two real architectural gaps are handoff and measurement, not capability.** Skyvern's own docs
   admit HITL sessions "can expire while waiting for approval" **[DOCS]**; Cloudflare ships a first-class
   `handoff()` / `handoffComplete` / `getLiveView` protocol, and Nova Act names the two patterns
   (human approval, UI takeover) **[DOCS]**. And nobody in this space has an honest internal eval —
   building one is worth more than any optimization we could ship this month.

---

## 1. What our stack actually is (verified in our repo)

| Layer | What we do | File |
|---|---|---|
| Reading a page | Stagehand on Browserbase (`BROWSER_BACKEND=stagehand`), `browser_open` / `browser_observe` / `browser_extract` | `src/integrations/browser.ts` |
| Filling a form | Skyvern Cloud: create a browser session, `POST /v1/run/tasks` with a natural-language prompt + `url` + `max_steps`, poll, screenshot | `src/integrations/skyvern.ts` |
| Submit | A **separate** task, only from the post-YES consent path | `submitFilledForm`, `src/agent/steps/adapters/submit.ts` |
| Completion | Skyvern webhook (HMAC over raw body) + a fallback poller | `src/integrations/web.ts`, `checkPendingFills` |
| Portal read-only | Parent signs in themselves in our VNC takeover page; we save the session as a Skyvern **browser profile** | `src/integrations/connections/parentPortal.ts` |

Perception across the two tools is accidentally hybrid — Stagehand is accessibility-tree-first,
Skyvern is screenshot + pruned DOM. That is a real strength (§4).

**Verified absences [OURS]:** no `run_with`/compiled replay, no `engine` tier, no
`error_code_mapping`, no validation blocks, no `POST /v1/run/tasks/login`, no post-submit
confirmation extraction. The Skyvern call is the naive form:

```ts
api('/v1/run/tasks', { prompt, url, max_steps, browser_session_id, webhook_url })
```

---

## 2. The 2026 landscape (the 2025 names in my original brief were stale)

Project Mariner was shut down 4 May 2026 (folded into Gemini). OpenAI's Operator line became the
ChatGPT agent / CUA. Current frontier set: **Anthropic** (computer-use tool, Claude in Chrome GA,
Claude Cowork), **OpenAI** (ChatGPT agent, GPT-5.4 native computer use), **Google** (Gemini API
computer-use tool, Gemini-in-Chrome auto-browse), **Amazon Nova Act** (GA on AWS), **Microsoft
Copilot Studio computer use** (GA, model-agnostic). **[DOCS]**

The open/infra layer we actually depend on or compete against: **Skyvern**, **Stagehand/Browserbase**,
**Browser Use**, **Playwright MCP**, plus benchmark harnesses (WebArena, WebVoyager, WebBench, ClawBench,
HealthAdminBench).

## 3. The numbers — what "good" is, honestly

| Benchmark | What it measures | Best result | Why it matters to us |
|---|---|---|---|
| [ClawBench](https://arxiv.org/abs/2604.08523) | 153 everyday tasks, **144 live** production platforms, submission intercepted | **33.3%** (Claude Sonnet 4.6); GLM-5 24.2%; GPT-5.4 6.5% | Closest public proxy for "real sites, real forms" |
| [HealthAdminBench](https://arxiv.org/abs/2604.09937) | 135 healthcare **admin** tasks (prior auth, appeals, payer portals, fax), 1,698 checkpoints | **36.3%** end-to-end vs **82.8%** subtask | The subtask→end-to-end gap *is* multi-step compounding |
| [WebBench](https://benchmarklist.com/benchmarks/webbench_ai/) | 5,750 tasks / 452 sites, separates **read vs write** | 79.9% overall, but **50%** file manipulation, **53.9%** delete, **65.2%** create | Writes are where everyone collapses |
| WebArena (AI Index 2026) | Web task suite | ~15% (2023) → **74.3%** (early 2026) | Still failing ~1 in 4 balanced tasks |
| WebVoyager | 643 tasks / 15 sites, read-heavy | 99.2% | **Saturated — predicts nothing.** Don't quote it |
| OSWorld-Verified | Desktop OS tasks | 86.1% | 30 of 32 rows are provider self-reports; treat with suspicion |

**[INFERENCE] The math we should plan against.** At 95% per step, a 20-step enrollment is ~36% and a
40-step benefits application ~13%. For **novel** multi-page government/school forms, budget **~33%
unattended end-to-end** and **50–70% needing at least one human intervention**. For **previously
compiled** flows it should be **>90%**. That delta is the entire business case for compilation, and
it is also the honest number to put in front of an advisor or an employer — not "it fills forms for you."

## 4. The techniques that separate production from demo

| Technique | What it buys | Do we have it? |
|---|---|---|
| **Workflow compilation / deterministic replay** — record a successful run, replay executable code, fall back to the agent on drift | Zero LLM + zero screenshots on repeat runs; the field's biggest cost/reliability lever | **No** — Skyvern exposes `run_with: "code"`; Stagehand has `cacheDir` (first run ~20–30s/50k tokens → ~2–3s/0 tokens). We use neither **[DOCS]** |
| **Hybrid perception** (a11y tree primary, vision for iframes/canvas/shadow DOM) | Cheaper, more stable grounding than pixels alone | **Partly, accidentally** — Stagehand is a11y-first, Skyvern is vision-first |
| **Model-chosen observations / raw CDP** | Fixes the real bottleneck: a cookie button that's on screen but absent from the state you send | **No** — both our vendors fix the observation space in code. Browser Use publicly abandoned fixed state for raw CDP **[COMMUNITY]**, citing exactly this |
| **Versioned element refs, fail-closed** | A stale `ref=10` ("Cancel") silently becoming "Delete" on re-render — documented in [arXiv 2511.19477](https://arxiv.org/abs/2511.19477) | **No** — neither vendor documents it. This is the difference between "submitted" and "submitted the wrong child's record" |
| **Action-layer authorization** (domain allowlist, irreversible-verb gate) | The *only* injection defense with a clean result in LivePI (2026): pre-execution tool authorization, not model judgement | **No** |
| **Machine-readable error codes** (`error_code_mapping`, validation criteria) | Branchable failure modes instead of prose | **No** |
| **First-class handoff protocol** (live view + explicit success/failure back) | Turns "the agent is stuck" into a 30-second parent action | **Partial** — we have the VNC takeover page, but no structured handoff (no approve/reject captured back, no expiry handling) |
| **Post-submit verification** (extract the confirmation, compare the values) | Kills the false-completion class | **No** |
| **A real internal eval** on our own flows, submissions intercepted | Tells us whether any of the above helped | **No** |
| **Injection resistance** | RedTeamCUA (ICLR 2026): Claude 3.7 CUA ASR 42.9%, Operator 7.6%, up to 50% in realistic end-to-end. Production post-mortem verdict: general-purpose autonomy is "fundamentally unsafe"; enforce boundaries in **code** | **Partly** — our consent gate and fill/submit split are code-level, which is the right shape |

## 5. Skyvern: the three failure modes, correctly diagnosed

### (a) Filling a page that has no form — **our bug, not theirs**
Skyvern goes to the URL it's handed and has no notion of "this page should contain a form" **[DOCS]**.
Our prompt tells the model the opposite: *"If you don't have the EXACT form URL, pass the program's
site URL — Skyvern navigates to find the right form"* (`src/agent/tools.ts`) **[OURS]**. That
instruction guarantees a wasted run.

Fix, all doc-backed: resolve the real form deep link at provisioning time and store it per
(school, program); state completion criteria explicitly ("COMPLETE only when the listed fields are
filled"); add `error_code_mapping` + a terminate criterion so "no form on the page" comes back as
`output.error == "no_form"` instead of a 50-step timeout; and **pre-flight it ourselves** — fetch the
URL, look for `input`/`select`/`textarea`, and only spend a browser session if there's something to fill.

### (b) `400 {"detail":"The host in your url is blocked: …"}` — **not a school blocklist, and not self-serve**
**[CODE]** The string is `BlockedHost` in [`skyvern/exceptions.py`](https://github.com/Skyvern-AI/skyvern/blob/main/skyvern/exceptions.py)
— an **SSRF/egress guard**, HTTP 400. Configuration is only operator env vars in
[`skyvern/config.py`](https://github.com/Skyvern-AI/skyvern/blob/main/skyvern/config.py):
`BLOCKED_HOSTS` (default `["localhost"]`) and `ALLOWED_HOSTS` (empty, and honoured only on a
non-cloud checkout). There is **no dashboard setting, no org setting, and no API** — the 69-path
OpenAPI surface has no host-policy endpoint, and the org-settings model exposes only
`max_steps_per_run`, `max_steps_per_workflow_run`, `webhook_callback_url`, `artifact_url_expiry_seconds`
**[CODE]**.

What actually triggers it ([`url_validators.py`](https://github.com/Skyvern-AI/skyvern/blob/main/skyvern/utils/url_validators.py)):
internal suffixes (`.local`, `.internal`, `.svc`, `.cluster.local`), literal private/link-local/CGNAT
IPs (`10/8`, `172.16/12`, `192.168/16`, `169.254/16`, **`100.64.0.0/10`**), metadata IPs, or a hostname
that *resolves* into those ranges when DNS is enabled. Critically, **`UnresolvableHost` subclasses
`BlockedHost` and reuses the identical message**, so a plain DNS failure from Skyvern's worker is
indistinguishable from a policy block in the text.

**The timing tells you which guard fired:** `POST /v1/run/tasks` validates with `resolve_dns=False`,
so a **synchronous** 400 is a string-level block (internal suffix / literal private IP / operator
entry). The same message **mid-run** means the name resolved to a non-global address or DNS failed.

**[INFERENCE] Most likely for `www.nycstudentomny.org`:** it resolved to a non-global address from
Skyvern's resolver, or DNS failed on their worker — not a curated blocklist, and not something a
dashboard toggle fixes. **Action:** resolve the host from a public resolver ourselves; if it returns
CGNAT/RFC1918, use the school's canonical public domain instead; canonicalize the URL we send (strip
SSO/shortener/tracking redirects, force https, collapse duplicate `www`); and open a support ticket
with host + run id + resolved IPs. **Never retry it** — `BlockedNavigationDestination` is deliberately
excluded from retry in their source, so retrying a policy block only burns credits.

### (c) Failure modes are indistinguishable — fix with signals, not prose
**[DOCS]** Skyvern's own docs call `failure_reason` substring matching "fragile" and route you to
`error_code_mapping` (natural-language descriptions → *your* codes, returned as `output.error`) and
validation blocks (`complete_criterion`/`terminate_criterion`). Their example taxonomy: `login_failed`,
`captcha_required`, `not_found`, `maintenance`, `rate_limited`, `access_denied`, `timeout`.

Two more signals we ignore:
- `GET /v1/runs/{id}/timeline` → per-block `status`, `failure_reason`, **`error_codes`**,
  `finish_reason`, `final_url` **[CODE]**.
- The status enum includes **`paused`** (human/TOTP wait), which their docs' tables omit **[CODE]** —
  we would currently treat it as a stall.

Concrete rules: `timed_out` → step budget, not a site problem. `terminated` + CAPTCHA artifact → bot
wall. `terminated` + password field in `visible_elements_tree` → login wall (use
`POST /v1/run/tasks/login`, which we don't). `completed` + zero form fields → our landing-page bug.
`failed` + "Failed to send webhook" → **the task may have succeeded**; read `output` before telling
the parent anything.

### Session, webhook, and cost facts we're not using
- Sessions bill **while open, including idle**, default timeout **60 min**, closed automatically at
  timeout even mid-task **[DOCS]**. Our portal-connect session uses `timeout: 30` minutes while a
  parent signs in by hand — and Skyvern's own docs warn HITL sessions "can expire while waiting for
  approval". We should extend or split.
- Webhooks are HMAC-SHA256 over the **raw body** keyed by the org API key **[DOCS]**. Our verifier
  does that correctly **[OURS]** — but ignores `x-skyvern-timestamp`, so a captured payload is
  replayable; our `completedFills` de-dup limits the blast radius, not the principle.
- Idempotency should key on `run_id` + `attempt` + `retry_pending` **[DOCS]**, not `run_id` alone.
- Cost: one credit ≈ one browser action; login ≈3, 10-field form + submit ≈11, 5-page extraction
  ≈15–25. Hobby $29/mo = 30k credits ≈ 1,200 actions, 10 concurrent; Pro $149 = 150k, 25 concurrent
  **[DOCS]**. The cheapest-run levers, in their own order: cap `max_steps`, `run_with: "code"`, cheaper
  engine (`skyvern-1.0` is the recommended tier for form fills — we don't set it), give the exact URL,
  use profiles to skip login.

## 6. Gap list, ranked by leverage

1. **Compile our recurring flows** (top 20 school/portal/benefits) to `run_with: "code"` with agent
   fallback, keeping the consent-gated submit *out* of cached code (there is a real bug class where a
   cached click reported success without the element existing — [PR #4485](https://github.com/Skyvern-AI/skyvern/pull/4485)).
2. **Fix the false-completion hole.** Verify the submission: extract the confirmation, compare values,
   and treat "clicked submit, no confirmation observed" as **failure**. This is WebBench's dominant
   write-task failure and Skyvern's most-reported complaint.
3. **Machine-readable failure classification** — `error_code_mapping`, validation criteria, timeline,
   `paused` — and surface the *actual* reason to the parent instead of "I hit a snag."
4. **A handoff protocol over the VNC view we already have**: link → parent approves/rejects or takes
   the browser → we record success/failure. Sizes the session for human latency.
5. **Pre-flight + deep-link resolution** so we stop spending sessions on pages with no form.
6. **Action-layer authorization**: domain allowlist and an irreversible-verb gate (submit, pay,
   delete) — doubles as our injection defense.
7. **Versioned element refs, fail-closed** on the multi-page wizards that write to a child's record.
8. **Build the eval first, actually** — 50–100 of our real flows with submissions intercepted and
   human labels. Without it we cannot claim any of the above worked.

## 7. Sources

Skyvern: [reliability tips](https://www.skyvern.com/docs/developers/going-to-production/reliability-tips),
[error handling](https://www.skyvern.com/docs/developers/going-to-production/error-handling),
[webhooks](https://www.skyvern.com/docs/developers/going-to-production/webhooks),
[browser sessions](https://www.skyvern.com/docs/developers/optimization/browser-sessions),
[browser profiles](https://www.skyvern.com/docs/developers/optimization/browser-profiles),
[code caching](https://www.skyvern.com/docs/developers/features/code-caching),
[cost control](https://www.skyvern.com/docs/developers/optimization/cost-control),
[billing](https://www.skyvern.com/docs/cloud/account-settings/billing-usage),
[CAPTCHA](https://www.skyvern.com/docs/developers/features/captcha-and-bot-bypass),
[OpenAPI](https://www.skyvern.com/docs/api-reference/openapi.json);
source: [exceptions.py](https://github.com/Skyvern-AI/skyvern/blob/main/skyvern/exceptions.py),
[url_validators.py](https://github.com/Skyvern-AI/skyvern/blob/main/skyvern/utils/url_validators.py),
[config.py](https://github.com/Skyvern-AI/skyvern/blob/main/skyvern/config.py),
[browser_egress_policy.py](https://github.com/Skyvern-AI/skyvern/blob/main/skyvern/forge/sdk/browser_egress_policy.py),
[organizations.py](https://github.com/Skyvern-AI/skyvern/blob/main/skyvern/forge/sdk/schemas/organizations.py),
[open SSRF issue #8577](https://github.com/Skyvern-AI/skyvern/issues/8577).
Benchmarks: [ClawBench](https://arxiv.org/abs/2604.08523), [HealthAdminBench](https://arxiv.org/abs/2604.09937),
[WebBench](https://benchmarklist.com/benchmarks/webbench_ai/), [production post-mortem](https://arxiv.org/abs/2511.19477),
[stale-ref paper](https://arxiv.org/abs/2511.19477).
Community: [Launch HN](https://news.ycombinator.com/item?id=41936745),
[false-completion report](https://news.ycombinator.com/item?id=42362929),
[multi-page applications](https://news.ycombinator.com/item?id=43777550),
[Browser Use "bitter lesson"](https://browser-use.com/posts/bitter-lesson-browser-agents),
[framework comparison](https://dev.to/stevengonsalvez/browser-tools-for-ai-agents-part-2-the-framework-wars-browser-use-stagehand-skyvern-4gn).

**Not verified, stated rather than guessed:** Skyvern Cloud's actual `BLOCKED_HOSTS`/egress config and
whether they add customer-specific entries (private to their deployment); whether a Cloud-only
pre-flight can return the blocked-host error; per-org numeric rate limits (undocumented); the current
effective `max_steps` default on Cloud (docs say 50 and 10 in different places; source defaults are 10
and 25 with org overrides); OpenAI's current product framing (their index pages returned HTTP 403);
Nova Act per-step pricing (page truncated).

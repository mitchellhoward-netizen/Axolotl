# Tier 3 — Account creation & authenticated forms (MyCareConnect) spec

Status: spec (not built). Owner: founder + co-founder. Last updated: 2026-02-11.

## 0. TL;DR

The gap is **not** "sign up → email verify → login." Ground truth on MyCareConnect changes the shape of the work:

- The **family portal is invitation-gated** — the parent's agency must invite them; there is no self-serve "create an account."
- The **childcare waitlist** lives in **CareWait** ("Start an application for childcare"), which is the self-serve entry point.
- Sign-in is gated by an **email/SMS one-time code** (10-minute validity, resend after 60s).

So Tier 3 is three things, in order of difficulty: (1) an **authenticated-flow browser hand** (sign-in + session persistence), (2) a **human-in-the-loop OTP relay** (the parent texts us the code), and (3) optional **inbound-email automation** for full autonomy.

**Recommended decision:** the OTP is relayed by the parent (human-in-the-loop), not read from an agent-owned inbox. It is zero new infra, it is the natural *consent + possession* moment, and it avoids the agent holding the parent's mailbox. Automate inbound email later, only if we ever want fully-autonomous login.

## 1. Ground truth (verified against MCT Technology docs)

| Fact | Source |
|---|---|
| Family portal requires an agency **invitation** (email or phone), then the parent gets **two emails** (join link + login credentials) | [How do I create an account?](https://support.mcttechnology.com/hc/en-us/articles/6635116589197-MyCareConnect-How-do-I-create-an-account) |
| CareWait = "Single Application Management" — the childcare **application/waitlist**; applications carry Family / Parent / Child / Child Criteria sections | [CareWait: Single Application Management](https://support.mcttechnology.com/hc/en-us/articles/4413423467661-CareWait-Single-Application-Management) |
| Sign-in sends a **Confirmation Code** to the user's email; code valid ~10 min, resend after 60s (MFA optional) | [CareWait: Multi-Factor Authentication](https://support.mcttechnology.com/hc/en-us/articles/11511255320205-CareWait-Multi-Factor-Authentication) |
| Parent identity confirmation uses the same **Email or SMS verification code** pattern (SEND → enter code → SUBMIT) | [Quick Submission Guide for Parents](https://support.mcttechnology.com/hc/en-us/articles/360052145071-CareConnect-Quick-Submission-Guide-for-Parents) |

**Verified endpoints (fetched 2026-02-11):**
- `https://careconnect.carecloud.io/home/login` → title "MCT | CareConnect **Provider**" — the **staff/agency admin** login, NOT the parent side.
- `https://careconnectfamily.carecloud.io` → 302-style redirect page → **`https://app.mycareconnect.io`** (title "MyCareConnect") — the **family/parent** portal.
- `app.mycareconnect.io` is a JS SPA (minimal static HTML) — needs the browser hand, not static fetch.

**Implication:** there is no generic "create a MyCareConnect account with email verify." The two real entry paths are:

1. **Invitation path (portal):** parent's agency sends an invite → parent accepts → parent gets credentials → log in. The agent's job is to *request* the invite and *guide* the parent through accepting it — not to silently mint an account.
2. **Application path (CareWait):** "Start an application for childcare" — self-serve, and the waitlist form. This is the actual "fill the waitlist form" target, and it requires signing in (hence the OTP).

### Confirmed agency flow — Go Kids, Inc. (`/carewait/gki`)

Rendered live (Stagehand, read-only, no submission). Landing page title **"Apply for Child Care - Go Kids, Inc"** ("Welcome to the Go Kids Waitlist Self-Service Tool!"), agency phone `831-637-9205`:

- Two entry buttons: **"Apply"** (new family → create a user account) and **"Returning Families"** (log in).
- Clicking **Apply** surfaces a **Log In** overlay with inputs **"Email / Cell"** + **Password**, and buttons **Log In**, **Sign Up**, **Forgot Password?**, and "I am a Provider, take me to Provider Site".
- So the new-family path is: **Apply → Sign Up → create account (name/email/cell/password) → then fill the application.** Login identifier is *email or cell*; OTP (email/SMS) gates subsequent sign-ins.

> Concrete Phase-2 target: `https://app.mycareconnect.io/carewait/gki` — self-serve signup exists for the waitlist tool (unlike the invite-only family portal), which is exactly the "account-required waitlist" the founder flagged.

## 2. Decision — how we handle the OTP

The one real blocker (and the thing the founder flagged) is: **a confirmation code is sent to the parent's email/phone, and the agent must enter it.**

| Option | How | Pros | Cons |
|---|---|---|---|
| **A. Real inbox** | Poll an agent-owned mailbox (Resend inbound / Mailgun inbound / IMAP) for the code | Fully autonomous | New infra; agent holds the parent's mailbox (privacy); harder to keep consent explicit |
| **B. Parent relays the code (recommended)** | Agent does sign-in up to the code prompt, texts the parent "what's the 6-digit code?", parent replies, agent enters it | Zero infra; code receipt = possession + consent; works for email *and* SMS; matches product loop (always parent-in-the-loop) | Not fully autonomous; requires the parent to be responsive |
| **C. Hybrid** | Try A if an inbox is configured, else fall back to B | Best of both | Most code; A's privacy caveat still applies |

**Recommendation: B now, A later (behind an env flag) as an optional autonomy upgrade.**

B also composes cleanly with the existing consent gate: an OTP relay *is* the parent authorizing the agent to act on their account.

## 3. New primitives to build

### 3.1 Session persistence (prerequisite)
Today `browser.ts` launches a **fresh** Stagehand/Browserbase browser with no `sessionId`, and `getPage()` just grabs the first page. A login would not survive a redeploy or a context rebuild.

- Launch with a **Browserbase `sessionId`** (persistent browser session) keyed per family (`axolotl-{conversationId}`), OR capture cookies on login and restore them on subsequent launches.
- Add `browserLogin(url, credentials)` → fill → submit → **assert authenticated** (session cookie present + dashboard DOM, not the login form) → persist session id/cookies.

### 3.2 Account adapter (channel `'account'`)
Add a `AccountAdapter` (channel `account`) next to `BrowserAdapter`/`CallAdapter`, implementing the same `ChannelAdapter` interface:

- `open` → `signin` → `otp` (pause for parent) → `verify-login` → `fill` (reuse `browserFill`) → `submit` (consent-gated, reuse `browserSubmit`).
- The step carries `requiresConsent: true` so it is gated exactly like today's submit.

### 3.3 Sign-up hand (self-serve only)
`browserSignUp(url, fields)` for portals that *do* allow self-registration. On MyCareConnect the waitlist path ("start an application") may prompt account creation; drive it, then hand off to the OTP relay.

## 4. The mid-flow human-input problem (pause/resume)

OTP is a **human input during execution**, which is architecturally new: current steps are fire-and-forget with a consent gate *before* execution. We need a *pause/resume*:

- New executor state `HumanInputRequired` (analogous to the existing `call.ts` "the school needs something only the parent can answer" path, `call.ts:61`).
- On hitting the code prompt: store the pending step + a `resumeOn: 'code'` marker, message the parent ("what's the 6-digit code? It expires in 10 min."), and suspend.
- On the parent's next reply, the agent resumes the step with the code as a runtime argument (no re-proposal, no double consent).

## 5. Deterministic verifier (benchmark)

Tier 3 success is three assertions, all already machine-checkable:

1. **Login** → after `browserLogin`, assert authenticated: session cookie exists AND the DOM shows the signed-in state (not the login form).
2. **Reach the waitlist form** → `browserAssessPage` returns `VERIFIED` (real form, right program).
3. **Fill** → `browserFill` returns `filled≥N` and machine-verified.

Metric: `passed / total` where a task passes only if all three hold.

## 6. Privacy & consent invariants (non-negotiable)

1. Never create or log into an account silently — both are consent-gated steps.
2. Never store the parent's password. Use a one-time flow or let the parent set their own password.
3. The OTP relay doubles as proof of possession + consent; never claim a login succeeded unless the authenticated-state assertion passed.
4. Any stored session is scoped to that family's conversation and deletable on request.

## 7. Phased plan

- **Phase 1 (DONE):** the `account` channel + `AccountAdapter` (signup → OTP pause → verify → logged-in), an `AuthDriver` abstraction (`BrowserAuthDriver` in prod, an in-memory mock in tests), the pause/resume expressed as `awaiting_reply`, and the `account_action` tool so the brain can propose it. Tested offline (`npm run test:account`): signup/login → awaiting code → verify → done, plus the consent gate. No real accounts used.
- **Phase 2 (needs a real URL/agency):** the CareWait "start an application" self-serve flow against a real agency, using the parent-relay OTP.
- **Phase 3 (optional, env-flagged):** inbound-email OTP automation (Resend inbound or IMAP) for autonomy.

## 8. Open questions (block Phase 2)

1. Do we have the **exact agency portal URL** for the childcare waitlist ("Start an application for childcare")? (e.g. a county/school agency's CareWait link)
2. Do we have a **test agency / sandbox** that can send a real invitation + OTP, so we're not creating throwaway accounts against a live county system?
3. Do you want **inbound email** (Phase 3) eventually, or is parent-relay the permanent answer?

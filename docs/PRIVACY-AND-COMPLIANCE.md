# Privacy & compliance pack — the honest version

Companion to `docs/SECURITY-PRIVACY-READINESS.md` (technical posture) and
`docs/COMPUTER-USE-SOTA.md` (browser stack). This file is the parent-facing policy, the retention
table, the subprocessor list, and the incident runbook — built to what the research says is actually
required, not to what sounds impressive.

Legal items were researched to primary sources; **this is not legal advice**, and the two items
marked **COUNSEL** are open questions to put in front of a lawyer before we make them public.

---

## 1. What governs us (and what does not)

| Instrument | Applies? | Consequence for us |
|---|---|---|
| **FERPA** | **No direct obligation.** It binds funding recipients, not third parties; no private right of action (*Gonzaga v. Doe*). | We act on the **parent's own access right, with their credentials**. Never say "we are FERPA compliant" or "we are a school official" — that designation is the district's to make, and the school-official test requires the contractor to be under the *agency's* direct control. |
| **KOPIPA (formerly SOPIPA), BPC § 22584** | **Probably not** — "operator" requires the product be *designed and marketed for K–12 school purposes*. | We cannot offer it as a substitute for a real DPA. Its definition of covered information does include parent-supplied and special-education data, so treat it as our design bar anyway. |
| **COPPA** | **Arguable** — the parent is the user, but the rule's school provisions were never finalised. | **Assume it applies.** § 312.10 requires a **written retention policy with specific timeframes, published in the notice** — that is §3 below, and it is mandatory in spirit. **No child ever interacts with the agent.** |
| **FTC Health Breach Notification Rule, 16 CFR 318** | **Very likely yes** — reaches non-HIPAA health apps, and coverage attaches if the product has the *technical capacity* to draw from multiple sources. Precedents: GoodRx $1.5M, Premom $100k. | See the IR runbook (§5). 60-day clock. **Also: an *unauthorized disclosure* is itself a breach** — which makes every model/browser-vendor hop an authorization-requiring disclosure, papered in the privacy notice. |
| **CCPA/CPRA** | **Probably not a "business" yet** (thresholds: $26.6M revenue / 100k consumers / 50% revenue from selling). | Instrument the thresholds. Note the 2026 rules have **no small-business exemption**: risk assessments (§7150) and the new rule that **all PI of consumers under 16 is sensitive PI** (11 CCR §7001(bbb)) are the ones to watch at the margin. **COUNSEL:** whether a parent can exercise a *child's* rights is unsettled. |
| **California breach statute, Civ. Code §1798.82** | **Yes**, once we hold covered PI. SB 446 (eff. 1 Jan 2026) made it a hard **30 calendar days**. | Our master clock. §1798.82(l) deems us compliant if our own policy commits to 30 days — so §5 says 30 days. |
| **New York SHIELD, GBL §899-aa** | **Yes, and most teams miss it.** S2659B added a **30-day** deadline; **no threshold and no nexus requirement**. | One NY family triggers it. |
| **California AI laws** | **Not yet**: CAITA (SB 942) has a 1M-user threshold and excludes AI-generated text; AB 1064 was vetoed; AB 2013 binds developers. | **SB 1119 "Adam's Law" (from 1 Jul 2027) very likely excludes us** via BPC §22601(b)(2)(A) — but the guardrail is a product decision: **never build companionship, persona or relationship-sustaining behaviour.** |
| **ADA Title II / WCAG 2.1 AA** | Applies to districts, **expressly including vendor-provided tools**; deadlines Apr 2027/2028. | Accessibility is a procurement gate. |

## 2. What we must not claim

Carried in full in `docs/SECURITY-PRIVACY-READINESS.md` §3. The five most tempting errors:

1. **"Your messages never leave our system"** — false; they go to our model provider.
2. **"We are FERPA compliant / we are a school official"** — see above.
3. **"SOC 2 compliant"** — false before a report exists; "certified" is never accurate. Offer a readiness summary and the signed engagement letter, and say which it is.
4. **"Row Level Security restricts access to children's records"** — true only against API clients. `service_role` **bypasses RLS**, so for every record the agent touches, *our application's authorization logic* is the boundary. Always qualify with where the secret key lives, and add field-level restriction for IEP/housing/health columns.
5. **"We delete everything within 30 days"** — 30 days is a *default*. Provider safety/abuse retention can run longer (Anthropic: Usage Policy content up to 2 years, classifier scores up to 7 years, **even under ZDR**). Say "typically 30 days, except where a provider is legally required to retain content for safety review."

## 3. Retention schedule (published, per COPPA § 312.10)

| Data | Kept | Deleted by |
|---|---|---|
| Conversation messages | **90 days** | rolling job; `/reset` immediately |
| Triaged school email (`incoming_email`) | **60 days** | rolling job; `/reset` immediately |
| Family profile, cases, memory, students | while the account is active | `/reset` (complete deletion, §4) |
| Gmail OAuth tokens | while connected | revocation, or `/reset`; auto-expire |
| School-portal session (vendor-side) | while connected | `/reset` revokes the vendor profile first |
| Consent + deletion audit rows | **7 years** (audit trail; contains no family content) | retention policy |
| Application logs | 30 days, PII-redacted at write time | host retention |
| Browser session recordings | **not collected** (`recordSession:false`) | n/a |
| Provider abuse/safety copies | their window (typically 30 days) | **we cannot delete these — see §6** |

The forwarding address and mailbox token exist only while the family is connected, and both go on
`/reset`.

## 4. Deletion — what actually happens

`deleteFamilyData()` (called by `/reset`) does, in order:

1. **Revoke vendor-side credentials first** — the saved school-portal session is a live credential we
   cannot rotate ourselves, so it must not outlive the account.
2. Delete `connection`, `incoming_email`, `family_inbox`, `gmail_token`, `family_memory`,
   `case_record`, `family_profile`, messages, `verification`, `child_link`, orphaned `student` rows,
   then the `guardian`.
3. Write **one audit row** recording what was deleted (counts + date) — the CCPA §1798.105(c)(2)
   suppression record, and what stops a re-import resurrecting the family. It keeps the family id and
   counts, never the family's content.

Each step is counted and reported, because a partial deletion that reports success is worse than one
that says exactly what survived.

## 5. Incident runbook

**Clocks (the whole point of this section):**

| Clock | Deadline | Source |
|---|---|---|
| **California → individuals** | **30 calendar days** from discovery | Civ. Code §1798.82 (SB 446) |
| **California → AG** | 15 calendar days **after** consumer notice, if >500 CA residents | AG sample notice |
| **New York → individuals** | **30 days**; no threshold, no nexus | GBL §899-aa |
| **Colorado / Florida / Maine** | 30 days | state statutes (CO PI expressly includes student ID) |
| **Internal decision gate** | **day 10–14**, named owner + legal review | Maryland (AG-first, no threshold) and Vermont (14 business days) |
| **FTC Health Breach Notification Rule** | **60 calendar days**; FTC notice **contemporaneous** with individual notice where 500+ in a state | 16 CFR §318.4(b) |
| **HIPAA/HITECH** | 60 days (only if we ever become a BA) | 45 CFR |

**"Discovered" means the first day it was known or reasonably should have been known to *any*
employee** — one engineer's suspicion starts the clock.

**Steps:** (1) contain — revoke the affected vendor keys and the portal profiles; (2) scope — which
tables, which families, which states, whether credentials or IEP/health-adjacent fields are involved;
(3) decide within 10–14 days with the named owner and counsel; (4) notify per the table, by the
channels the rules require (**HBNR notice is not valid by iMessage** — it requires email plus text,
or postal mail; collect mailing addresses at onboarding for this reason); (5) write the
post-incident note and fix the control.

**The three failures behind the $5.1M Illuminate settlement** — unnamed in our plan until now, and
cheap: **terminated-employee credentials never revoked**, **no alerting on suspicious logins**, and
**backups not segregated from production**. All three are Tier-1 operational items, not policy
theatre.

## 6. What we cannot delete, and why we say so

- **Provider abuse/safety copies.** Anthropic deletes inputs/outputs within ~30 days by default, but
  retains Usage-Policy-violation content longer (and classifier scores longer still) **even under a
  zero-retention agreement**. OpenAI retains abuse logs up to 30 days and CSAM-flagged images for
  manual review even under ZDR.
- **Skyvern artifacts.** Skyvern has **no API to delete runs or artifacts** (only browser profiles),
  and keeps per-step screenshots and session video until asked. This is why we (a) send it the
  minimum, (b) treat its artifacts as a disclosed retention, and (c) will negotiate ZDR or self-host
  before scale.
- **Encrypted backups.** Purged on a rolling cycle; delayed deletion for backups is expressly allowed
  (11 CCR §7022(d)) and we state the cycle rather than claiming immediate erasure.
- **Email already sent to a school.** Cannot be recalled. We say so.

## 7. Subprocessor list (published; reviewers look for this first)

| Provider | Purpose | Data category |
|---|---|---|
| Anthropic | language model (replies, research, planning) | message content, family context |
| OpenAI | browser page understanding (Stagehand) | page content from sites the agent reads |
| Skyvern | browser automation; portal session custody | form values, page content, saved portal session |
| Browserbase | browser hosting | browsing session (recording disabled) |
| Tavily | web research | school/district queries |
| Resend | outbound email when Gmail isn't connected | recipient, subject, body |
| Google | Gmail (send + read, parent-authorized), Calendar | mailbox content, calendar |
| Retell | voice calls | call variables, audio/transcript on their side |
| Supabase | database | all family records |
| Railway | hosting + application logs | logs (PII-redacted) |
| Vercel | website, inquiry/waitlist forms | contact details |

**DeepSeek is not on this list** — it is gated behind `ALLOW_FOREIGN_MODEL_FALLBACK` and off by
default, because its own terms prohibit children's and health data and it stores in the PRC.
**To do:** DPAs with each; Anthropic's DPA **Schedule 1 currently declares "None" for special
categories**, which is wrong for IEP/health-adjacent content — amend it or keep that content out of
the API. Subprocessor objection windows are short (Supabase 5 days, Anthropic 15, Resend 14), so
vendor review runs **quarterly**, not annually, with a named owner and a monitored alias.

## 8. Where this leaves the Tier plan

Everything in `SECURITY-PRIVACY-READINESS.md` §5 stands, with these changes from the research:

**Add to Tier 1:** turn off browser recording *(done)*; encrypt mailbox tokens *(done)*; gate the
foreign provider *(done)*; complete deletion *(done)*; webhook freshness *(done)*; the three
Illuminate controls (offboarding, login-anomaly alerting, backup segregation); amend or replace the
Anthropic DPA instrument; and **start dated quarterly access reviews now**, because SOC 2 evidence
cannot be back-filled.

**Move up:** a **vulnerability-disclosure policy + `security.txt` + safe-harbour language** — of ~20
competitors reviewed, essentially none have one, and it is the cheapest credibility in the category.

**Add to Tier 2:** **CoSN's K-12CVAT** (the questionnaire K-12 districts actually hand a vendor —
HECVAT is the *higher-education* tool; pre-fill both, K-12CVAT first), 1EdTech TrustEd Apps
data-privacy certification (achievable pre-SOC 2 and education-specific), and a two-page ADMT/risk-
assessment screening for the IEP and benefits surfaces from 1 Jan 2027.

**Add to Tier 1, and it is the best value per dollar in this document:** a documented **HIPAA risk
analysis** (NIST SP 800-30 structure is fine). 45 CFR 160.103 enumerates **"benefit management"** as
a business-associate function, so routing plan-sourced PHI through benefits navigation makes us a BA
by default — we cannot escape it by calling ourselves "navigation". OCR's *BST & Co.* resolution
(2025, $175k + a two-year corrective action plan) was charged for **the absence of an accurate risk
analysis**, not for a breach. Write it before the first BAA, and keep the parent-direct and
plan-sourced data planes separate.

**Insurance we will be asked to carry** (borrowed from real public-sector and school contracts, not
from employer-benefits norms — no fetchable family-benefits RFP publishes dollar minimums): CGL
$1M/occurrence–$2M aggregate, **cyber $2M per claim in force through the term and ≥1 year after**,
E&O $1M/$3M, employers' liability $500K, district named additional insured, primary and
non-contributory, 30-day cancellation notice, carrier A.M. Best A- or better — **and insurance
flow-down to every subprocessor**, which is a question to ask our vendors before a district asks us.

**Drop:** HITRUST unless a health buyer appears; the Student Privacy Pledge (retired 25 Apr 2025);
and any claim built on "NDPA v3.0", "CSoDA", or AB 1584's "72-hour" breach notice (that clock is
contractual, not statutory).

## 9. Corrections ledger

Kept deliberately, because we have already published some of these internally:

| Do not say | Correct position |
|---|---|
| "FTC HBNR: 10 business days" | **60 calendar days**; FTC notice contemporaneous where 500+ in a state |
| "Preventive care is all we need to worry about" | IEP/504 status and housing instability are the highest-stigma fields we hold; McKinney-Vento requires the living-situation flag be treated as an education record, never directory information |
| "AB 1584 requires 72-hour breach notice" | It requires only a *description* of notification procedures |
| "RCW 19.373.910" (WA My Health My Data private right) | No such section; enforcement is via RCW 19.373.090 |
| "MA WISP is required for us" | MA "personal information" excludes medical/health data; keep the WISP as a blueprint |
| "HITRUST-ready" | Not a designation. A real certification has a version, a named assessor, an issue date and an expiry |
| "Our RLS protects children's records" | Only against API clients — the service key bypasses RLS (see §2.4) |

# Enterprise-ready, fast: the plan

October 2026. How Axolotl gets from today's agent and website to something a
union fund's (or a public plan's) general counsel, CFO and IT lead will sign.
Companion to the tech stack note in chat and to `FUNDS-LEAK-SCAN.md`.

Cost and time figures are estimates to check against real quotes.

## What "enterprise-ready" means to a fund

A fund approves a vendor when six people say yes:

| Who | What they need to see |
|---|---|
| **General counsel** | Business associate agreement (BAA), master services agreement (MSA), data limits, liability, insurance |
| **IT / security** | SOC 2 report (or a credible path to one), HIPAA program, penetration test, encryption, access control, a completed security questionnaire |
| **CFO** | Clear fees, savings they can verify in their own books, invoices that match approvals |
| **Operations / member services** | It won't flood their phones. Escalations, and who answers members |
| **Trustees** | It protects members, the union can stand behind it, and it's legal |
| **Members** | They trust the letter and the text, and nothing happens without their yes |

## The two shortcuts that make this fast

**1. Run the free scan on de-identified data, so no BAA is needed yet.**
- HIPAA's Safe Harbor method lets a fund share data with no protected health
  information once 18 identifiers are removed. That leaves birth year and
  3-digit ZIP; no names or exact dates.
- The scan needs only:
  - birth year
  - single or couple, if known
  - pension amount (or band)
  - yearly Part B reimbursement
  - a random ID only the fund can map back
- So the fund can send that file, or run our script itself, without a BAA.
- The result is a dollar figure in weeks, not months. *Confirm the exact field
  list with HIPAA counsel.*

**2. Run the first pilot as a letter-only pilot, so no fund data moves at all.**
- The fund mails its own letter to the retirees it reimburses for Part B:
  "Text this number for free help."
- Members text in, and give us their information themselves, with consent.
- The fund only needs to learn who got approved, to stop its reimbursement,
  and the member authorizes that.
- That keeps the first pilot to the smallest possible data flow. The full
  data-driven version waits for SOC 2 and a signed BAA.

These two moves let Act 1 start **while** the compliance work is still under
way, instead of after it.

## Phase 1: Foundations (weeks 0–2)

- [ ] **Company and contracts**
  - Delaware C-corp, founder vesting, IP assignment.
  - Templates from counsel: an MSA and a BAA, plus the one-page free-scan
    agreement (non-binding offer + de-identified data terms).
  - *About $15–40K in legal fees, estimated.*
- [ ] **Insurance quotes:** cyber liability ($1–5M) and errors & omissions.
  *About $10–30K a year, estimated.*
- [ ] **Compliance platform:** sign up for one (Vanta, Drata or similar) with
  HIPAA and SOC 2 templates, then pick an auditor.
  *Platform about $10–25K a year, Type I audit about $10–20K, estimated.*
- [ ] **Vendor decisions: who will sign a BAA?**
  - Database and hosting: Supabase on its HIPAA plan, or a major cloud.
  - Anthropic API: confirm BAA terms.
  - Fax, e-signature, and mail (e.g. Lob).
  - **Photon:** if it won't sign, texts carry no health or income details,
    and those steps move to a secure link.
- [ ] **One owner for security and compliance** (a founder, for now).

**Gate:** we can sign a free-scan agreement and accept a de-identified file.

## Phase 2: Scan-ready (weeks 2–6)

- [ ] **Secure intake**
  - Encrypted upload or secure file transfer (SFTP).
  - Each client's data kept separate.
  - Automatic deletion after the scan, unless the fund signs on.
- [ ] **Rules engine v1, in code (no AI)**
  - New York QI-1 and QMB, Extra Help deeming, and the fund's
    Part-B-reimbursement rule.
  - Versioned by year, with tests built from cited sources (2026 figures in
    `FUNDS-PROBLEM-VERIFICATION.md`).
- [ ] **Scan report generator**
  - Counts, dollars a year, and low/base/high ranges.
  - A methods page with sources.
  - Every figure traceable to a rule and a field.
- [ ] **Baseline security**
  - MFA everywhere, least-privilege access, audit logging, encrypted backups.
  - Written HIPAA policies and a risk assessment (from the platform's
    templates).
  - Staff training.
- [ ] **Security questionnaire library:** answers to a standard questionnaire
  (e.g. SIG Lite) ready to send.

**Gate:** we deliver a scan report on a real fund's de-identified file.

## Phase 3: Pilot-ready (weeks 6–12)

- [ ] **Case tracking.** Stages: identified → contacted → screened → yes →
  sent → pending → approved or denied → renewal due. Deadlines, retries and
  handoff to a person.
- [ ] **Member channel**
  - The fund's letter, mailed through a print API or by the fund.
  - Inbound texting, with SMS sender registration (10DLC) so carriers don't
    block messages.
  - One-word opt-out. English and Spanish.
  - Voice fallback for members who'd rather talk.
- [ ] **Safety gate on every send.** Nothing goes out without a clear YES.
  - Decided by a calibrated check (Jev, after go-ahead) with a strict
    threshold. Anything uncertain goes to a person.
  - The target is **zero** sends without a clear yes, measured in testing.
- [ ] **New York premium-help filing adapter**
  - Fills the application.
  - Uses the signature method the county or HRA (NYC's Human Resources
    Administration) actually accepts: e-signature, fax or mail. *Verify.*
  - Gets a confirmation for every send. "Done" means confirmed.
- [ ] **Outcome tracking**
  - Approvals come from state notices or the member's letter.
  - Each approval triggers a billing event, a line on the fund's monthly
    report (totals only), and a "stop reimbursing this member" file for the
    fund, with the member's authorization.
- [ ] **Member advocate console v1.** The founders use it during the pilot.
  A simple internal admin tool: queue, case view, documents, notes, audit
  trail, and minutes logged per case.
- [ ] **SOC 2 Type I report** in hand, and a third-party penetration test done
  and fixed. *Pen test about $10–25K, estimated.*
- [ ] **Incident response plan**, tested once.

**Gate:** we sign an MSA and BAA and run the letter-only pilot end to end.

## Phase 4: Enterprise-ready (months 3–9)

- [ ] **SOC 2 Type II.** The 3–6 month observation window starts right after
  Type I.
- [ ] **Fund dashboard**
  - Totals, savings ledger and invoices.
  - Single sign-on (SSO) for fund staff.
  - Exports.
- [ ] **Data-driven outreach under the BAA**
  - Full eligibility, claims and reimbursement intake, mapped per client by
    config.
  - The first administrator (TPA) integrations.
- [ ] **Second rule pack:** another state, or a public plan's 100%
  reimbursement.
- [ ] **Disability-to-Medicare module**, for plans that keep disability
  retirees on coverage. Counsel signs off on how a fund may pay us for SSDI
  help (third-party fee path, SSA-1696-U4), or we partner with
  Allsup or SSDC.
- [ ] **Uptime and recovery:** monitoring, disaster recovery, and a
  service-level agreement in the MSA.
- [ ] **Quarterly reporting** to trustees, and a yearly independent check of
  the savings method.

**Gate:** we pass a public plan's security review and sign client #2 or #3.

## How AI speeds this up

- **Claude Code**
  - Builds the rules engine from cited sources, with the tests.
  - Builds intake mappings, filing adapters and the console.
  - Generates synthetic test members (the repo's `testworld` and evals).
- **Research agents** verify every rule and figure before it ships. Each
  needs a source and a date.
- **The compliance platform**, plus Claude, drafts policies, the risk
  assessment and questionnaire answers. A founder reviews and owns each one.
- **Jev** (after go-ahead) supplies the calibrated YES and intent checks, so
  the safety bar is a measured number, not a promise.
- **People approve every rule pack, adapter and policy.** AI proposes, the
  rules decide, the member consents, a person checks anything uncertain.

## What it costs and who does it (estimates)

- **Phases 1–3 (about 12 weeks):**
  - People: the two founders. **The founders are the human in the loop through
    the pilot.** At about 10–20 human minutes per approval, 300–500 approvals
    is about 50–170 hours over several months.
  - Cash: about $60–130K across legal, insurance, compliance platform,
    Type I audit and pen test. That fits in a YC or PearX check.
- **Hiring a member advocate is triggered by volume, not by a date:**
  - part-time at a steady 40–50+ cases a week
  - full-time at about 100+ a week, or when a second client goes live
- **Track human minutes per approval** as a core metric. Every handled case
  should feed back as a rule fix, a better script or a Jev threshold, so the
  number falls.
- Add a contract security or compliance advisor as client count grows.

## The critical path

**Counsel templates (MSA, BAA, scan agreement) and the de-identified-data
field list** → **first scan** → **letter-only pilot** → **SOC 2 Type I** →
**BAA-backed data pilot**.

Everything else can run in parallel.

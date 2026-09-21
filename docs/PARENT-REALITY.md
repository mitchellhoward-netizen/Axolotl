# Parent reality — the evidence base

**What this is.** Every quantitative and qualitative finding about what parents actually face that was
gathered during the research passes in this project, gathered in one place so the copy can be
specific instead of generic. The website currently says "reads your kid's school email", which is
true and weightless. The numbers below are what make the same claim land.

**How to read the sourcing.** These figures were recorded in a research conversation. Almost all of
them are **second-hand**: the research pass named a source, but nobody in this project has opened that
source and checked the number. Every row carries a confidence marker:

| Marker | Means |
|---|---|
| **sourced** | The conversation recorded a named source (organisation, publication, or the company itself) |
| **vendor** | The number is the company's own claim about its own product |
| **estimate** | The conversation explicitly flagged it as an estimate or inference, not a measurement |
| **derived** | Arithmetic from other rows in this document, not a figure anyone published |
| **ours** | Measured by this project, on our own fixtures. **Not** evidence about the real world |
| **unverified** | No source recorded. Do not publish without finding one |

**The rule for copy:** never round a number, never move a decimal, never state one to a parent that is
marked *unverified*. Use the figure, cite the source in this doc, and if a writer wants a number that
is not here, the answer is a research task, not a guess.

**One scope note, so copy does not drift.** The product is a **school** agent for parents. Benefits
figures (backup care, EAP, FSA) appear below because they are evidence of the **admin burden** and of
how badly *funded* help fails to reach families — not because the product sells benefits. That work is
parked (`BENNY_IMESSAGE_ENABLED=false`). Do not let a benefits stat drag the copy back.

---

## 1. Volume — how much school actually sends, and how little of it matters

| Figure | What it measures | Source as recorded | Confidence |
|---|---|---|---|
| **~8 per week** | School communications a family receives | Research pass; no primary named | unverified |
| **~1 per week** | How many a parent actually wants / needs to act on | Same pass | unverified |
| **≈87%** | Share of school communication that is noise | Derived from the two rows above (1 − 1/8) | derived |
| **93%** | Mothers who handle school admin alone | Kiki (competitor research) | sourced |
| **2–4 hrs/week** | Time spent on school admin | Kiki | sourced |
| **94%** | Parents who have forgotten a school event | Kiki | sourced |
| **12 of 16 (75%)** | School emails that were FYI rather than action, in our own fixture | `npm run test:triage`, 16 hand-labelled emails → 4 action items, recall 4/4 | **ours** (fixture, not a real inbox) |
| **~90%** | School messages that are not benefit-connected | Labelled an estimate in the conversation | estimate |
| **~3% / ~2% / <1% / ~5%** | Of the benefit-connected minority: health requirements / closures / special ed / money and camp | Same estimate | estimate |

**Why this matters for copy:** the 8 → 1 story is the whole product in one line, and it is the one
place our own measurement (16 → 4, 4/4 recall) genuinely supports the claim. But note the fixture is
ours: it demonstrates the *mechanism*, not the *rate* a real family will see.

---

## 2. The time tax — the arithmetic that makes the point

| Figure | What it measures | Source as recorded | Confidence |
|---|---|---|---|
| **37 vs 35** | School days off per year versus total available PTO days. "The math just does not add up." | Fortune | sourced |
| **64%** | Working parents who had a care breakdown that clashed with work | Research pass; no primary named | unverified |
| **200,000+ workdays/yr** | Workdays saved across Bright Horizons clients | Bright Horizons | vendor |
| **84%** | Backup-care users who could work when they otherwise could not | Research pass; no primary named | unverified |
| **~5%** | Employers that offer backup care | SHRM via US Chamber Foundation | sourced |
| **7% / 2%** | Employers offering on/near-site childcare / childcare subsidies | Same | sourced |
| **~10%** | Utilisation of backup care where it *is* offered (Best Buy: 1,400 enrolled → ~150 used it one day) | Same | sourced |
| **~$4B/yr** | FSA money forfeited by families | Research pass; no primary named | unverified |
| **12–20 wks** | Paid parental leave at large tech employers (Netflix: 12 months) | Research pass, composite | unverified |
| **$20–75K / $10–40K** | Fertility benefit / adoption and surrogacy benefit at large tech employers | Same | unverified |
| **90–100%** | Share of premium covered at large tech employers | Same | unverified |
| **10–20 days/yr** | Backup care days offered | Same | unverified |
| **~$5K / $500–2,000 / $10–12K** | DCFSA / wellness LSA / tuition benefit | Same | unverified |
| **absent** | School coordination in every big-tech benefits package examined | Research finding, not a number | sourced |

**The two facts worth building a paragraph on.** (a) **37 > 35** — there are more days off school than
a parent has holiday. (b) **~5% offered, ~10% used** — the help that exists mostly does not reach
people, which is the same failure as the unread school email, one layer up.

---

## 3. The money tax — what expertise costs when you have to buy it

| Figure | What it measures | Source as recorded | Confidence |
|---|---|---|---|
| **$80–250/hr** | Educational advocate | Research pass; no primary named | unverified |
| **~$300–800** | Cost per IEP meeting with an advocate | Same | unverified |
| **~$4B/yr** | FSA money that expires unused (also the money tax, not just the time tax) | Research pass; no primary named | unverified |

**A gap to be honest about:** the brief for this document asked for tutoring and private evaluation
costs. **No figures for either appear anywhere in the research record.** Do not invent them; if the
copy needs them, that is a new research task. The same applies to legal fees beyond the advocate
hourly rate above.

---

## 4. The entitlement gap — the heart of the thesis

This is the section the product exists for: **things children are entitled to, that families
frequently do not receive, because getting them requires knowledge and admin the system assumes a
parent has.** All categories below were recorded in the conversation; the statutory citations are as
recorded, not re-read from the statutes.

| Entitlement | The rights and programmes recorded | Where the record came from |
|---|---|---|
| **Evaluations and IEP / 504** | IDEA, 20 U.S.C. §1400 (FAPE, IEP); Section 504, 29 U.S.C. §794 (accommodations) | Compliance research, quoting the statutes |
| **Accommodations agreed but not implemented** | The recorded pattern: an accommodation is written into a plan and then not delivered in the classroom | Strategy discussion (qualitative, see §5) |
| **Displaced and unhoused families** | McKinney-Vento, 42 U.S.C. §11432(g)(1)(J): right to transportation to the school of origin, on the parent's request. §11432(g)(3)(G): the child's living situation **must be treated as an education record and never as directory information** | Compliance research |
| **Meals** | National School Lunch Program, 42 U.S.C. §1758 (free and reduced-price meals) | Compliance research |
| **Language access** | Title III, 20 U.S.C. §6811 and the EEOA: language instruction and translated communication | Compliance research |
| **Enrollment** | State education codes and Title VI: immediate enrollment rights | Compliance research |
| **Bullying and safety** | Title IX and California Ed Code §234: right to report and request a safety plan | Compliance research |
| **Enrichment that goes unfilled** | California's ELO-P; 21st Century Community Learning Centers; free and reduced-price meals — presented in our own product as *generally available* baseline programmes whose presence at a specific school is **not confirmed** | `docs/CAPABILITY-TRUTH-TABLE.md` item **M7** |
| **Transportation** | Bus eligibility, McKinney-Vento transport, district routes | Product's school-domain tools |

**The two facts that carry the thesis.**

1. **The housing-instability flag is a legal category, not a marketing one** — McKinney-Vento requires
   it be kept as an education record, which is why our own compliance doc says to segregate it, restrict
   it, and never default it into a school share. **This is also the highest-stigma field the product
   could hold.**
2. **Our own truth table admits where we overstate this gap** — item **M7** says baseline programmes
   are presented "even if live research is thin", so a parent can hear a programme name as if it were
   confirmed at *their* school. Any copy about the entitlement gap must not repeat that mistake. See
   `docs/CAPABILITY-TRUTH-TABLE.md` for the honest version of each promise.

---

## 5. The emotional reality

**Everything in this section is qualitative.** It is our own framing from the strategy conversation,
not research. Label it as interpretation when it reaches copy; do not dress it as a finding.

- **The asymmetry.** *The school has staff, a filing system, and office hours. The parent has an
  evening.* This is the single most useful sentence for the problem section, and it needs no citation
  because it is a description, not a statistic.
- **"Did I miss something?"** The anxiety is not about any one email; it is the standing background
  worry that something with a deadline went past unread. The product's job is to end that specific
  feeling, not to be a chatbot.
- **The process is the problem, not the people.** Teachers and office staff are usually trying to help
  inside a system that runs on paperwork. Copy that sounds adversarial toward schools is both wrong and
  commercially stupid.
- **The user's own words about the thesis**: *"a real liaison, a real helper to get the most out of
  school, simplify the complexity."* And the complaint that prompted this document: *"it lost the full
  thesis."* Those two sentences are the brief for the copy.
- **Coordination tax.** The cost is not any single task; it is holding the whole picture — dates,
  forms, who to ask, what was promised — in one person's head.

---

## 6. What the alternatives cost parents today

| Alternative | What it does | What it costs / what it does not do | Confidence |
|---|---|---|---|
| **Human educational advocate** | Represents the parent in the IEP process | **$80–250/hr, ~$300–800 per meeting**; the parent still does everything else | unverified (same rows as §3) |
| **Wellthy** | Human care coordinator, employer-paid | **$450/mo per employee**, paid by the employer, so a parent only gets it if their employer bought it | sourced |
| **Cleo** (hicleo.com — *not* meetcleo.com) | Employer-paid family support with human "Guides"; covers childcare, enrichment, camps, neurodivergence, teen-to-college; claims HITRUST i1 and SOC 2 Type 2 | Badges on its trust page all link to a **single 2023 blog post** with **no auditor named** and **no encryption claim**; `security.txt` 404s, i.e. **no vulnerability-disclosure policy** | sourced, with the caveats as recorded |
| **Bright Horizons** | Backup care at scale | Vendor claim of 200,000+ workdays saved/yr; the ~5% offer rate and ~10% utilisation are the relevant context | vendor |
| **Maven Clinic** | Family and maternal health | $1.7B valuation; claims "HITRUST Certified" with **no framework version, date, assessor or certificate ID** — the four fields a real certification has. Treat as unverified | sourced, claim unverified |
| **Kiki** (getkiki.app, Wren Games Ltd, UK) | Reads and summarises school email — **read-only** | Processes only mail from **senders the parent approves**, and does not read the whole inbox; retains approved email **3–18 months** by tier; deletes account data **within 90 days** and backups **within 180**; treats SEND and medical-absence mail as **GDPR Art. 9 special category** data on explicit consent; stores UK/EU with some US processing under SCCs; claims **Cyber Essentials**. Pre-launch | sourced |
| **Fambot** (fambot.com) | Launched ~1 Sept 2026. "AI chief of staff for families": school emails → a daily plan by text | Publishes a per-subprocessor trust page but **no SOC 2/ISO claim**, and **explicitly refuses to act**: *"Fambot never sends emails on your behalf."* | sourced |
| **Instinct** (instinct.com) | **Corrected in the research:** this is *not* a school or benefits agent. It is a horizontal personal assistant with **default-on model training** and the opt-out buried in app settings; no trust page, no SOC 2/ISO/HIPAA claim | — | sourced, with the correction applied |
| **The status quo** | A babysitter, a spreadsheet, a kitchen calendar, and memory | The real competitor. Cost is the parent's evenings and the missed thing | qualitative |
| **Negative finding** | **No product was found that both writes and sends school email on a parent's behalf *and* signs into parent portals read-only.** Ohai.ai, Cozi, Propel and AidKit publish no trust page at all | This is the gap, and it is also the part that raises the security bar | sourced |

---

## The five facts I would lead with

Ranked by how efficiently they make a parent say *that's me*, with the sentence to actually write.

**1. 37 school days off versus 35 days of PTO.** *(Fortune — sourced)*
> "There are more days off school than you have holiday. The arithmetic does not work, and it never
> has — you have just been absorbing the difference."

**2. Eight messages a week; about one that needs you.** *(~8 and ~1 unverified; ≈87% derived)*
> "School sends about eight things a week. Roughly one needs you. The other seven are the reason you
> miss it — and finding that one is a job nobody gave you."

**3. 93% of mothers do school admin alone, 2–4 hours a week, and 94% have missed an event.** *(Kiki — sourced)*
> "You are not disorganised. You are one person doing work the school has a whole office for."

**4. Only ~5% of employers offer backup care — and even there, about 10% use it.** *(SHRM via US Chamber Foundation — sourced)*
> "Even the help that exists mostly does not reach anybody. Using a benefit is another form to find,
> and that is the same problem as the unread email."

**5. Expertise the system assumes you have costs $80–250/hour.** *(unverified — verify before publishing)*
> "When you cannot get an answer, you can rent one: an advocate runs $80 to $250 an hour. The system
> assumes you already know how to do this."

**If only one sentence is available**, use #1. It is sourced, it is arithmetic rather than
interpretation, and it reframes the parent's exhaustion as structural rather than personal — which is
the entire thesis in one line.

---

## Needs verification before publication

Nothing in this list should reach a parent-facing page until someone opens the source.

**No source recorded anywhere in the research (quarantined):**
- ~8 school communications per week, and ~1 that needs action
- 64% of working parents had a care breakdown clashing with work
- 84% of backup-care users could work when they otherwise could not
- ~$4B/yr in forfeited FSA money
- $80–250/hr educational advocate; ~$300–800 per IEP meeting
- The composite big-tech package figures: 12–20 weeks leave (Netflix 12 months), fertility $20–75K,
  adoption/surrogacy $10–40K, 90–100% premium, 10–20 backup days, DCFSA ~$5K, wellness LSA
  $500–2,000, tuition $10–12K
- The benefit-connected composition estimate (~90% / ~3% / ~2% / <1% / ~5%)

**Sourced second-hand but not re-read** (named source, unopened by anyone here): the SHRM/US Chamber
Foundation figures, the Fortune 37-vs-35 arithmetic, the Best Buy utilisation detail, and every Kiki
figure.

**Corrections already applied in this document** (do not revert to the earlier versions):
- **Instinct** was initially described as a school/benefits agent. It is a horizontal personal
  assistant. Do not position against it as a school product.
- **Cleo is hicleo.com**, not meetcleo.com (that is a UK budgeting app).
- The claim once floated as ours — *"we delete everything within 30 days"* — is wrong; 30 days is a
  provider default with safety-retention exceptions. Irrelevant to parent-reality figures, and recorded
  here only because it appeared beside them.

---

## What this document deliberately does not contain

- **Product capability claims.** Those live in `docs/CAPABILITY-TRUTH-TABLE.md`, which maps every
  promise to the code that backs it — including the ones marked **MUST CHANGE**.
- **Reliability figures.** Those live in `docs/RELIABILITY.md`: the fill path measured 5/5 by vendor
  self-report (an upper bound, field-level correctness unverified), the end-to-end submit number is
  **invalid** pending a re-run, and there is no warm path yet.
- **Benchmark numbers from the browser-agent research** (ClawBench 33.3%, HealthAdminBench 36.3%
  end-to-end versus 82.8% subtask). They are in `docs/COMPUTER-USE-SOTA.md`. **Do not put them on the
  website, and do not mix them with parent-reality figures** — they measure a different thing on a
  different population, and they cut against us.
- **Legal and compliance positions.** `docs/PRIVACY-AND-COMPLIANCE.md` and
  `docs/SECURITY-PRIVACY-READINESS.md`. The entitlement citations in §4 are the statutory hooks for
  the product's school domain, not legal advice.

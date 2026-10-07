# Reviewer guide

This is the starting point for benefits experts reviewing the rules archive.
It ranks every playbook and state part from most to least trustworthy and
says where to look first. Each state part also has its own `REVIEW.md` with
its assumptions, weakest parts and questions for an expert in that state.

Built 2026-10-07 in two passes. The first pass built everything. The second
pass went back to the gaps that most limited trust (see "Second pass" below).
It covers 7 playbooks × (federal base + New York, California, Illinois): 514
rule statements, 490 synthetic households, 444 sources with saved snapshots.
Validation reports 0 errors and 0 warnings, and all 540 tests pass. There are
364 PolicyEngine US comparisons, and every difference is explained.

## How to review a part

1. Open the part's `playbook.yaml`. Each rule has a `statement`, a
   `confidence`, and `sources` with a `locator`. Check the statement against
   the saved snapshot in `playbooks/<program>/snapshots/<source-id>/`.
   `manifest.yaml` there says when and how it was fetched.
2. Read `conflicts:` and `open_questions:` (sorted by `priority`) in the
   same file.
3. Run the households: `python -m pytest playbooks/<program>`. Each test
   case names the rules it expects to fire. `crosscheck/results/<program>.md`
   compares the same households with PolicyEngine US.
4. Read the state's `REVIEW.md` questions and answer the ones you can.

Confidence labels: **confirmed** means a primary source states it.
**secondary** means only a secondary source supports it. **unresolved**
means it is not established, and the open question it names says why.
Evaluations that hit an unresolved number return `undetermined`, never a
guess.

## Ranking: most to least trustworthy

The ranking is a judgment, not a formula. It weighs the share of confirmed
rules, open high-priority questions, open source conflicts, how many sources
had to be fetched by hand because the agency site blocks scripts (the weekly
job cannot re-check those), and the PolicyEngine results. Rule counts are
federal + state part (confirmed / secondary / unresolved in the state part).

### Tier A: reliable; spot-check

| # | Playbook / state | Rules | Open high OQ | Open conflicts | Why it ranks here |
|---|---|---|---|---|---|
| 1 | Turning 65, New York | 46 + 5 (5/0/0) | 0 | 1 | Almost all federal (CFR, U.S. Code, SSA POMS, CMS). PolicyEngine agrees on every premium/IRMAA case. NY Medigap rights come from Insurance Law 3231. |
| 2 | Turning 65, Illinois | 46 + 4 (4/0/0) | 0 | 0 | Birthday rule read in 215 ILCS 5/363(8) and Public Acts 102-0142 / 103-0747: ages 65-75, 45 days, affiliates from 2026. |
| 3 | Turning 65, California | 46 + 4 (4/0/0) | 0 | 0 | Birthday rule read in Insurance Code 10192.11 (Legislature bulk data): 60 days, no age limit, from 2020 (30 days before). |
| 4 | Medicare Savings Program, New York | 31 + 22 (19/3/0) | 1 | 2 | 2026 standards from DOH GIS charts. Buy-in mechanics, refunds and the SSA buy-in notice now come from SSA POMS and the CMS buy-in manual. Our federal-minimum logic matches PolicyEngine on 19 of 20. Open: how many months until the deduction stops; the QMB start-month conflict. |
| 5 | Disability (SSI), California | 40 + 12 (12/0/0) | 0 | 0 | SSP levels from SSA POMS, confirmed by CDSS. Federal SSI matches PolicyEngine in every case. |
| 6 | SNAP (CalFresh), California | 34 + 9 (9/0/0) | 0 | 0 | CDSS ACLs and FNS tables. |
| 7 | School meals, California | 23 + 13 (13/0/0) | 0 | 0 | Federal Register guidelines; Education Code 49501.5 and 42238.01. CDE pages need a hand re-check (the site blocks scripts). |
| 8 | School meals, New York | 23 + 9 (9/0/0) | 0 | 0 | Education Law 915-a now from the Senate's official text; NYSED memos. |
| 9 | School meals, Illinois | 23 + 8 (8/0/0) | 0 | 0 | Healthy School Meals for All confirmed **not funded** in FY2026 or FY2027 (Public Acts 104-0003 and 104-0464), so federal categories apply. |

### Tier B: sound, with named weak spots

| # | Playbook / state | Rules | Open high OQ | Open conflicts | Weak spots |
|---|---|---|---|---|---|
| 10 | Medicaid, New York | 27 + 23 (23/0/0) | 1 | 1 | Excess-resource spenddown rests on 2011 Reference Guide pages. Which group gets one retroactive month in 2027 conflicts (NYSoH vs statute). |
| 11 | Long-term care Medicaid, New York | 28 + 15 (14/1/0) | 1 | 0 | Whether the 30-month community look-back is in force rests on a law firm only. |
| 12 | SNAP, Illinois | 34 + 12 (12/0/0) | 0 | 2 | Standard medical deduction $185 (IDHS manual) vs $150 (Admin Code copy). The IDHS standard deduction is $4 below FNS, reason unknown. |
| 13 | Disability (SSI), Illinois | 40 + 13 (12/0/1) | 2 | 0 | Several AABD allowances are undated; pension/VA treatment unknown; the ineligible-spouse case is undetermined. |
| 14 | Medicaid, Illinois | 27 + 18 (16/0/2) | 2 | 1 | 2026 standards now dated January 1, 2026 (Manual Release 26.11); AABD earned-income rule from 89 Ill. Adm. Code. Open: the order of the $25 disregard, and a non-applying spouse's wages. |
| 15 | Long-term care Medicaid, Illinois | 28 + 15 (14/0/1) | 1 | 0 | Assets over $17,500 handled as a first-month spenddown is a reading of two manual sections. |
| 16 | Medicare Savings Program, Illinois | 31 + 18 (17/0/1) | 1 | 5 | IL disregards $25. The AABD earned-income rule may be stricter than the federal SSI floor. Boundary wording conflicts across manual sections. Caseworkers' 90-day expectation for buy-in. |
| 17 | Medicaid, California | 27 + 24 (23/0/1) | 1 | 1 | Re-sourced from 19 DHCS letters, but every one was fetched by headless browser, so the weekly job cannot re-check them. The 2027 letters are marked preliminary by DHCS. Treating new refugee applicants as eligible reads two letters together. |

### Tier C: use with care; review before the agent relies on it

| # | Playbook / state | Rules | Open high OQ | Open conflicts | Why |
|---|---|---|---|---|---|
| 18 | Medicare Savings Program, California | 31 + 22 (19/0/3) | 1 | 5 | All 20 DHCS sources hand-fetched. Open conflicts: when 2026 standards start (March 1 vs April 1), "less than" vs "or below", and the QMB start month. Whether Medi-Cal eligibility bars QI is open. Buy-in "up to 4 months" (ACWDL 26-12). |
| 19 | Long-term care Medicaid, California | 28 + 16 (14/0/2) | 1 | 2 | CA's transfer rules differ in substance from federal. Home equity before 2028 is unresolved. The CSRA is assumed at the maximum. The $35 PNA rests on a 2001-02 Q&A. |
| 20 | Disability (SSI), New York | 40 + 9 (7/1/1) | 1 | 2 | otda.ny.gov refused every route in both passes. The 2014 transfer and the absence of an SSP application are supported by 18 NYCRR Part 398, but only via a secondary copy. The payment day and the "90-day waiting period" are unknown. |
| 21 | SNAP, New York | 34 + 14 (8/5/1) | 1 | 5 | otda.ny.gov refused every route. FY2027 BBCE limits are confirmed (Erie County DSS). FY2027 utility allowances rest on two secondary sources (the OTDA directive GIS 26 DC045 is unread). 02 ADM-07 is unread and partly contradicted by 18 NYCRR 387.17. |

## Where to look first

1. **The months until the Part B deduction stops after MSP approval**
   (MSP-FED-OQ-06, MSP-NY-OQ-02). The mechanism, refund and proof notice are
   now sourced. The number of months is known only for California ("up to 4
   months", ACWDL 26-12) and as an Illinois caseworker expectation (90 days).
   For federal and New York, ask a practitioner.
2. **New York SNAP and New York SSI supplement (ranks 20-21).**
   - Needed from OTDA: GIS 26 DC045 (FY2027 utility allowances), 02 ADM-07,
     and an official copy of 18 NYCRR Parts 387/398.
   - otda.ny.gov blocks every automated route, so a person needs to download
     these.
3. **Effective-date conflicts.**
   - QMB start month: federal 1902(e)(8) says the month after determination;
     NY and CA practice say the month after application.
   - CA MSP standards from March 1 or April 1.
   - The SLMB/QI buy-in month: 42 CFR 407.47 vs POMS/CMS manual.
4. **Policy questions where the archive and PolicyEngine disagree for a
   reason that is not a modelling choice:**
   - California QI for people eligible for (but not enrolled in) Medi-Cal.
   - Illinois AABD earned income against the federal SSI floor (MSP).
   - California SSP for an ineligible spouse.
5. **Medicaid changes from Public Law 119-21 in 2027:** retroactive coverage
   1 or 2 months, 6-month renewals and work requirements for expansion
   adults. California's implementing letters are preliminary; New York's and
   Illinois' implementation is thin.

## Ten rules the archive is least sure of

| Rule | Why |
|---|---|
| MSP-FED-PROOF-SSA-DEDUCTION / MSP-NY-PROOF-SSA (timing) | How many months until SSA stops the deduction (federal, NY). The customer pays on this. |
| SNAP-NY-MSP-MEDICAL-FREEZE (and MSP-NY-SNAP-EFFECT) | 02 ADM-07 is unread. 18 NYCRR 387.17 supports "no need to report", not "no cut if reported". |
| SNAP-NY-SUA (FY2027 amounts) | Two secondary sources agree; the OTDA directive is unread. |
| MSP-IL-EARNED-INCOME-FLOOR | IL's AABD rule may be more restrictive than the SSI method federal law sets as the MSP floor. |
| LTC-CA-HOME-EQUITY | Unresolved: whether California applies the home-equity limit before 2028. |
| LTC-IL-RESOURCES | Excess assets as a first-month spenddown is an interpretation. |
| MSP-CA-QI-NOT-MEDI-CAL | Whether Medi-Cal eligibility, or share-of-cost Medi-Cal, bars QI. |
| MCD-CA (refugees from October 2026) | Eligibility of new refugee/asylee applicants reads ACWDL 26-13 with 25-13. |
| DIS-NY-SSP-PAYMENT | Payment day and the "90-day waiting period" in Part 398 are undefined; Part 398 read via a secondary copy. |
| MSP-FED-CONFLICT-01 (SLMB/QI buy-in month) | The regulation's wording puts it a month later than POMS and the CMS manual. |

## Claims from the earlier research

| Claim | Verdict | Primary source |
|---|---|---|
| 2026 poverty guideline for one person is $15,960 | Verified (effective Jan 13, 2026 unless a program sets another date) | Federal Register 2026-00755 |
| 2026 standard Part B premium is $202.90 | Verified | CMS fact sheet, Nov 14, 2025 |
| Retroactive Medicaid shortens from January 2027 | Verified: applications from Jan 1, 2027 get 1 prior month (expansion adults) or 2 (everyone else) | P.L. 119-21 sec. 71112 |
| QI is federally funded within capped allotments and cannot be combined with full Medicaid | Verified | 42 U.S.C. 1396u-3; 1396a(a)(10)(E)(iv) |
| NY has no MSP asset test; QMB 138%, QI 186% FPL; QMB $1,856 with $20 disregard; Extra Help automatic | Verified, with a correction: $1,836 is the 2026 QMB standard and $1,856 is the most *gross* income that qualifies after the $20 is deducted. QDWI does have a resource test. | NY DOH MSP page; GIS 22 MA/10, 26 MA/05; SSA POMS HI 03001.005 |
| NY asset limit for age/disability and LTC Medicaid about $33,038 | Verified (couple $44,796; excess can be spent down) | GIS 26 MA/05 chart |
| CA reinstated a Medi-Cal asset limit of $130,000 | Verified from DHCS letters: from Jan 1, 2026, non-MAGI only, +$65,000 per additional person, "at or under" qualifies. It also applies to the MSP ($195,000 couple) and long-term care | DHCS ACWDLs |
| CA alternative income forms count for LCFF if collected by October 31 | Partly verified: the form must be received by Oct 31 and the pupil enrolled on Census Day. The date is CDE guidance, not statute. The forms count for LCFF only, never for meals. | CDE guidance; EC 42238.01 |
| IL asset limit for age/disability and LTC Medicaid $17,500 | Verified: same for a couple; excess becomes a spenddown, not a denial | IDHS Policy Manual |
| IL and NY use Medicaid data to certify free meals only | NY verified. **IL refuted**: Illinois certifies free *and* reduced-price from Medicaid data (since SY 2022-23) | FNS demonstration table; NYSED memo; ISBE |

## Federal and state shares

Rule counts per part (federal / NY / CA / IL), and the share of rules that
are federal:

| Playbook | Federal | NY | CA | IL | Federal share |
|---|---|---|---|---|---|
| Turning 65 | 46 | 5 | 4 | 4 | 78% |
| Disability | 40 | 9 | 12 | 13 | 54% |
| SNAP | 34 | 14 | 9 | 12 | 49% |
| School meals | 23 | 9 | 13 | 8 | 43% |
| Long-term care Medicaid | 28 | 15 | 16 | 15 | 38% |
| Medicare Savings Program | 31 | 22 | 22 | 18 | 33% |
| Medicaid | 27 | 23 | 24 | 18 | 29% |

Rule counts understate the federal share of the *logic*. For SNAP, SSI and
school meals the federal code computes the benefit, and states change a few
numbers (about three-quarters federal). For Medicaid and the MSP, states
replace nearly every income standard, disregard and asset rule, so roughly
60-70% of what decides a state answer is state-specific.

## Conflicts between sources

There are 34 open conflict entries; each is in its part's `conflicts:` with
both claims and what the archive does meanwhile. The patterns:

- **Old manuals vs new directives.** NY Medicaid Reference Guide pages
  (1999-2012) vs GIS messages; SSA POMS still says "food and shelter" after the
  2024 food-ISM rule; the CMS State Medicaid Manual's 36-month look-back vs
  the DRA's 60; 42 CFR 411.162's 12-month ESRD period vs the statute's 30; 42
  CFR 435.915 not yet updated for 2027.
- **Regulation vs manual.** 42 CFR 407.47 vs POMS/CMS on the SLMB/QI buy-in
  month; 18 NYCRR 387.17 vs NYSOFA's description of 02 ADM-07.
- **"Below" vs "at or below" at a limit.** NY DOH page vs GIS for QI; CA 2026
  chart vs ACWDL 23-05; IL manual sections. Every playbook pins the at-limit
  case in a test.
- **Effective dates.** New poverty-level standards (CA March vs April); QMB
  start month; NY HEAP utility rule (November 1, 2025 vs July 4, 2025).
- **Agency table vs federal table, or two agency sources.** IL SNAP standard
  deduction $4 below FNS; NY utility allowances; IL SNAP standard medical
  deduction $185 vs $150; CA pregnancy coverage 138-213% FPL (county:
  pregnancy-only; DHCS: full scope).

## PolicyEngine US cross-check

| Playbook | Compared (NY / CA / IL) | Differ | Main reasons |
|---|---|---|---|
| Medicare Savings Program | 22 / 25 / 26 | 33 | PolicyEngine models only the federal 100/120/135% tiers. It does not model NY's 138/186% expansion, IL's $25 disregard, or CA's 2026 asset limit. It also infers Part A from age. |
| Turning 65 | 10 / 10 / 10 | 0 | Premiums and IRMAA only; PolicyEngine has no enrollment windows, penalties or coordination rules. |
| Disability (SSI) | 18 / 16 / 13 | 24 | Federal SSI agrees in every case. PolicyEngine's CA SSP and IL AABD tables stop at 2025, and it has no NY SSP. |
| Medicaid | 16 / 15 / 15 | 21 | No spenddown or share of cost in PolicyEngine. Stale NY senior parameters. Rounding of 138% limits. Strict "<" at the asset limit. |
| Long-term care Medicaid | 15 / 15 / 12 | 3 | PolicyEngine models only the home-equity limit (one national figure). |
| SNAP | 30 / 20 / 22 | 22 | BBCE limits computed without the published rounding. NY utility allowances. IL standard deduction. Missing FY2027 utility allowances. LIHEAP-based allowances. |
| School meals | 16 / 18 / 20 | 9 | CA universal meals applied to private schools. Categorical eligibility extended to a foster child's siblings. No CEP. Calendar year vs school year guidelines. |

Each difference is explained case by case in
`crosscheck/explanations/<program>.yaml` (`crosscheck/run.py` fails on an
unexplained one). PolicyEngine US is AGPL-3.0; the Atlanta Fed Policy Rules
Database is GPL-3.0. Neither is copied into the repository; see
`crosscheck/README.md`.

## Second pass (what changed)

- **MSP outcome proof.** Buy-in mechanics, the start month, refunds (SSA
  refunds every premium deducted for buy-in months, by separate check when
  processing is late) and the SSA buy-in notice now come from POMS HI
  00815.018/.039 and HI 01001.205, plus the CMS State Payment of Medicare
  Premiums manual. Timing: CA "up to 4 months" and IL 90 days (caseworker
  expectation). Federal and NY timing is still open.
- **California Medicaid** re-sourced from 19 DHCS letters; county handbooks
  demoted to secondary. Two cases moved from undetermined to eligible. No
  2026 dollar value changed.
- **New York** (otda.ny.gov still blocked): FY2027 BBCE limits confirmed;
  FY2027 utility allowances filled from two agreeing secondary sources; the
  HEAP rule date confirmed (November 1, 2025); NYSCAP, ESAP and the SSP
  transfer tied to 18 NYCRR (secondary copy). One evaluator fix: a single
  non-heating utility qualifies for the utility allowance.
- **Illinois:** Medigap birthday rule read in statute (conflict resolved; one
  secondary-source claim about notice timing corrected). 2026 Medicaid
  standards dated January 1, 2026, so IL cases from January to October 2026
  now get answers. The AABD earned-income rule is encoded from regulation.
  Healthy School Meals for All is confirmed unfunded.
- **California Medigap birthday rule** read in the Insurance Code: in force
  from 2020, not 2026 as first recorded.
- **New York school meals:** official Education Law 915-a text replaced a
  secondary copy.
- **Tooling:**
  - The fetcher adds two public intermediate certificates (nysed.gov and
    ilga.gov send incomplete chains; each certificate chains to a system
    root, and verification is never off).
  - It retries flaky CDNs (FNS answers 404 about half the time).
  - The change detector recognizes bot-block pages, hand-imported
    snapshots, and volatile regions such as news sidebars.
  - A failed re-fetch can no longer erase a same-day snapshot.
  - 16 duplicate source IDs were merged into one ID per URL, and the
    validator now flags duplicates.

## Keeping it current

- `python -m tools.check_changes` was run on 2026-10-07 over all 450 sources.
  The report is `reports/source-check-2026-10-07.md`.
  - **379 unchanged.**
  - **1 changed:** a heat-advisory banner on CDA's HICAP page; no rule affected.
  - **1 fetch failure:** an advocacy blog.
  - **69 manual.** These were imported via a browser, reader or bulk download
    because the sites block scripts, and need a person (or the same route) to
    re-check.
- `.github/workflows/rules-archive-sources.yml` runs the check every Monday
  and opens an issue when something changes.
- [YEARLY-CHECKLIST.md](YEARLY-CHECKLIST.md) lists every number that updates
  on a schedule. Parameters with no recorded cadence are flagged there.

## What to change before adding more states

- **Fix source access first.** 69 of 450 sources can only be re-checked by
  hand because dhcs.ca.gov, otda.ny.gov, aging.ny.gov, cde.ca.gov, ssa.gov,
  medicaid.gov and leginfo block scripts. Options: run a headless-browser
  fetcher in the scheduled job (it worked for DHCS), use agency data feeds
  where they exist (the California Legislature's bulk download worked for
  statutes), or run a human re-check queue. otda.ny.gov blocked even a real
  browser window, so it needs a person.
- **Move cross-playbook numbers into `shared/`:** Part A premium, IRMAA, Part
  D base premium, SGA, full retirement age, spousal impoverishment standards,
  2025 poverty guidelines and MSP tables (so 2025 dates can be evaluated).
- **Small schema and model additions requested by the workers:**
  - A pay-frequency field on income (school meals).
  - `migrant` / `runaway` / `homeless` benefit kinds.
  - A `turning_60` life event (SNAP's elderly age).
  - `open_question` on links.
  - Date-valued amounts (coverage start dates are encoded as floats today).
  - A facility region/cost field for nursing-home cases.
- **A state-template checklist.** For each new state: the MSP and Medicaid
  standards chart, the FPL switch date, the SSP/supplement type, 1634 vs
  209(b), BBCE thresholds, utility allowances, the Medicaid direct
  certification type, universal meals, and the Medigap birthday rule. These
  were the questions that took longest per state.
- **Large snapshots.** Two Illinois budget acts are about 4.5 MB of text each.
  Consider storing only the cited sections plus a hash of the whole document.

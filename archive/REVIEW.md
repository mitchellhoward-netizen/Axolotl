# Reviewer guide

This is the starting point for benefits experts reviewing the rules archive.
It ranks every playbook and state part from most to least trustworthy and
says where to look first. Each state part also has its own `REVIEW.md` with
its assumptions, weakest parts and questions for an expert in that state.

Built 2026-10-07. Covers 7 playbooks × (federal base + New York, California,
Illinois): 498 rule statements, 466 synthetic households, 409 sources with
saved snapshots. Validation reports 0 errors and all 515 tests pass. There
are 357 PolicyEngine US comparisons, and every difference is explained.

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
had to be fetched by hand because the agency site blocks scripts, and the
PolicyEngine results. Counts are rules (confirmed / secondary / unresolved),
high-priority open questions, and open conflicts.

### Tier A: reliable; spot-check

| # | Playbook / state | Rules | High OQ | Conflicts | Why it ranks here |
|---|---|---|---|---|---|
| 1 | Turning 65, New York | 46 fed + 5 (all confirmed) | 0 | 1 | Almost all federal (CFR, U.S. Code, SSA POMS, CMS). PolicyEngine agrees on all 10 premium/IRMAA cases. NY Medigap rights come from Insurance Law 3231. One NY item (pre-existing-condition wait) rests on a NYSOFA guide. |
| 2 | Turning 65, California | 46 + 4 | 0 | 1 | Same federal core. The CA birthday rule rests on a CDI page dated 2010; the Insurance Code itself could not be fetched. |
| 3 | Turning 65, Illinois | 46 + 4 | 0 | 1 | Same federal core. The IL birthday-rule start date comes from NAIC and the state guide; the statute was not read. |
| 4 | Medicare Savings Program, New York | 21 fed + 21 (17/4/0) | 1 | 2 | 2026 standards from DOH directives (GIS 26 MA/05 chart) and the DOH MSP page. Our federal-minimum logic matches PolicyEngine on 19 of 20 households; the 20th differs only because PolicyEngine assumes Medicare from age. Weak: when the Social Security deduction actually stops (outcome proof), and the QMB start-date conflict. |
| 5 | Disability (SSI), California | 40 fed + 12 (all confirmed) | 0 | 0 | SSP levels from SSA POMS SI 01415.058, confirmed by CDSS. Federal SSI matches PolicyEngine in every case; the SSP differences come from PolicyEngine's stale 2025 tables. |
| 6 | SNAP (CalFresh), California | 34 fed + 9 (all confirmed) | 0 | 0 | CDSS ACLs and FNS tables. The PolicyEngine differences come from rounding at published limits and missing FY2027 utility allowances. |
| 7 | School meals, California | 23 fed + 13 (all confirmed) | 0 | 0 | Federal Register income guidelines; Education Code 49501.5 (universal meals) and 42238.01 (LCFF forms). Every CDE page had to be fetched through a reader route (`manual` in the source check). |
| 8 | School meals, New York | 23 + 9 (all confirmed) | 0 | 0 | Universal meals under Education Law 915-a from SY 2025-26, confirmed by an NYSED memo. The statute text itself is a secondary copy. |

### Tier B: sound, with named weak spots

| # | Playbook / state | Rules | High OQ | Conflicts | Weak spots |
|---|---|---|---|---|---|
| 9 | Medicaid, New York | 27 fed + 23 (all confirmed) | 1 | 1 | Levels from GIS charts. Excess-resource spenddown rests on 2011 Reference Guide pages. Which group gets one retroactive month in 2027 conflicts between NYSoH and the statute. PolicyEngine's NY senior parameters are stale. |
| 10 | Long-term care Medicaid, New York | 28 fed + 15 (14/1/0) | 1 | 0 | 2026 spousal figures and regional penalty divisors from GIS. Whether the 30-month community (home-care) look-back is in force rests on a law firm only. |
| 11 | Disability (SSI), Illinois | 40 + 13 (12/0/1) | 2 | 0 | AABD cash budgeting from the IDHS manual. Several allowance amounts are undated and treated as in force from 1/1/2026. Pension/VA income treatment is unknown, and the ineligible-spouse case is undetermined. |
| 12 | SNAP, Illinois | 34 + 12 (all confirmed) | 0 | 2 | The standard medical deduction is $185 in the IDHS manual and $150 in the Admin Code copy. IDHS's standard deduction is $4 below the FNS table, and the cause is unknown. |
| 13 | School meals, Illinois | 23 + 8 (7/1/0) | 1 | 0 | Federal categories are solid. Whether Healthy School Meals for All is funded in 2026-27 is unresolved (the funding bill died 7/1/2026; the enacted budget was not read). |
| 14 | Long-term care Medicaid, Illinois | 28 + 15 (14/0/1) | 1 | 0 | Treating assets over $17,500 as a first-month spenddown (not a denial) is a reading of two manual sections. The home-care penalty divisor is unknown. |
| 15 | Medicare Savings Program, Illinois | 21 + 18 (17/0/1) | 2 | 5 | IL disregards $25, not $20. IL's AABD earned-income rule may be stricter than the federal SSI floor allows (MSP-IL-EARNED-INCOME-FLOOR). Boundary wording (at vs under the limit) conflicts across manual sections. |

### Tier C: use with care; review before the agent relies on it

| # | Playbook / state | Rules | High OQ | Conflicts | Why |
|---|---|---|---|---|---|
| 16 | Medicare Savings Program, California | 21 + 22 (19/0/3) | 1 | 5 | dhcs.ca.gov blocks scripts, so all 20 sources were fetched with a headless browser and imported; the weekly job cannot re-check them. Open conflicts: when 2026 standards start (March 1 vs April 1), "less than" vs "or below", and the QMB start month. Whether Medi-Cal eligibility (not enrolment) bars QI is open; PolicyEngine says yes. |
| 17 | Disability (SSI), New York | 40 + 9 (7/1/1) | 1 | 2 | otda.ny.gov refused every route. NY SSP standards come from Social Services Law 209 and a DOH GIS, but how and when the SSP is paid rests on a secondary source. The VTR case is an inference. |
| 18 | Long-term care Medicaid, California | 28 + 16 (14/0/2) | 1 | 2 | CA's transfer rules differ in substance from federal: 30-month look-back, transfers made in 2024-25 never reviewed, whole-month penalties capped at 30. Home equity before 2028 is unresolved. The CSRA is assumed at the maximum for every couple. The $35 PNA rests on a 2001-02 Q&A. |
| 19 | Medicaid, Illinois | 27 + 17 (15/0/2) | 3 | 1 | IL never published the start date for its 2026 FPL standards. The values are recorded from the snapshot date, so IL cases dated January–October 6, 2026 come back undetermined. AABD earned-income exemptions were not found. |
| 20 | SNAP, New York | 34 + 13 (7/2/4) | 2 | 2 | otda.ny.gov refused every route. New York's FY2027 utility allowances and BBCE dollar limits are null, so NY SNAP cases dated from October 1, 2026 that need them return undetermined. The 02 ADM-07 medical-deduction freeze is unresolved; NYSCAP rests on a secondary source. |
| 21 | Medicaid, California | 27 + 21 (19/0/2) | 2 | 2 | Every CA rule rests on Santa Clara County's Medi-Cal handbook, which restates DHCS letters; the Medicaid worker could not reach DHCS. The MSP and long-term care workers did reach DHCS ACWDLs through a headless browser, and the $130,000 asset limit agrees across all three. The share-of-cost $600 maintenance level dates from 1989. Re-source this part first. |

## Where to look first

1. **Outcome proof for the Medicare Savings Program** (MSP-FED-OQ-04,
   MSP-NY-OQ-02; same gap in CA and IL). No primary source says how many
   months after approval SSA stops deducting the Part B premium, or how
   deducted months come back. This is the event the first customer pays on.
2. **California Medicaid (rank 21) and New York SNAP (rank 20).** Both rest on
   blocked agency sites. Re-source California Medicaid from the DHCS letters
   the MSP and long-term care parts already hold. Fill New York's FY2027 SNAP
   numbers from OTDA.
3. **Effective-date conflicts.**
   - QMB start month: federal 1902(e)(8) says the month after determination;
     NY GIS 07 MA/027 and the CA notice text say the month after application.
   - CA MSP standards from March 1 or April 1.
   - IL standards from January 1 or "every April".
   - IL Medicaid's 2026 FPL start date.
4. **Policy questions where the archive and PolicyEngine disagree for a
   reason that is not a modelling choice:**
   - California QI for people eligible for (but not enrolled in) Medi-Cal.
   - Illinois AABD earned-income rules against the federal SSI floor.
   - California SSP for an ineligible spouse.
5. **Medicaid changes from Public Law 119-21 in 2027:** retroactive coverage
   1 or 2 months, 6-month renewals and work requirements for expansion
   adults. Each state's implementation is thin. They are encoded from the
   statute and the June 2026 interim final rule.

## Ten rules the archive is least sure of

| Rule | Why |
|---|---|
| MSP-NY-PROOF-SSA / MSP-FED-PROOF-SSA-DEDUCTION | Unresolved: when the Part B deduction stops after approval. This is the outcome the customer pays on. |
| MCD-CA-SHARE-OF-COST | The $600 maintenance-need level comes from 1989 via a county handbook; secondary reports say an increase was revoked. |
| MSP-IL-EARNED-INCOME-FLOOR | IL's AABD rule ($20 + ½ of the next $60) may be more restrictive than the SSI method federal law sets as the floor for MSP. |
| LTC-CA-HOME-EQUITY | Unresolved: whether California applies the home-equity limit before 2028. |
| LTC-IL-RESOURCES | Assets over $17,500 handled as a first-month spenddown is an interpretation of two manual sections. |
| MSP-CA-QI-NOT-MEDI-CAL | Whether eligibility for Medi-Cal, or Medi-Cal with a share of cost, bars QI. PolicyEngine says eligibility alone does. |
| SNAP-NY-MSP-MEDICAL-FREEZE (and MSP-NY-SNAP-EFFECT) | 02 ADM-07 could not be retrieved; it rests on NYSOFA's description. |
| SCH-IL-HSMFA | Illinois universal meals is enacted but its 2026-27 funding is unconfirmed. |
| T65-CA-MEDIGAP-BIRTHDAY / T65-IL-MEDIGAP-BIRTHDAY | Neither state's statute could be read. The CA rule rests on a 2010 CDI page; the IL start date on NAIC and the state guide. |
| DIS-NY-SSP-PAYMENT | How New York pays its SSP since the 2014 takeover rests on a NY Senate post. |

## Claims from the earlier research

| Claim | Verdict | Primary source |
|---|---|---|
| 2026 poverty guideline for one person is $15,960 | Verified (effective Jan 13, 2026 unless a program sets another date) | Federal Register 2026-00755 |
| 2026 standard Part B premium is $202.90 | Verified | CMS fact sheet, Nov 14, 2025 |
| Retroactive Medicaid shortens from January 2027 | Verified: applications from Jan 1, 2027 get 1 prior month (expansion adults) or 2 (everyone else) | P.L. 119-21 sec. 71112 |
| QI is federally funded within capped allotments and cannot be combined with full Medicaid | Verified | 42 U.S.C. 1396u-3; 1396a(a)(10)(E)(iv) |
| NY has no MSP asset test; QMB 138%, QI 186% FPL; QMB $1,856 with $20 disregard; Extra Help automatic | Verified, with a correction: $1,836 is the 2026 QMB standard and $1,856 is the most *gross* income that qualifies after the $20 is deducted. QDWI does have a resource test. | NY DOH MSP page; GIS 22 MA/10, 26 MA/05; SSA POMS HI 03001.005 |
| NY asset limit for age/disability and LTC Medicaid about $33,038 | Verified (couple $44,796; excess can be spent down) | GIS 26 MA/05 chart |
| CA reinstated a Medi-Cal asset limit of $130,000 | Verified: from Jan 1, 2026, non-MAGI only, +$65,000 per additional person ($195,000 for an MSP couple). It also applies to the MSP and long-term care | DHCS ACWDLs (via MSP and LTC parts); county handbook (Medicaid part) |
| CA alternative income forms count for LCFF if collected by October 31 | Partly verified: the form must be received by Oct 31 and the pupil enrolled on Census Day (first Wednesday in October). The date is CDE guidance, not statute. The forms count for LCFF only, never for meals. | CDE guidance; EC 42238.01 |
| IL asset limit for age/disability and LTC Medicaid $17,500 | Verified: same for a couple; excess becomes a spenddown, not a denial | IDHS Policy Manual |
| IL and NY use Medicaid data to certify free meals only | NY verified. **IL refuted**: Illinois certifies free *and* reduced-price from Medicaid data (since SY 2022-23) | FNS demonstration table; NYSED memo; ISBE |

## Federal and state shares

Rule counts per part (federal / NY / CA / IL), and the share of rules that
are federal:

| Playbook | Federal | NY | CA | IL | Federal share |
|---|---|---|---|---|---|
| Turning 65 | 46 | 5 | 4 | 4 | 78% |
| Disability | 40 | 9 | 12 | 13 | 54% |
| SNAP | 34 | 13 | 9 | 12 | 50% |
| School meals | 23 | 9 | 13 | 8 | 43% |
| Long-term care Medicaid | 28 | 15 | 16 | 15 | 38% |
| Medicaid | 27 | 23 | 21 | 17 | 31% |
| Medicare Savings Program | 21 | 21 | 22 | 18 | 26% |

Rule counts understate the federal share of the *logic*. For SNAP, SSI and
school meals the federal code computes the benefit, and states change a few
numbers (about three-quarters federal). For Medicaid and the MSP, states
replace nearly every income standard, disregard and asset rule, so roughly
60-70% of what decides a state answer is state-specific.

## Conflicts between sources

There are 32 open conflict entries (plus a few marked resolved); each is in its part's `conflicts:` with
both claims. The patterns:

- **Old manuals vs new directives.** NY Medicaid Reference Guide pages
  (1999-2012) vs GIS messages; SSA POMS still says "food and shelter" after the
  2024 food-ISM rule; the CMS State Medicaid Manual's 36-month look-back vs
  the DRA's 60; 42 CFR 411.162's 12-month ESRD period vs the statute's 30; 42
  CFR 435.915 not yet updated for 2027.
- **"Below" vs "at or below" at a limit.** NY DOH page vs GIS for QI; CA 2026
  chart vs ACWDL 23-05; IL manual sections. Every playbook pins the at-limit
  case in a test.
- **Effective dates.** New poverty-level standards (CA March vs April; IL
  January vs April); QMB start month.
- **Agency table vs federal table.** IL SNAP standard deduction $4 below FNS;
  NY utility allowances (OTDA regional vs FNS); IL SNAP standard medical
  deduction $185 vs $150.

## PolicyEngine US cross-check

| Playbook | Compared (NY / CA / IL) | Differ | Main reasons |
|---|---|---|---|
| Medicare Savings Program | 22 / 25 / 26 | 33 | PolicyEngine models only the federal 100/120/135% tiers. It does not model NY's 138/186% expansion, IL's $25 disregard, or CA's 2026 asset limit. It also infers Part A from age. |
| Turning 65 | 10 / 10 / 10 | 0 | Premiums and IRMAA only; PolicyEngine has no enrollment windows, penalties or coordination rules. |
| Disability (SSI) | 18 / 16 / 13 | 24 | Federal SSI agrees in every case. PolicyEngine's CA SSP and IL AABD tables stop at 2025, and it has no NY SSP. |
| Medicaid | 16 / 15 / 15 | 21 | No spenddown or share of cost in PolicyEngine. Stale NY senior parameters. Rounding of 138% limits. Strict "<" at the asset limit. |
| Long-term care Medicaid | 15 / 15 / 12 | 3 | PolicyEngine models only the home-equity limit (one national figure). |
| SNAP | 23 / 20 / 22 | 19 | BBCE limits computed without the published rounding. NY heating allowance given to everyone. IL standard deduction. Missing FY2027 utility allowances. |
| School meals | 16 / 18 / 20 | 9 | CA universal meals applied to private schools. Categorical eligibility extended to a foster child's siblings. No CEP. Calendar year vs school year guidelines. |

Each difference is explained case by case in
`crosscheck/explanations/<program>.yaml` (`crosscheck/run.py` fails on an
unexplained one). PolicyEngine US is AGPL-3.0; the Atlanta Fed Policy Rules
Database is GPL-3.0. Neither is copied into the repository; see
`crosscheck/README.md`.

## Keeping it current

- `python -m tools.check_changes` was run on 2026-10-07 over all 409 sources.
  The report is `reports/source-check-2026-10-07.md`.
  - **357 unchanged.**
  - **1 changed:** a heat-advisory banner on CDA's HICAP page; no rule affected.
  - **2 fetch failures.** An FNS SNAP table URL now returns 404 (10 dependent
    items), so it needs a new URL. One advocacy blog also failed.
  - **49 manual.** These were imported via a browser or reader because the
    sites block scripts, and need a person (or the same route) to re-check.
- `.github/workflows/rules-archive-sources.yml` runs the check every Monday
  and opens an issue when something changes.
- [YEARLY-CHECKLIST.md](YEARLY-CHECKLIST.md) lists every number that updates
  on a schedule. 13 parameters have no recorded cadence, and the checklist
  says so.

## What to change before adding more states

- **Fix source access first.** Six agencies blocked scripted access:
  dhcs.ca.gov, otda.ny.gov, aging.ny.gov, cde.ca.gov, ssa.gov/oact and
  medicaid.gov. A blocked source cannot be re-checked automatically, which
  undercuts the whole currency promise. Options are a browser-based fetcher
  in the scheduled job (the Playwright route worked for DHCS), agency data
  feeds, or a human re-check queue.
- **Move duplicated sources and numbers into `shared/`.**
  - Sources: Public Law 119-21 exists under three IDs; several IDHS manual
    sections and SSA POMS pages under two each.
  - Numbers: Part A premium, IRMAA, Part D base premium, SGA, full
    retirement age, spousal impoverishment standards, 2025 poverty
    guidelines.
  - Parallel workers could not edit `shared/`, so they duplicated or
    renamed. One worker briefly overwrote another's snapshot through an ID
    collision.
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
- **Prior-year values.** The archive mostly holds 2026 / FY2027 values.
  Adding 2025 values (poverty guidelines, MSP tables) would let it evaluate
  retroactive months and late-2025 applications.

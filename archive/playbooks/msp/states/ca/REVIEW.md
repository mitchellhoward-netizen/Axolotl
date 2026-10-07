# Review notes: Medicare Savings Program, California

For a reviewer who knows Medi-Cal and the MSPs. Built 2026-10-07 from DHCS
All County Welfare Directors Letters (ACWDLs 22-25, 22-28, 23-05, 25-01, 25-14,
25-26, 25-27, 26-01 and enclosures, 26-07, 26-12, 26-16), MEDIL I 25-01, the
DHCS MSP and Buy-In pages, form MC 14A, the MC 176 QMB/SLMB/QI worksheet and
MEPM Article 5L (1997). dhcs.ca.gov blocks scripts, so every snapshot was taken
with a headless browser and imported. Rules: `playbook.yaml`; numbers:
`parameters/msp_ca.yaml`.

## What is solid

- **Tiers and 2026 standards.** QMB <= $1,330 / $1,804, SLMB < $1,596 / $2,165,
  QI < $1,796 / $2,436, QDWI <= $2,660 / $3,608 a month of *net countable*
  income (ACWDL 26-01 Enclosure 1, DHCS MSP page). Couple figures are DHCS's
  rounded-up monthly FPL ($1,804, not $1,803.33).
- **Income method.** $20 any income deduction, $65 + one-half of earnings,
  no premium deduction (MC 14A, MEPM 5L, ACWDL 23-05). The ABD FPL program's
  extra disregards do **not** apply to the MSPs.
- **Asset test.** $130,000 / $195,000 from January 1, 2026 (ACWDL 25-14, 25-27);
  none in 2024-2025; same amounts July 2022 - December 2023. New applications
  are tested from 2026; existing members at their first 2026 renewal.
- **Part A buy-in** since January 1, 2025; SSI/SSP recipients auto-enrolled in
  QMB (MEDIL I 25-01).
- **Outcome proof timing.** DHCS's 2026 NOA text: up to 4 months for the Part B
  deduction to stop (ACWDL 26-12) — the gap New York could not fill. The
  refund of already-deducted months (a separate SSA payment) and SSA's buy-in
  notice come from federal sources (POMS HI 00815.039, HI 01001.205).
- **Retroactivity.** SLMB/QI 3 months; 2 months for applications from
  January 1, 2027 (ACWDL 26-07, preliminary).

## Assumptions made

1. RSDI cases use the prior year's standards and exclude the COLA through
   February; 2026 standards from March 1 (ACWDL 26-01). ACWDL 25-26 and the
   MC 14A say April (MSP-CA-CONFLICT-01).
2. SLMB and QI are "less than" 120% / 135% (2026 Enclosure 3, MC 14A); ACWDL
   23-05 says "or below" (MSP-CA-CONFLICT-02). Test MSP-CA-T04 pins $1,596
   countable as QI.
3. Countable property excludes the home, one vehicle and burial spaces (SSI
   style); Article 9 was not reviewed (MSP-CA-OQ-05).
4. A spouse living at home is budgeted with the applicant (FPL for two). The
   SSI-method fallback for a non-applying spouse needs the "Standard SSI
   Allocation", which we could not find; such cases return undetermined.
5. QDWI income compared after earned income deductions (MSP-CA-OQ-07).
6. Households with children return undetermined (MFBU not modelled).

## Weakest parts

- **QMB start date**: month after approval (MEPM 5L, ACWDL 23-05) vs month after
  application (2026 NOA text). Marked unresolved.
- **Part A for a QMB-only applicant without Part A**: whether DHCS buys in Part A
  outside full-scope Medi-Cal (MSP-CA-OQ-02). ACWDL 24-20 (the buy-in letter) was
  not retrievable ("page not found").
- **QI versus Medi-Cal** (MSP-CA-OQ-01): share-of-cost members, and whether mere
  eligibility for ABD FPL Medi-Cal (to 138% FPL) bars QI. PolicyEngine treats it as
  barring QI; the archive bars QI only for people who have Medi-Cal.
- **Decision deadline** not found (MSP-CA-OQ-08).
- MEPM Article 5L dates from 1997; it is still cited by ACWDL 23-05 but its
  amounts are old.

## Questions for a California benefits expert

1. Does QMB start the month after application or after county approval?
2. Can a Part-B-only 65-year-old (not on Medi-Cal) get QMB with the state buying
   Part A, or must they use SSA conditional enrollment?
3. Can share-of-cost Medi-Cal members hold QI?
4. What is the current Standard SSI Allocation for an ineligible spouse?
5. Which assets are exempt under the reinstated property test (vehicle,
   retirement accounts)?
6. March 2026: were RSDI MSP cases switched to 2026 FPL on March 1 or April 1?
7. What does the 2025 family-size alignment (ACWDL 25-07, now obsolete) say?

## Cross-checks

`crosscheck/results/msp.md`: 25 California rows (19 California households plus
the California column of cross-state households) were run through PolicyEngine
US 2.29.14. Differences, all explained in `crosscheck/explanations/msp.yaml`:
DHCS's rounded-up couple standard ($1,804); the 2026 asset reinstatement
(PolicyEngine keeps CA's 2024 "no asset test" flag); PolicyEngine barring QI for
anyone eligible for ABD FPL Medi-Cal; a float32 artefact at exactly 120% FPL;
Part A inferred from age; and the unresolved ineligible-spouse allocation.

# Review notes: long-term care Medicaid, New York

For a reviewer who knows New York nursing-home Medicaid. Built 2026-10-07 from
DOH directives (GIS 26 MA/03, GIS 26 MA/05 and its standards chart, GIS 25 MA/14),
the DOH Medicaid Reference Guide (MRG), forms DOH-4220 and DOH-5178A (Supplement A),
DOH's 30-month look-back pages, and federal law (42 U.S.C. 1396p, 1396r-5). Every
rule is in `playbook.yaml`; every number is in `parameters/ltc_ny.yaml`; snapshots
are in `../../snapshots/` (the 2026 chart and GIS 26 MA/03 are snapshotted under the
msp playbook).

## What is solid

- **2026 numbers.** Resource level $33,038 (institutionalized spouse and single
  applicant); CSRA greater of $74,820 or the spousal share up to $162,660; MMMNA
  $4,066.50; PNA $50; family member allowance formula $2,705, maximum $902; home
  equity limit $1,130,000. All from GIS 26 MA/03, GIS 26 MA/05 and its chart.
- **2026 regional rates** used as transfer-penalty divisors (GIS 25 MA/14), e.g.
  New York City $15,282, Long Island $15,193, Western $13,765.
- **60-month look-back** for nursing-home care and the documentation requirement
  (Supplement A: "Documentation of your resources for the past 60 months").
- **Penalty start** (later of the month after the transfer or the month the person
  is otherwise eligible in a nursing home) and partial months added to the NAMI
  (MRG, June 2010 pages).

## Assumptions made

1. **Excess resources mean ineligible.** A resident over $33,038 is "ineligible
   (excess_resources)"; we did not model applying excess resources to the first
   month's bills.
2. **Uncompensated value is reduced** by the room under the resource level (MRG
   p. 448), but not by the $1,500 burial amount (households are assumed to have a
   burial fund).
3. **The community spouse's income** is counted gross, without disregards, and the
   resident is assumed to make the full income allowance available to the spouse.
4. **Income test.** If the NAMI is at least the monthly cost of care, Medicaid pays
   nothing toward the nursing home; we call that "ineligible (income_covers_cost)".
   The first month of permanent absence (community budgeting) is not modelled.
5. **Home care** gets the same resource level and home equity test and no transfer
   penalty (30-month look-back not implemented). We apply the CSRA to home-care
   spouses too; New York's MLTC/waiver spousal budgeting ($633 PNA) is not modelled.
6. **Retirement accounts** are counted in full (LTC-NY-OQ-05).

## Weakest parts

- **Status of the 30-month community look-back** (LTC-NY-CBLTC-LOOKBACK) rests on a
  2026 law-firm article; DOH's own pages stop at the 2021 CMS completeness letter.
  If DOH has set an implementation date, home-care answers change (LTC-NY-OQ-01).
- **The MRG is old** (2007-2012 pages). Methods (penalty start, uncompensated value,
  spousal refusal, 25% contribution request, expanded estate definition from 2011)
  may have been changed by later ADMs we did not retrieve.
- **Estate recovery**: whether New York enforces the 2011 expanded estate definition
  (LTC-NY-OQ-02).
- **Application form**: DOH-4220 with Supplement A is confirmed; whether districts
  still accept LDSS-2921 for nursing-home cases is not (LTC-NY-OQ-03).

## Questions for a New York benefits expert

1. Has the 30-month look-back for community-based long-term care been implemented
   or given a start date?
2. Is the MRG's uncompensated-value reduction (room under the resource level and
   $1,500 burial) still applied?
3. Do districts let excess resources be applied to nursing-home bills in the month
   of application, or must they be spent first?
4. Is the 25% contribution request to a community spouse with excess income still
   made, and how often do districts pursue spousal refusal cases?
5. How are IRAs and 401(k)s of the applicant and community spouse treated in 2026?
6. Is the expanded (non-probate) estate definition enforced?

## Cross-checks

PolicyEngine US models only the home equity limit for long-term care (one national
limit, the federal maximum, and the spouse/child-in-home exception). It does not
model transfer penalties, spousal impoverishment, the PNA or the NAMI, so only the
home equity test was compared: see `crosscheck/results/ltc_medicaid.md`. New York's
limit equals the federal maximum, so the two should agree on every New York household.

# Review notes: Medicare Savings Program, New York

For a reviewer who knows New York Medicaid and the MSP. Built 2026-10-07 from
New York DOH directives (GIS messages), the DOH MSP page and form DOH-4328, the
DOH Medicaid Reference Guide, and NYSOFA's 2026 HIICAP notebook. Every rule is
in `playbook.yaml` with its source and locator; every number is in
`parameters/msp_ny.yaml`; snapshots of each source are in `../../snapshots/`.

## What is solid

- **2026 income standards.** QMB $1,836 / $2,489 and QI $2,474 / $3,355 a month
  (138% and 186% FPL), straight from the GIS 26 MA/05 attachment and matching the
  DOH MSP page. With the $20 disregard: $1,856 / $2,509 and $2,494 / $3,375.
- **No resource test** for QMB and QI (2026 chart).
- **QI cannot be held with Medicaid** (GIS 22 MA/10, DOH page).
- **SLMB is gone** for new cases since January 1, 2023 (GIS 22 MA/10).
- **Retroactivity**: QMB none; QI up to three months, never into a prior
  calendar year (GIS 22 MA/10).
- **How the premium comes off the check (federal, applies in New York).** The
  LDSS/HRA opens an eMedNY Buy-In span (GIS 23 MA/10, GIS 26 MA/05); buy-in
  starts with the MSP effective month (POMS HI 00815.018); SSA mails a notice
  of the buy-in effective date, stops the deduction and refunds premiums
  already deducted for buy-in months as a separate payment (HI 00815.039,
  HI 01001.205; CMS buy-in manual ch. 1, 1.5). MSP-NY-PROOF-SSA is now
  confirmed for *what* happens; only *when* is open.
- **Part B late-enrollment penalty removal** now rests on SSA POMS HI 00815.001
  and HI 00815.039 and 42 CFR 407.47(g) (MSP-NY-OQ-04 answered).

## Assumptions made

1. **Countable income is compared to the standard after the $20 disregard**, so
   "gross up to $1,856" qualifies for QMB. The DOH page shows both columns and its
   note says the $20 is deducted from gross income. Tests pin $1,856 (QMB) and
   $1,857 (QI).
2. **"At or below" applies at both limits.** The DOH page says QI is income
   "Below 186% FPL" and NYSOFA's chart says QMB is "Under $1,856". The two DOH
   directives say "less than or equal to". We followed the directives (conflict
   MSP-NY-CONFLICT-02).
3. **SSI-related budgeting.** Earned income gets $65 + one-half; one $20 per
   couple. These come from the Medicaid Reference Guide, whose income pages are
   dated 1999–2012. We assumed they still apply.
4. **Couples.** Spouses living together are always compared to the household-of-
   two limit, even when only one has Medicare (MRG MSP note, Nov 2009). The
   federal treatment of that case is an open question (MSP-FED-OQ-03); New
   York's rule is explicit.
5. **SSI and state supplement payments are not counted** as income for the MSP
   (MSP-FED-OQ-05). Few SSI recipients are affected, since they qualify anyway.
6. **January.** We apply the 2026 levels from January 1 and leave the COLA out
   of January and February income, which is the result after New York's
   re-budgeting (GIS 26 MA/03 and 26 MA/05). In practice an MSP-only case
   processed before February 17, 2026 was first budgeted with 2025 figures.

## Weakest parts

- **When the Social Security deduction actually stops** after approval
  (MSP-NY-OQ-02, narrowed). The refund mechanism and the SSA notice are now
  sourced federally, but no New York or federal primary source gives the number
  of months; California tells members "up to 4 months" and Illinois workers
  expect about 90 days, and neither can be carried to New York. This is still
  the most important gap for the outcome proof.
- **QMB start date.** New York says the first of the month after the
  *application* (GIS 07 MA/027, 2007; NYSOFA 2026). Federal law, 1902(e)(8),
  says after the month of *determination*. Which does New York actually use
  today? (MSP-NY-CONFLICT-01)
- **Several benefits rest only on NYSOFA's counselor manual**: automatic QMB for
  SSI recipients, the SNAP
  medical-deduction freeze (OTDA 02 ADM-07), and the estate-recovery exemption
  (GIS 10 MA/008). Each is marked `secondary` with an open question.
- **Online filing.** The DOH page says people can "apply online with the NY
  State of Health", but which MSP applicants that covers is unclear
  (MSP-NY-OQ-01).
- **The Medicaid Reference Guide is old.** Its MSP pages still show the pre-2023
  tiers. We used it only for budgeting methods (disregards, couples), not for
  limits.

## Questions for a New York benefits expert

1. After an MSP approval, how soon does the LDSS/HRA open the eMedNY Buy-In
   span, and how many months until SSA stops deducting the Part B premium? Do
   members in practice receive the SSA refund of deducted months as one
   separate payment? Are DSS-4039 / DSS-4393 still the approval notices?
2. Does New York start QMB the month after application or the month after the
   determination?
3. Is a spouse without Medicare always budgeted in a household of two for MSP,
   with that spouse's earnings getting the $65 + one-half disregard?
4. Is the 02 ADM-07 SNAP medical-expense freeze still in effect?
5. Which Medicare beneficiaries can apply for the MSP online through NY State of
   Health, and does an online application avoid mailing the DOH-4328?
6. Is there a current DOH directive on automatic QMB for SSI recipients?
7. Do districts treat "Income Below 186% FPL" (DOH page) as "at or below"?

## Cross-checks

`crosscheck/results/msp.md`: 20 New York households were run through PolicyEngine
US 2.29.14. 15 differ, all explained. PolicyEngine models only the federal
100/120/135% tiers, not New York's 138/186% expansion. One more difference comes
from PolicyEngine inferring Medicare from age. Our federal-minimum logic matches
PolicyEngine on 19 of 20; the twentieth is that same Part A difference.

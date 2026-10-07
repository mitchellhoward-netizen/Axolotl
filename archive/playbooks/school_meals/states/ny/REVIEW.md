# Review notes: school meals, New York

For a reviewer who knows New York school nutrition (NYSED Child Nutrition).
Built 2026-10-07 from NYSED memos (Universal Free Meals, May 13, 2025; DCMP,
September 8, 2026; 2026-27 Provision 2 base-year IEGs, May 7, 2026), the NYSED
2026-27 application and IEG chart, NYSED's CEP page and Household Income
Eligibility Form, a third-party copy of Education Law 915-a, and the FNS
Medicaid demonstration table. NYSED's site serves an incomplete TLS chain; the
missing GlobalSign intermediate was added to the trust bundle for the fetches.

## What is solid

- **Universal free meals from SY 2025-26** for every district, charter and
  nonpublic school in the NSLP/SBP; the state pays the difference to the free
  rate (NYSED memo; 915-a subdivisions 1-2).
- **Schools must still certify categories**: DCMP at least three times a year;
  applications where the school is not CEP / Provision 2 non-base year.
- **Medicaid direct certification is free-only** (FNS table: New York in the
  2012-13 free-only column, no later expansion; NYSED memo "free meal benefits").
- **CEP threshold 25%**, 4-year cycles, state pays the paid-rate gap for CEP meals.

## Assumptions made

1. Students at New York schools outside the NSLP/SBP are not covered by 915-a
   and have no federal free/reduced meals: tier `paid`.
2. The Household Income Eligibility Form is assumed to be the CEP/Provision 2
   counterpart of the application (its use for state aid is not established).
3. Medicaid match uses `medicaid_income_fpl_percent` (or the income band as proxy).

## Weakest parts

- Education Law 915-a text is a third-party copy (nysenate.gov refuses scripts);
  rules are confirmed by the NYSED memo (SCH-NY-OQ-03).
- Whether New York has applied to move to free and reduced-price Medicaid
  certification for 2025-26 or later (SCH-NY-OQ-01); the FNS page lists rounds
  only through 2024-25.
- No deadline found for the Household Income Eligibility Form (SCH-NY-OQ-02).

## Questions for a New York benefits expert

1. Is New York still DCM free-only in 2026-27?
2. Which state aid or program counts use the Household Income Eligibility Form,
   and is there a return deadline?
3. Are there NSLP-participating schools that are not covered by 915-a (for
   example RCCIs or Special Milk-only schools)?

## Cross-checks

`crosscheck/results/school_meals.md`: 16 New York rows through PolicyEngine US
2.29.14; 2 differ, both explained: a school outside the NSLP (PolicyEngine has no
participation input) and a 2025-09-15 date (PolicyEngine reads New York's
universal flag at January 1, 2025, before it started). On the federal-minimum
column one more row (SCH-NY-T06, $1,175 weekly) differs: USDA rounds each pay
frequency's limit up (weekly $1,175 x 52 = $61,100 > the $61,050 annual limit),
while PolicyEngine annualizes and compares with 185% exactly. The archive
follows USDA's published weekly figure.

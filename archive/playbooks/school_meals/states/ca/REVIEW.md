# Review notes: school meals, California

For a reviewer who knows California school nutrition (CDE Nutrition Services)
and LCFF/CALPADS. Built 2026-10-07 from Education Code 49501.5 and 42238.01,
CDE's Universal Meals Program Implementation Guidelines (September 2024) and
FAQ, CDE's Direct Certification and Alternative Income Forms pages, the CDE
Census Day file definition and the 2026-27 income scales. Every rule is in
`playbook.yaml`; numbers are in `parameters/school_meals_ca.yaml` and the
federal `parameters/school_meals_federal.yaml`. cde.ca.gov and leginfo block
scripts, so their snapshots are reader (r.jina.ai) text copies; the UMP
guidelines are the text of the .docx.

## What is solid

- **Universal meals**: every public district, county office and charter (TK-12)
  must offer a free breakfast and lunch every school day to any pupil who asks,
  since SY 2022-23, regardless of NSLP participation (EC 49501.5(a)(1); UMP
  guidelines). Private schools are generally not covered.
- **Medi-Cal direct certification for free AND reduced price** through CALPADS
  (codes M and R), statewide since SY 2017-18 (FNS table; CDE page), public LEAs
  only, extends to the household; Medi-Cal alone is not categorical.
- **Alternative Income Forms** are for LCFF counts only, never for meal
  eligibility; required content is in EC 42238.01(b).
- **October 31**: CDE says the LEA must *receive* the form by October 31 (it may
  process later); Census Day is the first Wednesday in October; the FRPM record
  must start on or before October 31.
- **Applications are still collected** at standard-claiming schools.

## Assumptions made

1. A public-school student's tier is `free_universal` even when the school is
   outside the NSLP (the mandate applies anyway; no reimbursement). The
   federal category is then "not_determined".
2. Medi-Cal matching is modelled from `medicaid_income_fpl_percent`; when that
   fact is missing the school-meal income band is used as a proxy. The real
   match uses DHCS's income data and Medi-Cal family size.
3. A CEP or Provision 2 non-base-year school is assumed to collect Alternative
   Income Forms (CDE says such schools "may"/"should").
4. Nonpublic, nonsectarian placements of public-school pupils (EC 56365, still
   covered by the mandate) are not modelled.

## Weakest parts

- The October 31 date rests on CDE guidance only (SCH-CA-OQ-01).
- Snapshots of CDE and leginfo pages are third-party reader text, not the
  original HTML; a reviewer should spot-check them against the live pages.
- No source for what written proof a family gets of its CALPADS status at a
  universal-meals school (SCH-CA-OQ-02).

## Questions for a California benefits expert

1. Is October 31 set anywhere in statute or CALPADS rules, or only on the CDE
   Alternative Income Forms page?
2. Do private schools in the NSLP get any Medi-Cal direct certification data?
3. What do districts send families to prove free/reduced status for SUN Bucks and
   fee waivers when all meals are free?
4. Is the 2026-27 Universal Meals appropriation prorated?

## Cross-checks

`crosscheck/results/school_meals.md`: 18 California rows (16 California cases plus
two cases from other states run in CA) through PolicyEngine US 2.29.14. 4 differ,
all private-school cases: PolicyEngine gives every California household FREE
(statewide universal flag), the archive limits EC 49501.5 to public LEAs. Our
federal category matched PolicyEngine's own federal tier on every California row.

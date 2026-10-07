# Review notes: school meals, Illinois

For a reviewer who knows Illinois school nutrition (ISBE Nutrition Department).
Built 2026-10-07 from 105 ILCS 125/2.3, the HB2365 bill status, ISBE's September
10, 2026 IEG press release, ISBE's May 2026 direct certification training
slides, the ISBE 68-06 letter/application packet and HEA resources page, the
FNS Medicaid demonstration table, and two advocacy sources on funding.

## What is solid

- **Federal tiers apply**; 2026-27 limits for 4: $42,900 free, $61,050 reduced
  (ISBE release matches the Federal Register).
- **Medicaid direct certification for free AND reduced price since SY 2022-23**
  (FNS table; ISBE slides). A reduced-price Medicaid match still requires
  sending the HEA; a Medicaid number cannot be used on the HEA.
- **HSMFA is "subject to appropriation"** and requires CEP or another special
  assistance alternative where eligible (105 ILCS 125/2.3).

## Assumptions made

1. **No statewide HSMFA funding in 2026-27.** HB2365 ($67 million) died in
   Rules on 7/1/2026; ISBE's 2026-27 release mentions only federal eligibility
   and CEP; advocates say the money has not been allocated. The enacted FY2027
   appropriation act itself was not read. Marked `secondary` with high-priority
   SCH-IL-OQ-01; paid cases carry that open question.
2. A school board that does participate in a funded HSMFA can be flagged
   (`il_hsmfa_participating`); the result is then `free_universal` but still
   carries SCH-IL-OQ-01.
3. Medicaid match uses `medicaid_income_fpl_percent` (or the income band as proxy).

## Weakest parts

- HSMFA funding status (above) is the single fact that most changes Illinois
  answers.
- No Illinois counterpart to California's LCFF alternative income form was
  researched (SCH-IL-OQ-02).

## Questions for an Illinois benefits expert

1. Does the FY2027 enacted budget include any Healthy School Meals for All line?
2. Does ISBE's Electronic Direct Certification System use HFS income data with a
   Medicaid family size, and how often is it refreshed?
3. Do Illinois CEP districts collect any household income forms for EBF or
   Title I?

## Cross-checks

`crosscheck/results/school_meals.md`: 20 Illinois rows through PolicyEngine US
2.29.14; 3 differ, all explained: a CEP school (not modelled in PolicyEngine),
a foster child's sibling (PolicyEngine extends categorical eligibility to the
whole SPM unit; federal rules do not), and a March 2026 date (PolicyEngine uses
the 2026 poverty guideline; the 2025-26 school-year guidelines apply until June
30, 2026).

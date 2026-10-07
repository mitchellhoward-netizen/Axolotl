# Review notes: school meals, Illinois

For a reviewer who knows Illinois school nutrition (ISBE Nutrition Department).
Built 2026-10-07 from 105 ILCS 125/2.3, the HB2365 bill status, ISBE's September
10, 2026 IEG press release, ISBE's May 2026 direct certification training
slides, the ISBE 68-06 letter/application packet and HEA resources page, the
FNS Medicaid demonstration table, and two advocacy sources on funding. Second
pass (ilga.gov reachable): the enacted FY2027 and FY2026 appropriation acts
(Public Acts 104-0464 and 104-0003) and the HB0111 / SB1419 bill status.

## What is solid

- **Federal tiers apply**; 2026-27 limits for 4: $42,900 free, $61,050 reduced
  (ISBE release matches the Federal Register).
- **Medicaid direct certification for free AND reduced price since SY 2022-23**
  (FNS table; ISBE slides). A reduced-price Medicaid match still requires
  sending the HEA; a Medicaid number cannot be used on the HEA.
- **HSMFA is "subject to appropriation"** and requires CEP or another special
  assistance alternative where eligible (105 ILCS 125/2.3).
- **HSMFA is not funded in 2025-26 or 2026-27** (second pass): the enacted
  FY2027 appropriation act, P.A. 104-0464 (HB 111, approved with item vetoes
  June 16, 2026), gives ISBE "Reimbursement for the Free Breakfast/Lunch
  Program" ($26,000,000, the existing State reimbursement) and no Healthy
  School Meals for All line; the FY2026 act (P.A. 104-0003) has none either.
  SCH-IL-OQ-01 is answered; the rule is now `confirmed`.

## Assumptions made

1. **"Not funded" is read from the absence of a line** in the two
   appropriation acts (searched for "Meals for All" and read the ISBE grant
   sections). Item vetoes can only reduce lines, so none could have been added.
2. A school board flagged `il_hsmfa_participating` gets free meals for all only
   in a year the funding parameter is true; in 2026-27 the flag adds a note and
   federal categories apply (a board can still serve free meals through CEP or
   its own money, which the agent should ask about).
3. From July 1, 2027 (FY2028) the funding parameter is null (SCH-IL-OQ-03), so
   2027-28 Illinois cases are undetermined until that budget is read.
4. Medicaid match uses `medicaid_income_fpl_percent` (or the income band as proxy).

## Weakest parts

- HSMFA funding must be re-checked every budget year (SCH-IL-OQ-03); the
  appropriation acts are about 5 MB each and the snapshots are text-only.
- No Illinois counterpart to California's LCFF alternative income form was
  researched (SCH-IL-OQ-02).

## Questions for an Illinois benefits expert

1. Is any Illinois school board running "free meals for all" under the HSMFA
   name in 2026-27 with its own funds, and does ISBE track it?
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

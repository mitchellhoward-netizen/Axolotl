# Review notes: Medicaid (Medi-Cal), California

Built 2026-10-07. **DHCS (dhcs.ca.gov, including all ACWDL/MEDIL letters) could
not be retrieved**: its bot wall blocked scripted requests, the WebFetch tool
and the Wayback Machine. Every California rule therefore rests on the Medi-Cal
handbook and charts of the Santa Clara County Social Services Agency (a county
that administers Medi-Cal; its updates name ACWDL 25-13, 25-14 and 25-20), a San
Mateo County member flyer, and, for cross-checking only, a Health Consumer
Alliance practice tip. All carry open question MCD-CA-OQ-01.

## What is solid

- **Asset limit reinstated January 1, 2026** for Non-MAGI programs (not Pickle,
  DAC, DW): $130,000 for one plus $65,000 per additional person up to 10;
  eliminated January 2024 - December 2025; $130,000 phase from July 2022.
  Transition rules for applications and renewals.
- **2026 MAGI levels** (from January 1): adults 138% ($1,836 / $2,490 /
  $3,143), parents 109% (114% with Medicare), pregnant 213%.
- **A&D FPL program** (138% after $20 and the Part B premium; ABD levels from
  April 1, 2026) and **share of cost** (income over the $600 / $934 maintenance need).
- **Expansion freeze** for adults 19+ without satisfactory immigration status
  from January 1, 2026; dental ends July 1, 2026 for those grandfathered.
- **Retroactive coverage**: 3 months before 2027; 1 month (new adult group) /
  2 months (others) from January 1, 2027; 12-month request limit.

## Assumptions made

1. Property exactly at $130,000 qualifies (county: "equal to or below"; HCA:
   "less than"; MCD-CA-CONFLICT-01).
2. Over the property limit = ineligible (no property spenddown outside LTC),
   per the county flyer's "you may need to reduce your countable assets".
3. A&D FPL with a non-aged/non-disabled spouse: deduct the $600 maintenance need
   for the spouse and use 138% for one (handbook example).
4. Medically Needy share of cost deducts Part B and other health premiums; the
   $600/$934 levels (1989) still apply (MCD-CA-OQ-04).
5. The other-real-property $6,000 limit is not modelled.

## Weakest parts

- Whole state part depends on a county restatement (MCD-CA-OQ-01).
- 2025 A&D FPL limits for January-March 2026 missing (MCD-CA-OQ-02).
- Premiums for undocumented adults (reported $30 in 2027) not found (MCD-CA-OQ-03).
- October 2026 treatment of refugees/asylees/parolees not found (MCD-CA-OQ-05).

## Questions for a California benefits expert

1. Does ACWDL 25-14/25-20 say "at or below" or "less than" $130,000?
2. Is the maintenance need still $600 for one in 2026?
3. What are the undocumented-adult premium rules and dates?
4. How are lawfully present noncitizens who lost federal funding on October 1, 2026 covered?
5. Is the MC 210 still accepted, and is the SSApp the only current paper application?

## Cross-checks

15 California runs through PolicyEngine US; 3 differ, all explained: table
rounding for a household of 3 ($3,143 vs PolicyEngine's $3,142), PolicyEngine's
strict "assets < limit" at exactly $130,000, and no share-of-cost modelling.

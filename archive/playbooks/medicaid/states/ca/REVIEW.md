# Review notes: Medicaid (Medi-Cal), California

Built 2026-10-07; re-sourced from DHCS the same day (second pass). The first
pass could not reach dhcs.ca.gov and rested every rule on Santa Clara County's
Medi-Cal handbook. The second pass fetched the DHCS letters with a headless
Chromium browser (dhcs.ca.gov refuses scripted requests) and now cites a DHCS
primary for every confirmed rule: ACWDLs 20-18, 20-24, 23-31, 24-10, 25-01,
25-08, 25-13, 25-14, 25-20, 25-25, 25-30, 25-33, 26-01 (and enclosures),
26-07, 26-13, 26-14, 26-16, 89-58; MEDILs I 25-23, I 25-24, I 26-01, I 26-03,
I 26-18, I 26-20; MEPM Article 5L. County sources are now `kind: secondary`
and kept only as cross-checks; one life event (inter-county move) rests on
the county alone and is labelled `secondary`.

## What is solid

- **Asset limit reinstated January 1, 2026** (ACWDL 25-14) for Non-MAGI
  programs: $130,000 for one plus $65,000 per additional person up to 10;
  "at, or under" qualifies (ACWDL 25-20). Pickle, DAC and DW follow on
  January 1, 2027 (ACWDL 26-16). Eliminated January 2024 - December 2025.
  Transition rules for applications, retro months, renewals and CIC.
- **MAGI levels** for 2025 and 2026 straight from the DHCS FPL charts
  (ACWDL 25-01, 26-01): adults 138%, parents 109% (114% with Medicare or
  65+), pregnant 213% full scope. Effective dates by group.
- **A&D FPL program** (ACWDL 20-24, 20-18): 138% FPL after $20, earned
  income deductions, health premiums and the Part B disregard **whoever pays
  the premium**; $600 deduction for a non-applicant spouse and 138% for one;
  2025 limits ($1,801 / $2,433) now cover April 2025 - March 2026.
- **Share of cost**: maintenance need still $600 / $934 (ACWDL 89-58; the
  138% FPL reform of ACWDL 23-31 was revoked by ACWDL 24-10).
- **Immigration**: expansion freeze (ACWDL 25-13), grace period, NQI and QNC
  exemptions, October 2026 move of refugees/asylees to state-funded full
  scope (ACWDL 26-13), $30 premium for ages 19-59 from July 1, 2027 (ACWDL
  25-33), dental cut delayed to July 1, 2027 (MEDIL I 26-18).
- **2027 changes**: retroactive months 1/2 (ACWDL 26-07), WCER with
  look-back month (ACWDL 25-30), six-month renewals from March 2027 renewals
  (ACWDL 26-14). All three letters are marked preliminary.

## What changed in the second pass

- Outcomes: MCD-CA-T21 (refugee, November 2026) undetermined -> eligible
  (state-funded full scope); MCD-CA-T24 (February 2026) undetermined ->
  eligible under the 2025 A&D FPL limit.
- Logic: Part B disregard in the A&D FPL budget no longer requires that the
  person pay the premium (ACWDL 20-18); other health premiums are deducted in
  the A&D FPL budget too (ACWDL 20-24); January-March A&D cases over the prior
  year's limit return undetermined because the COLA is disregarded until
  April; LPRs in the five-year bar and pregnant undocumented applicants get
  (state-funded) full scope instead of undetermined/restricted; premium amount
  reported from July 2027.
- New tests MCD-CA-T27 to T33 pin these.
- Values: 2025 MAGI and A&D FPL values added; no 2026 value changed.

## Assumptions made

1. Over the property limit = ineligible for the month, with the excess shown;
   DHCS allows spending down excess property within the month (ACWDL 25-14),
   which the evaluator does not simulate.
2. New applicants who are qualified non-citizens after October 1, 2026 get
   state-funded full scope: inference from ACWDL 26-13 plus the freeze
   exemption for QNCs in ACWDL 25-13 (noted on MCD-CA-QNC-2026).
3. Parolees count as QNCs only with `facts.parole_one_year_or_more` (a new
   Person fact, not yet listed in the federal rules docstring).
4. The other-real-property $6,000 limit (county handbook only) is not
   modelled.
5. WCER is checked for the as-of month, not DHCS's look-back month.

## Weakest parts

- January-March A&D FPL cases near the limit (COLA disregard; MCD-CA-OQ-02).
- Lawfully present adults who are not QNCs (MCD-CA-OQ-05).
- Premium applicability to refugees/asylees from July 2027 (MCD-CA-OQ-03).
- 2027 letters (26-07, 25-30) are preliminary and may change.

## Questions for a California benefits expert

1. After October 1, 2026, does a newly applying refugee get state-funded
   full scope (our reading of ACWDL 26-13 + 25-13), and do the 2027 premiums
   reach them?
2. How are parolees under one year, TPS holders and pending applicants
   classified (PRUCOL or UIS)?
3. Is any change to the $600 maintenance need planned for 2027?
4. How should the January-March COLA disregard be computed when only the
   post-COLA benefit is known?

## Cross-checks

15 California runs through PolicyEngine US; 3 differ, all explained (now
citing DHCS): DHCS table rounding for a household of 3 ($3,143 vs
PolicyEngine's $3,142), PolicyEngine's strict "assets < limit" at exactly
$130,000 (DHCS says "at, or under"), and no share-of-cost modelling.
PolicyEngine does not model the immigration-status scopes, premiums or the
2027 changes. Santa Clara County figures matched DHCS everywhere except
the dental cut date (MCD-CA-CONFLICT-04) and the 138-213% pregnancy scope
(MCD-CA-CONFLICT-03).

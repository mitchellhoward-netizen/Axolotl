# PolicyEngine US cross-check: school_meals

PolicyEngine US 2.29.14, run 2026-10-07. 45 of 54 households agree.

"Ours (federal minimum)" reruns our shared federal logic without the state's own rules; where PolicyEngine models only federal rules, that column isolates logic errors from policy differences.

| Case | State | Ours | PolicyEngine | Agree | Ours (federal minimum) | Fed. min. agrees | Why they differ |
|---|---|---|---|---|---|---|---|
| SCH-CA-T01 | ca | eligible (free) | eligible (free) | yes | eligible (free) | yes |  |
| SCH-CA-T02 | ca | eligible (free) | eligible (free) | yes | eligible (reduced) | yes |  |
| SCH-CA-T03 | ca | eligible (free) | eligible (free) | yes | ineligible (paid) | yes |  |
| SCH-CA-T04 | ca | eligible (free) | eligible (free) | yes | eligible (free) | yes |  |
| SCH-CA-T05 | ca | eligible (reduced) | eligible (free) | NO | eligible (reduced) | yes | Policy-coverage difference. These students attend a private school in the NSLP. PolicyEngine's state_universal_free_meals flag gives every California household the FREE tier from 2022-07-01, whatever the school. The archive follows Education Code 49501.5 and CDE's Universal Meals guidelines (section IV, "Private/nonpublic schools are generally not required to comply"), so a private-school student gets only the federal category (reduced or paid here). Our federal category matches PolicyEngine's own federal tier for all four. For SCH-CA-T10 the archive also withholds Medi-Cal direct certification, which runs only through CALPADS (not modelled in PolicyEngine). |
| SCH-CA-T06 | ca | ineligible (paid) | eligible (free) | NO | ineligible (paid) | yes | Policy-coverage difference. These students attend a private school in the NSLP. PolicyEngine's state_universal_free_meals flag gives every California household the FREE tier from 2022-07-01, whatever the school. The archive follows Education Code 49501.5 and CDE's Universal Meals guidelines (section IV, "Private/nonpublic schools are generally not required to comply"), so a private-school student gets only the federal category (reduced or paid here). Our federal category matches PolicyEngine's own federal tier for all four. For SCH-CA-T10 the archive also withholds Medi-Cal direct certification, which runs only through CALPADS (not modelled in PolicyEngine). |
| SCH-CA-T07 | ca | eligible (free) | eligible (free) | yes | eligible (free) | yes |  |
| SCH-CA-T08 | ca | ineligible (paid) | eligible (free) | NO | ineligible (paid) | yes | Policy-coverage difference. These students attend a private school in the NSLP. PolicyEngine's state_universal_free_meals flag gives every California household the FREE tier from 2022-07-01, whatever the school. The archive follows Education Code 49501.5 and CDE's Universal Meals guidelines (section IV, "Private/nonpublic schools are generally not required to comply"), so a private-school student gets only the federal category (reduced or paid here). Our federal category matches PolicyEngine's own federal tier for all four. For SCH-CA-T10 the archive also withholds Medi-Cal direct certification, which runs only through CALPADS (not modelled in PolicyEngine). |
| SCH-CA-T09 | ca | eligible (free) | eligible (free) | yes | eligible (reduced) | yes |  |
| SCH-CA-T10 | ca | eligible (reduced) | eligible (free) | NO | eligible (reduced) | yes | Policy-coverage difference. These students attend a private school in the NSLP. PolicyEngine's state_universal_free_meals flag gives every California household the FREE tier from 2022-07-01, whatever the school. The archive follows Education Code 49501.5 and CDE's Universal Meals guidelines (section IV, "Private/nonpublic schools are generally not required to comply"), so a private-school student gets only the federal category (reduced or paid here). Our federal category matches PolicyEngine's own federal tier for all four. For SCH-CA-T10 the archive also withholds Medi-Cal direct certification, which runs only through CALPADS (not modelled in PolicyEngine). |
| SCH-CA-T11 | ca | eligible (free) | eligible (free) | yes | ineligible (paid) | yes |  |
| SCH-CA-T12 | ca | eligible (free) | eligible (free) | yes | eligible (reduced) | yes |  |
| SCH-CA-T13 | ca | eligible (free) | eligible (free) | yes | ineligible (paid) | yes |  |
| SCH-CA-T14 | ca | eligible (free) | eligible (free) | yes | eligible (free) | yes |  |
| SCH-CA-T15 | ca | eligible (free) | eligible (free) | yes | eligible (free) | yes |  |
| SCH-CA-T16 | ca | eligible (free) | eligible (free) | yes | ineligible (paid) | yes |  |
| SCH-IL-T01 | il | eligible (free) | eligible (free) | yes | eligible (free) | yes |  |
| SCH-IL-T02 | il | eligible (reduced) | eligible (reduced) | yes | eligible (reduced) | yes |  |
| SCH-IL-T03 | il | eligible (reduced) | eligible (reduced) | yes | eligible (reduced) | yes |  |
| SCH-IL-T04 | il | ineligible (paid) | ineligible (paid) | yes | ineligible (paid) | yes |  |
| SCH-IL-T05 | il | eligible (free) | eligible (free) | yes | eligible (free) | yes |  |
| SCH-IL-T06 | il | eligible (free) | eligible (free) | yes | eligible (free) | yes |  |
| SCH-IL-T07 | il | eligible (reduced) | eligible (reduced) | yes | eligible (reduced) | yes |  |
| SCH-IL-T08 | il | eligible (free) | eligible (free) | yes | eligible (free) | yes |  |
| SCH-IL-T09 | il | eligible (free) | eligible (free) | yes | eligible (free) | yes |  |
| SCH-IL-T10 | il | eligible (reduced) | eligible (reduced) | yes | eligible (reduced) | yes |  |
| SCH-IL-T11 | il | eligible (free) | eligible (free) | yes | eligible (free) | yes |  |
| SCH-IL-T12 | il | ineligible (paid) | eligible (free) | NO | ineligible (paid) | NO | Unit-of-eligibility difference. The student is the foster child's non-foster sibling. PolicyEngine computes categorical eligibility for the whole SPM unit, so one member with was_in_foster_care makes every child FREE. Under 7 CFR 245.2 and the FNS Eligibility Manual (Other Source Categorically Eligible), foster, homeless, migrant, runaway and Head Start eligibility covers only that child; the sibling is judged on household income ($70,000 for 4 = paid). Rule SCH-FED-CATEGORICAL-INDIVIDUAL. |
| SCH-IL-T13 | il | eligible (free) | ineligible (paid) | NO | ineligible (paid) | yes | PolicyEngine does not model the Community Eligibility Provision. The school is a CEP school (7 CFR 245.9(f)), which serves breakfast and lunch free to all enrolled students; PolicyEngine sees only the $90,000 income (paid). |
| SCH-IL-T14 | il | eligible (free) | eligible (free) | yes | eligible (free) | yes |  |
| SCH-IL-T15 | il | eligible (free) | eligible (free) | yes | eligible (free) | yes |  |
| SCH-IL-T16 | il | eligible (free) | eligible (free) | yes | eligible (free) | yes |  |
| SCH-IL-T17 | il | eligible (reduced) | eligible (free) | NO | eligible (reduced) | NO | School-year vs calendar-year guidelines. On 2026-03-02 the 2025-26 income eligibility guidelines apply (July 1, 2025 - June 30, 2026, built on the 2025 poverty guidelines; free limit $41,795 for 4, FR Doc. 2025-03821). PolicyEngine divides by the 2026 poverty guideline for the 2026 period ($33,000), so $41,796 is 126.7% FPL and FREE. Under the guidelines in force it is $1 over the free limit: reduced price (SCH-FED-SCHOOL-YEAR-IEGS). |
| SCH-IL-T21 | il | ineligible (paid) | ineligible (paid) | yes | ineligible (paid) | yes |  |
| SCH-IL-T21 | ca | eligible (free) | eligible (free) | yes | ineligible (paid) | yes |  |
| SCH-IL-T21 | ny | eligible (free) | eligible (free) | yes | ineligible (paid) | yes |  |
| SCH-X-01 | il | eligible (free) | eligible (free) | yes | eligible (free) | yes |  |
| SCH-NY-T01 | ny | eligible (free) | eligible (free) | yes | eligible (free) | yes |  |
| SCH-NY-T02 | ny | eligible (free) | eligible (free) | yes | eligible (reduced) | yes |  |
| SCH-NY-T03 | ny | eligible (free) | eligible (free) | yes | eligible (reduced) | yes |  |
| SCH-NY-T04 | ny | eligible (free) | eligible (free) | yes | ineligible (paid) | yes |  |
| SCH-NY-T05 | ny | eligible (free) | eligible (free) | yes | eligible (reduced) | yes |  |
| SCH-NY-T06 | ny | eligible (free) | eligible (free) | yes | eligible (reduced) | NO |  |
| SCH-NY-T07 | ny | eligible (free) | eligible (free) | yes | ineligible (paid) | yes |  |
| SCH-NY-T08 | ny | eligible (free) | eligible (free) | yes | eligible (free) | yes |  |
| SCH-NY-T09 | ny | eligible (free) | eligible (free) | yes | eligible (free) | yes |  |
| SCH-NY-T10 | ny | eligible (free) | eligible (free) | yes | ineligible (paid) | yes |  |
| SCH-NY-T11 | ny | ineligible (paid) | eligible (free) | NO | ineligible (paid) | yes | Coverage difference. The school does not run the NSLP/SBP. New York's universal free meals (Education Law 915-a; NYSED memo of May 13, 2025) cover only schools that participate in the federal programs, and without the NSLP there are no federal free or reduced-price meals. PolicyEngine has no school participation input and gives every New York household FREE from 2025-07-01. |
| SCH-NY-T12 | ny | eligible (free) | ineligible (paid) | NO | ineligible (paid) | yes | PolicyEngine timing choice. The date is 2025-09-15, in the first school year of New York's universal free meals (from July 1, 2025). PolicyEngine's school meal variables are yearly and read the state universal-meal parameter at the start of the period (January 1, 2025, when it was still false), so it returns PAID for calendar 2025. The archive applies Education Law 915-a from SY 2025-26 (ny.nysed.universal_meals_start). |
| SCH-NY-T13 | ny | eligible (free) | eligible (free) | yes | eligible (free) | yes |  |
| SCH-NY-T14 | ny | eligible (free) | eligible (free) | yes | eligible (reduced) | yes |  |
| SCH-X-02 | ny | eligible (free) | eligible (free) | yes | eligible (reduced) | yes |  |
| SCH-X-02 | ca | eligible (free) | eligible (free) | yes | eligible (reduced) | yes |  |
| SCH-X-02 | il | eligible (reduced) | eligible (reduced) | yes | eligible (reduced) | yes |  |

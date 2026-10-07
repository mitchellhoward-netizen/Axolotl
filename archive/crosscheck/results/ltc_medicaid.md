# PolicyEngine US cross-check: ltc_medicaid

PolicyEngine US 2.29.14, run 2026-10-07. 39 of 42 households agree.

"Ours (federal minimum)" reruns our shared federal logic without the state's own rules; where PolicyEngine models only federal rules, that column isolates logic errors from policy differences.

| Case | State | Ours | PolicyEngine | Agree | Ours (federal minimum) | Fed. min. agrees | Why they differ |
|---|---|---|---|---|---|---|---|
| LTC-CA-T01 | ca | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |
| LTC-CA-T02 | ca | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |
| LTC-CA-T03 | ca | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |
| LTC-CA-T04 | ca | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |
| LTC-CA-T05 | ca | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |
| LTC-CA-T06 | ca | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |
| LTC-CA-T07 | ca | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |
| LTC-CA-T08 | ca | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |
| LTC-CA-T09 | ca | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |
| LTC-CA-T10 | ca | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |
| LTC-CA-T11 | ca | undetermined (home_equity_test) | eligible (home_equity_test) | NO | eligible (home_equity_test) | yes | Archive gap, recorded as unresolved. Whether California applies the home equity limit before 2028 is an open question (LTC-CA-OQ-01, conflict LTC-CA-CONFLICT-01: federal statute 42 U.S.C. 1396p(f) versus Justice in Aging's statement that California does not apply it yet), so the archive returns "undetermined" for California households with equity above the $752,000 federal minimum and nobody qualifying in the home. PolicyEngine applies its national $1,130,000 limit and finds $900,000 / $760,000 within it. |
| LTC-CA-T15 | ca | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |
| LTC-CA-T16 | ca | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |
| LTC-IL-T01 | il | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |
| LTC-IL-T02 | il | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |
| LTC-IL-T03 | il | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |
| LTC-IL-T04 | il | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |
| LTC-IL-T05 | il | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |
| LTC-IL-T06 | il | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |
| LTC-IL-T07 | il | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |
| LTC-IL-T08 | il | ineligible (home_equity_test) | eligible (home_equity_test) | NO | eligible (home_equity_test) | yes | State policy choice, not a logic difference. PolicyEngine uses one national home equity limit, the federal maximum ($1,130,000 in 2026, parameter gov.hhs.medicaid.eligibility.long_term_care.home_equity.limit), for every state. Illinois elected the federal minimum: $752,000 for 2026 (IDHS WAG 25-03-02 (2), PM 07-02-04-a). The household's $760,000 equity is between the two, so Illinois denies long-term care and PolicyEngine does not. Our federal-minimum column (federal maximum limit) matches PolicyEngine. |
| LTC-IL-T08 | ny | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |
| LTC-IL-T08 | ca | undetermined (home_equity_test) | eligible (home_equity_test) | NO | eligible (home_equity_test) | yes | Archive gap, recorded as unresolved. Whether California applies the home equity limit before 2028 is an open question (LTC-CA-OQ-01, conflict LTC-CA-CONFLICT-01: federal statute 42 U.S.C. 1396p(f) versus Justice in Aging's statement that California does not apply it yet), so the archive returns "undetermined" for California households with equity above the $752,000 federal minimum and nobody qualifying in the home. PolicyEngine applies its national $1,130,000 limit and finds $900,000 / $760,000 within it. |
| LTC-IL-T09 | il | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |
| LTC-IL-T12 | il | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |
| LTC-IL-T13 | il | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |
| LTC-NY-T01 | ny | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |
| LTC-NY-T02 | ny | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |
| LTC-NY-T03 | ny | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |
| LTC-NY-T04 | ny | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |
| LTC-NY-T05 | ny | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |
| LTC-NY-T06 | ny | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |
| LTC-NY-T06 | ca | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |
| LTC-NY-T06 | il | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |
| LTC-NY-T07 | ny | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |
| LTC-NY-T08 | ny | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |
| LTC-NY-T09 | ny | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |
| LTC-NY-T10 | ny | ineligible (home_equity_test) | ineligible (home_equity_test) | yes | ineligible (home_equity_test) | yes |  |
| LTC-NY-T11 | ny | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |
| LTC-NY-T12 | ny | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |
| LTC-NY-T14 | ny | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |
| LTC-NY-T17 | ny | eligible (home_equity_test) | eligible (home_equity_test) | yes | eligible (home_equity_test) | yes |  |

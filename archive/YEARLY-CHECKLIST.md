# Yearly checklist

Numbers in the archive that change on a schedule, and when to re-check them.
The tables below are generated from the `updates:` field of every parameter
(`python -m tools.yearly_checklist`). The calendar is a planning aid that
describes the usual publication pattern. It is not a rule, nothing in the
archive depends on it, and each date should be confirmed against the source
the parameter cites.

| When | What changes | Where it is published | Archive parameters |
|---|---|---|---|
| Early-mid October | Social Security and SSI COLA for next January; SSI federal benefit rate | SSA COLA announcement; POMS SI 02001.020 | `federal.ssa.ssi_federal_benefit_rate_monthly`, state SSI supplements (disability) |
| October 1 | SNAP federal fiscal year: income limits, maximum allotments, standard deductions, shelter cap, resource limits; state utility allowances | USDA FNS COLA memo (published in August); state SNAP agencies (OTDA, CDSS, IDHS) | `federal.usda.snap_*`, `<st>.snap.*` |
| October-November | Medicare Part B premium and deductible, Part A premium and deductibles, IRMAA brackets, Part D base premium (late July/August) | CMS fact sheets; SSA POMS HI 01101.020 | `federal.cms.part_b_standard_premium`, turning_65 parameters |
| Fall / January | Extra Help and MSP resource limits; Medicaid spousal impoverishment standards (CSRA, MMMNA maximum, home equity limit) | SSA POMS HI 03030.025, HI 00815.023; CMS "SSI and Spousal Impoverishment Standards" | `federal.lis.resource_limit`, `federal.msp.resource_limit`, ltc_medicaid parameters |
| Mid-January | HHS poverty guidelines (Federal Register) | Federal Register; ASPE | `federal.hhs.poverty_guideline_annual`, `federal.hhs.poverty_guideline_published` |
| January-April | Each state's Medicaid and MSP levels move to the new poverty guidelines; states do not all use the same date. New York applies them from January 1 by GIS message (published January-February) | NY DOH GIS; CA DHCS ACWDL/MEDIL; IL HFS/IDHS manual releases | `<st>.msp.*`, `<st>.medicaid.*` |
| January | State SSI supplement amounts (CA SSP, NY SSP); NY spousal impoverishment amounts | CDSS; OTDA; NY DOH GIS | disability and ltc_medicaid state parameters |
| February-March | School meal income eligibility guidelines for the school year starting July 1 | USDA FNS notice in the Federal Register | `federal.usda.school_meals_*` |
| July 1 | School meal guidelines take effect; state universal-meal rules for the school year | FNS; CDE, NYSED, ISBE | school_meals parameters |
| Ad hoc | Statutory changes (for example Public Law 119-21: Medicaid retroactive coverage from January 2027, six-month renewals and work requirements for expansion adults, SNAP work rules) | Public law text; CMS and FNS implementation guidance | rules with `effective_from` in the future |

After updating a number, add a **new value** with its own `effective_from`
(never overwrite the old one), re-snapshot its source, run
`python -m tools.validate` and the tests, and re-run the PolicyEngine
cross-check for that program.

## Every yearly number in the archive

Generated 2026-10-07. 77 statutory or fixed numbers are not listed.

### Federal (every state)

| Parameter | Current value | In effect from | Usually changes | Source | File |
|---|---|---|---|---|---|
| `federal.cms.exceptional_sep_months` | medicaid_loss: 6, employer_misinformation: 6 | 2023-01-01 | Regulatory. | cfr-42-407, cfr-42-407 | playbooks/turning_65/federal/parameters/t65_federal.yaml |
| `federal.cms.gep_months` | [1, 2, 3] | 1981-10-01 | Regulatory. | cfr-42-407, usc-42-1395p | playbooks/turning_65/federal/parameters/t65_federal.yaml |
| `federal.cms.part_a_premium_full_monthly` | 565 | 2026-01-01 | CMS announces in the fall; effective January 1. | cms-2026-part-a-b-premiums | playbooks/turning_65/federal/parameters/t65_federal.yaml |
| `federal.cms.part_a_premium_reduced_monthly` | 311 | 2026-01-01 | CMS announces in the fall; effective January 1. | cms-2026-part-a-b-premiums | playbooks/turning_65/federal/parameters/t65_federal.yaml |
| `federal.cms.part_b_deductible` | 283 | 2026-01-01 | CMS announces in October-November; effective January 1. | cms-2026-part-a-b-premiums | shared/parameters/medicare.yaml |
| `federal.cms.part_b_irmaa_monthly` | single: [[0, True, 0.0], [109000, False, 81.2], [137000, False, 202.9], [171000, False, 324.6], [205000, False, 446.3], [500000, True, 487.0]], joint: [[0, True, 0.0], [218000, False, 81.2], [274000, False, 202.9], [342000, False, 324.6], [410000, False, 446.3], [750000, True, 487.0]], separate: [[0, True, 0.0], [109000, False, 446.3], [391000, True, 487.0]] | 2026-01-01 | CMS fact sheet each November; thresholds indexed. | cms-2026-part-a-b-premiums, usc-42-1395r | playbooks/turning_65/federal/parameters/t65_federal.yaml |
| `federal.cms.part_b_standard_premium` | 202.9 | 2026-01-01 | CMS announces in October-November; effective January 1. | cms-2026-part-a-b-premiums | shared/parameters/medicare.yaml |
| `federal.cms.part_d_base_beneficiary_premium` | 38.99 | 2026-01-01 | CMS announces with Part D bid information each summer; effective January 1. | medicare-gov-avoid-penalties | playbooks/turning_65/federal/parameters/t65_federal.yaml |
| `federal.cms.part_d_creditable_gap_days` | 63 | 2006-01-01 | Regulatory. | cfr-42-423 | playbooks/turning_65/federal/parameters/t65_federal.yaml |
| `federal.cms.part_d_irmaa_monthly` | single: [[0, True, 0.0], [109000, False, 14.5], [137000, False, 37.5], [171000, False, 60.4], [205000, False, 83.3], [500000, True, 91.0]], joint: [[0, True, 0.0], [218000, False, 14.5], [274000, False, 37.5], [342000, False, 60.4], [410000, False, 83.3], [750000, True, 91.0]], separate: [[0, True, 0.0], [109000, False, 83.3], [391000, True, 91.0]] | 2026-01-01 | CMS fact sheet each November. | cms-2026-part-a-b-premiums | playbooks/turning_65/federal/parameters/t65_federal.yaml |
| `federal.cms.part_d_late_penalty_percent_per_month` | 1 | 2006-01-01 | Regulatory. | cfr-42-423 | playbooks/turning_65/federal/parameters/t65_federal.yaml |
| `federal.dol.flsa_minimum_wage_hourly` | 7.25 | 2027-01-01 | Only by Act of Congress. | usc-29-206-mcd | playbooks/medicaid/federal/parameters/medicaid_federal.yaml |
| `federal.hhs.poverty_guideline_annual` | 1: 15,960, 2: 21,640, 3: 27,320, 4: 33,000, 5: 38,680, 6: 44,360, 7: 50,040, 8: 55,720, additional: 5,680 | 2026-01-13 | Published in the Federal Register in mid-January each year. | fr-2026-hhs-poverty-guidelines | shared/parameters/poverty_guidelines.yaml |
| `federal.hhs.poverty_guideline_published` | 2026-01-15 | 2026-01-01 | Mid-January each year. | fr-2026-hhs-poverty-guidelines | shared/parameters/poverty_guidelines.yaml |
| `federal.lis.resource_limit` | 1: 16,590, 2: 33,100 | 2026-01-01 | Indexed yearly; SSA updates POMS HI 03030.025 in the fall/January. | ssa-poms-hi-03030-025 | playbooks/msp/federal/parameters/msp_federal.yaml |
| `federal.ltc.cs_housing_allowance` | 811.5 | 2026-07-01 | July 1 each year, with the MMMNA minimum. | cms-cib-2026-04-27 | playbooks/ltc_medicaid/federal/parameters/ltc_federal.yaml |
| `federal.ltc.csra_maximum` | 162,660 | 2026-01-01 | Each January, CPI-U indexed. | cms-cib-2025-12-09, usc-42-1396r-5 | playbooks/ltc_medicaid/federal/parameters/ltc_federal.yaml |
| `federal.ltc.csra_minimum` | 32,532 | 2026-01-01 | Each January, indexed to CPI-U (42 U.S.C. 1396r-5(g)); CMS publishes it in a CMCS bulletin in November-December. | cms-cib-2025-12-09, cms-cib-2026-04-27, usc-42-1396r-5 | playbooks/ltc_medicaid/federal/parameters/ltc_federal.yaml |
| `federal.ltc.home_equity_maximum` | 1,000,000 | 2028-01-01 | Each January; Public Law 119-21 sec. 71108 caps the non-agricultural maximum at $1,000,000 from 2028. | pl-119-21, cms-cib-2025-11-18 | playbooks/ltc_medicaid/federal/parameters/ltc_federal.yaml |
| `federal.ltc.home_equity_minimum` | 752,000 | 2026-01-01 | Each January (CPI-U, rounded to the nearest $1,000). | cms-cib-2025-12-09, usc-42-1396p | playbooks/ltc_medicaid/federal/parameters/ltc_federal.yaml |
| `federal.ltc.mmmna_maximum` | 4,066.5 | 2026-01-01 | Each January, CPI-U indexed (42 U.S.C. 1396r-5(d)(3)(C), (g)). | cms-cib-2025-12-09, cms-cib-2026-04-27 | playbooks/ltc_medicaid/federal/parameters/ltc_federal.yaml |
| `federal.ltc.mmmna_minimum` | 2,705.0 | 2026-07-01 | July 1 each year (second calendar quarter after the poverty guidelines are published, 42 U.S.C. 1396r-5(d)(3)(A)). | cms-cib-2026-04-27 | playbooks/ltc_medicaid/federal/parameters/ltc_federal.yaml |
| `federal.medicaid.decision_days` | disability: 90, other: 45 | 2014-01-01 | Regulatory. | ecfr-42-435-912 | playbooks/medicaid/federal/parameters/medicaid_federal.yaml |
| `federal.msp.qdwi_income_limit_monthly` | 1: 5,405, 2: 7,299 | 2026-01-01 | Mid-January, with the poverty guidelines. | ssa-poms-hi-00815-023 | playbooks/msp/federal/parameters/msp_federal.yaml |
| `federal.msp.qdwi_resource_limit` | 1: 4,000, 2: 6,000 | 2026-01-01 | Changes only if the SSI resource limit changes. | ssa-poms-hi-00815-023 | playbooks/msp/federal/parameters/msp_federal.yaml |
| `federal.msp.qi_income_limit_monthly` | 1: 1,816, 2: 2,455 | 2026-01-01 | Mid-January, with the poverty guidelines. | ssa-poms-hi-00815-023, medicare-gov-msp | playbooks/msp/federal/parameters/msp_federal.yaml |
| `federal.msp.qmb_income_limit_monthly` | 1: 1,350, 2: 1,824 | 2026-01-01 | After the HHS poverty guidelines are published (mid-January); SSA posts the table in POMS HI 00815.023. | ssa-poms-hi-00815-023, medicare-gov-msp | playbooks/msp/federal/parameters/msp_federal.yaml |
| `federal.msp.resource_limit` | 1: 9,950, 2: 14,910 | 2026-01-01 | Indexed yearly with the Part D LIS resource level; CMS/SSA publish in the fall or January. | ssa-poms-hi-00815-023, medicare-gov-msp, usc-42-1396d | playbooks/msp/federal/parameters/msp_federal.yaml |
| `federal.msp.slmb_income_limit_monthly` | 1: 1,616, 2: 2,184 | 2026-01-01 | Mid-January, with the poverty guidelines. | ssa-poms-hi-00815-023, medicare-gov-msp | playbooks/msp/federal/parameters/msp_federal.yaml |
| `federal.snap.excess_shelter_cap_monthly` | 769 | 2026-10-01 | Each October 1. | fns-snap-fy27-allotments-deductions, fns-snap-eligibility | playbooks/snap/federal/parameters/snap_federal.yaml |
| `federal.snap.gross_income_limit_monthly` | 1: 1,729, 2: 2,345, 3: 2,960, 4: 3,575, 5: 4,191, 6: 4,806, 7: 5,421, 8: 6,037, additional: 616 | 2026-10-01 | Each October 1 (FNS COLA tables, published in August). | fns-snap-fy27-income-standards, fns-snap-eligibility | playbooks/snap/federal/parameters/snap_federal.yaml |
| `federal.snap.homeless_shelter_deduction_monthly` | 205.66 | 2026-10-01 | Each October 1. | fns-snap-fy27-allotments-deductions | playbooks/snap/federal/parameters/snap_federal.yaml |
| `federal.snap.max_allotment_cap_monthly` | 3,887 | 2026-10-01 | Each October 1. | fns-snap-fy27-allotments-deductions, pl-119-21-nutrition | playbooks/snap/federal/parameters/snap_federal.yaml |
| `federal.snap.max_allotment_monthly` | 1: 306, 2: 562, 3: 808, 4: 1,023, 5: 1,217, 6: 1,463, 7: 1,616, 8: 1,841, additional: 225 | 2026-10-01 | Each October 1, from the Thrifty Food Plan cost for the preceding June. | fns-snap-fy27-allotments-deductions, fns-snap-cola-page | playbooks/snap/federal/parameters/snap_federal.yaml |
| `federal.snap.min_benefit_monthly` | 25 | 2026-10-01 | Each October 1. | fns-snap-fy27-minimum-allotments, ecfr-7-273-10 | playbooks/snap/federal/parameters/snap_federal.yaml |
| `federal.snap.net_income_limit_monthly` | 1: 1,330, 2: 1,804, 3: 2,277, 4: 2,750, 5: 3,224, 6: 3,697, 7: 4,170, 8: 4,644, additional: 474 | 2026-10-01 | Each October 1. | fns-snap-fy27-income-standards | playbooks/snap/federal/parameters/snap_federal.yaml |
| `federal.snap.resource_limit` | general: 3,000, elderly_disabled: 4,750 | 2026-10-01 | Each October 1 (inflation-adjusted in $250 steps). | fns-snap-fy27-allotments-deductions, fns-snap-elderly-disabled | playbooks/snap/federal/parameters/snap_federal.yaml |
| `federal.snap.standard_deduction_monthly` | 1: 217, 2: 217, 3: 217, 4: 229, 5: 268, 6: 308 | 2026-10-01 | Each October 1. | fns-snap-fy27-allotments-deductions, fns-snap-eligibility | playbooks/snap/federal/parameters/snap_federal.yaml |
| `federal.ssa.appeal_period_days` | 60 | 1980-08-05 | Regulation. | ssa-poms-gn-03101-010, cfr-20-404-909 | playbooks/disability/federal/parameters/disability_federal.yaml |
| `federal.ssa.notice_receipt_presumption_days` | 5 | 1980-08-05 | Regulation. | ssa-poms-gn-03101-010 | playbooks/disability/federal/parameters/disability_federal.yaml |
| `federal.ssa.sga_monthly` | nonblind: 1,690, blind: 2,830 | 2026-01-01 | Each January with the national average wage index (SSA announces in October). | ssa-poms-di-10501-015 | playbooks/disability/federal/parameters/disability_federal.yaml |
| `federal.ssa.ssi_federal_benefit_rate_monthly` | 1: 994, 2: 1,491 | 2026-01-01 | Each January 1 with the Social Security COLA (announced in October). | ssa-poms-si-02001-020 | shared/parameters/ssi.yaml |
| `federal.ssa.twp_service_month_monthly` | 1,210 | 2026-01-01 | Each January (SSA announces in October). | ssa-poms-di-13010-060 | playbooks/disability/federal/parameters/disability_federal.yaml |
| `federal.ssi.pmv_monthly` | 1: 351.33, 2: 517.0 | 2026-01-01 | Each January with the FBR. | ssa-poms-si-00835-901 | playbooks/disability/federal/parameters/disability_federal.yaml |
| `federal.ssi.student_earned_income_exclusion` | monthly: 2,410, yearly: 9,730 | 2026-01-01 | Each January (indexed). | ssa-poms-si-00820-510 | playbooks/disability/federal/parameters/disability_federal.yaml |
| `federal.ssi.vtr_monthly` | 1: 331.33, 2: 497.0 | 2026-01-01 | Each January with the FBR. | ssa-poms-si-00835-901 | playbooks/disability/federal/parameters/disability_federal.yaml |
| `federal.usda.application_notice_operating_days` | 10 | 2025-07-01 | **cadence not recorded** | ecfr-7-cfr-245 | playbooks/school_meals/federal/parameters/school_meals_federal.yaml |
| `federal.usda.carryover_operating_days` | 30 | 2025-07-01 | **cadence not recorded** | ecfr-7-cfr-245 | playbooks/school_meals/federal/parameters/school_meals_federal.yaml |
| `federal.usda.cep_min_isp_percent` | 25 | 2023-10-26 | Changes only by rule. | ecfr-7-cfr-245, fr-2023-20294-cep | playbooks/school_meals/federal/parameters/school_meals_federal.yaml |
| `federal.usda.cep_multiplier` | 1.6 | 2023-10-26 | Changes only by rule. | ecfr-7-cfr-245 | playbooks/school_meals/federal/parameters/school_meals_federal.yaml |
| `federal.usda.cn_ieg_free_income_limit` | annual: {1: 20748, 2: 28132, 3: 35516, 4: 42900, 5: 50284, 6: 57668, 7: 65052, 8: 72436, 'additional': 7384}, monthly: {1: 1729, 2: 2345, 3: 2960, 4: 3575, 5: 4191, 6: 4806, 7: 5421, 8: 6037, 'additional': 616}, twice_monthly: {1: 865, 2: 1173, 3: 1480, 4: 1788, 5: 2096, 6: 2403, 7: 2711, 8: 3019, 'additional': 308}, biweekly: {1: 798, 2: 1082, 3: 1366, 4: 1650, 5: 1934, 6: 2218, 7: 2502, 8: 2786, 'additional': 284}, weekly: {1: 399, 2: 541, 3: 683, 4: 825, 5: 967, 6: 1109, 7: 1251, 8: 1393, 'additional': 142} | 2026-07-01 | Published in the Federal Register each spring; effective July 1 for the school year. | fr-2026-06842-ieg | playbooks/school_meals/federal/parameters/school_meals_federal.yaml |
| `federal.usda.cn_ieg_reduced_income_limit` | annual: {1: 29526, 2: 40034, 3: 50542, 4: 61050, 5: 71558, 6: 82066, 7: 92574, 8: 103082, 'additional': 10508}, monthly: {1: 2461, 2: 3337, 3: 4212, 4: 5088, 5: 5964, 6: 6839, 7: 7715, 8: 8591, 'additional': 876}, twice_monthly: {1: 1231, 2: 1669, 3: 2106, 4: 2544, 5: 2982, 6: 3420, 7: 3858, 8: 4296, 'additional': 438}, biweekly: {1: 1136, 2: 1540, 3: 1944, 4: 2349, 5: 2753, 6: 3157, 7: 3561, 8: 3965, 'additional': 405}, weekly: {1: 568, 2: 770, 3: 972, 4: 1175, 5: 1377, 6: 1579, 7: 1781, 8: 1983, 'additional': 203} | 2026-07-01 | Federal Register each spring; effective July 1. | fr-2026-06842-ieg | playbooks/school_meals/federal/parameters/school_meals_federal.yaml |
| `federal.usda.dcm_free_fpl_percent` | 130 | 2016-07-01 | Set by FNS in the demonstration terms. | fns-dcm-demonstration | playbooks/school_meals/federal/parameters/school_meals_federal.yaml |
| `federal.usda.dcm_reduced_fpl_percent` | 185 | 2016-07-01 | Set by FNS in the demonstration terms. | fns-dcm-demonstration | playbooks/school_meals/federal/parameters/school_meals_federal.yaml |
| `federal.usda.verification_deadline` | 11-15 | 2025-07-01 | **cadence not recorded** | ecfr-7-cfr-245 | playbooks/school_meals/federal/parameters/school_meals_federal.yaml |
| `federal.usda.verification_sample_percent` | 3 | 2025-07-01 | **cadence not recorded** | ecfr-7-cfr-245, usc-42-1758 | playbooks/school_meals/federal/parameters/school_meals_federal.yaml |

### New York

| Parameter | Current value | In effect from | Usually changes | Source | File |
|---|---|---|---|---|---|
| `ny.ltc.csra_maximum` | 162,660 | 2026-01-01 | Each January. | ny-gis-26-ma-03 | playbooks/ltc_medicaid/states/ny/parameters/ltc_ny.yaml |
| `ny.ltc.csra_minimum` | 74,820 | 2026-01-01 | Each January (GIS levels message). | ny-gis-26-ma-03, ny-gis-26-ma-05-att1 | playbooks/ltc_medicaid/states/ny/parameters/ltc_ny.yaml |
| `ny.ltc.family_allowance_maximum` | 902 | 2026-01-01 | When the poverty levels are published. | ny-gis-26-ma-05-att1, ny-gis-26-ma-05 | playbooks/ltc_medicaid/states/ny/parameters/ltc_ny.yaml |
| `ny.ltc.family_allowance_standard` | 2,705 | 2026-01-01 | When the poverty levels are published (re-budgeted back to January 1). | ny-gis-26-ma-05-att1, ny-gis-26-ma-05 | playbooks/ltc_medicaid/states/ny/parameters/ltc_ny.yaml |
| `ny.ltc.home_equity_limit` | 1,130,000 | 2026-01-01 | Each January (GIS levels message). | ny-gis-26-ma-03 | playbooks/ltc_medicaid/states/ny/parameters/ltc_ny.yaml |
| `ny.ltc.mmmna` | 4,066.5 | 2026-01-01 | Each January. | ny-gis-26-ma-03, ny-gis-26-ma-05-att1 | playbooks/ltc_medicaid/states/ny/parameters/ltc_ny.yaml |
| `ny.ltc.regional_rate` | central: 14,146, northeastern: 14,783, western: 13,765, northern_metropolitan: 15,024, new_york_city: 15,282, long_island: 15,193, rochester: 15,675 | 2026-01-01 | Each January (a GIS in December). | ny-gis-25-ma-14 | playbooks/ltc_medicaid/states/ny/parameters/ltc_ny.yaml |
| `ny.ltc.resource_limit` | 1: 33,038, 2: 44,796 | 2026-01-01 | Each January with the poverty levels (GIS chart), effective January 1. | ny-gis-26-ma-05-att1, ny-gis-26-ma-05-att1 | playbooks/ltc_medicaid/states/ny/parameters/ltc_ny.yaml |
| `ny.medicaid.magi_adult_income_limit_monthly` | 1: 1,836, 2: 2,489, 3: 3,142, 4: 3,795, 5: 4,449, 6: 5,102, 7: 5,755, 8: 6,408, 9: 7,061, 10: 7,715, additional: 654 | 2026-01-01 | New chart by GIS each January-February, effective January 1. | ny-gis-26-ma-05-att1, ny-gis-26-ma-05-att1 | playbooks/medicaid/states/ny/parameters/medicaid_ny.yaml |
| `ny.medicaid.magi_parent_income_limit_monthly` | 1: 1,836, 2: 2,489, 3: 3,142, 4: 3,795, 5: 4,449, 6: 5,102, 7: 5,755, 8: 6,408, 9: 7,061, 10: 7,715, additional: 654 | 2026-01-01 | New chart by GIS each January-February, effective January 1. | ny-gis-26-ma-05-att1 | playbooks/medicaid/states/ny/parameters/medicaid_ny.yaml |
| `ny.medicaid.magi_pregnant_income_limit_monthly` | 2: 4,022, 3: 5,077, 4: 6,133, 5: 7,189, 6: 8,244, 7: 9,300, 8: 10,355, 9: 11,411, 10: 12,466, additional: 1,056 | 2026-01-01 | New chart by GIS each January-February, effective January 1. | ny-gis-26-ma-05-att1 | playbooks/medicaid/states/ny/parameters/medicaid_ny.yaml |
| `ny.medicaid.ssi_related_income_limit_monthly` | 1: 1,836, 2: 2,489 | 2026-01-01 | New chart by GIS each January-February, effective January 1. | ny-gis-26-ma-05-att1, ny-gis-26-ma-05 | playbooks/medicaid/states/ny/parameters/medicaid_ny.yaml |
| `ny.medicaid.ssi_related_resource_limit` | 1: 33,038, 2: 44,796 | 2026-01-01 | New chart by GIS each January-February, effective January 1. | ny-gis-26-ma-05-att1 | playbooks/medicaid/states/ny/parameters/medicaid_ny.yaml |
| `ny.msp.part_b_premium_budgeted_before_fpl_release` | 185.0 | 2026-01-01 | Each January, by GIS. | ny-gis-26-ma-03, ny-gis-26-ma-05 | playbooks/msp/states/ny/parameters/msp_ny.yaml |
| `ny.msp.qdwi_income_limit_monthly` | 1: 2,660, 2: 3,607 | 2026-01-01 | New FPL chart each year. | ny-gis-26-ma-05-att1 | playbooks/msp/states/ny/parameters/msp_ny.yaml |
| `ny.msp.qi_income_limit_monthly` | 1: 2,474, 2: 3,355 | 2026-01-01 | New FPL chart via a GIS each January-February, effective January 1. | ny-gis-26-ma-05-att1, ny-doh-msp-2026 | playbooks/msp/states/ny/parameters/msp_ny.yaml |
| `ny.msp.qmb_income_limit_monthly` | 1: 1,836, 2: 2,489 | 2026-01-01 | New FPL chart via a GIS each January-February, effective January 1. | ny-gis-26-ma-05-att1, ny-doh-msp-2026 | playbooks/msp/states/ny/parameters/msp_ny.yaml |
| `ny.nysed.dcm_type` | free_only | 2012-07-01 | **cadence not recorded** | fns-dcm-demonstration, nysed-dcmp-2026 | playbooks/school_meals/states/ny/parameters/school_meals_ny.yaml |
| `ny.nysed.dcmp_matches_per_year` | 3 | 2025-07-01 | **cadence not recorded** | nysed-dcmp-2026, ny-edn-915-a-publiclaw | playbooks/school_meals/states/ny/parameters/school_meals_ny.yaml |
| `ny.nysed.universal_meals_start` | 2025-07-01 | 2025-07-01 | **cadence not recorded** | nysed-ufm-memo-2025, ny-edn-915-a-publiclaw | playbooks/school_meals/states/ny/parameters/school_meals_ny.yaml |
| `ny.snap.bbce_150_income_limit_monthly` | None | 2026-10-01 | Each October 1. |  | playbooks/snap/states/ny/parameters/snap_ny.yaml |
| `ny.snap.bbce_200_income_limit_monthly` | None | 2026-10-01 | Each October 1 (OTDA SNAP standards GIS). |  | playbooks/snap/states/ny/parameters/snap_ny.yaml |
| `ny.snap.heating_cooling_sua_monthly` | None | 2026-10-01 | Each October 1. |  | playbooks/snap/states/ny/parameters/snap_ny.yaml |
| `ny.snap.phone_sua_monthly` | None | 2026-10-01 | Each October 1. |  | playbooks/snap/states/ny/parameters/snap_ny.yaml |
| `ny.snap.utility_sua_monthly` | None | 2026-10-01 | Each October 1. |  | playbooks/snap/states/ny/parameters/snap_ny.yaml |

### California

| Parameter | Current value | In effect from | Usually changes | Source | File |
|---|---|---|---|---|---|
| `ca.calfresh.bbce_gross_income_limit_monthly` | 1: 2,660, 2: 3,608, 3: 4,554, 4: 5,500, 5: 6,448, 6: 7,394, 7: 8,340, 8: 9,288, additional: 948 | 2026-10-01 | Each October 1 (CDSS COLA ACIN). | ca-acin-i-40-26 | playbooks/snap/states/ca/parameters/snap_ca.yaml |
| `ca.calfresh.smd_actual_expense_threshold_monthly` | 185 | 2024-10-01 | With the SMD demonstration terms. | ca-acl-26-04, ca-acl-24-59 | playbooks/snap/states/ca/parameters/snap_ca.yaml |
| `ca.calfresh.standard_medical_deduction_monthly` | 150 | 2025-10-01 | Set in the FNS demonstration approval (currently through September 30, 2029). | ca-acl-26-04 | playbooks/snap/states/ca/parameters/snap_ca.yaml |
| `ca.calfresh.utility_allowances_monthly` | heating_cooling: 686, limited: 176, telephone: 21 | 2026-10-01 | Each October 1. | ca-acin-i-40-26 | playbooks/snap/states/ca/parameters/snap_ca.yaml |
| `ca.cde.dcm_type` | free_and_reduced | 2017-07-01 | **cadence not recorded** | fns-dcm-demonstration, ca-cde-direct-cert | playbooks/school_meals/states/ca/parameters/school_meals_ca.yaml |
| `ca.cde.lcff_alt_income_form_deadline` | 10-31 | 2025-07-01 | **cadence not recorded** | ca-cde-alt-income-forms, ca-cde-alt-income-forms | playbooks/school_meals/states/ca/parameters/school_meals_ca.yaml |
| `ca.cde.ump_provision_isp_percent` | 40 | 2022-07-01 | **cadence not recorded** | ca-cde-ump-guidelines-2024 | playbooks/school_meals/states/ca/parameters/school_meals_ca.yaml |
| `ca.cde.universal_meals_start` | 2022-07-01 | 2022-07-01 | **cadence not recorded** | ca-ec-49501-5, ca-cde-ump-guidelines-2024 | playbooks/school_meals/states/ca/parameters/school_meals_ca.yaml |
| `ca.medi_cal.ad_fpl_income_limit_monthly` | 1: 1,836, 2: 2,490 | 2026-04-01 | Each year; ABD levels effective April 1. | ca-scc-chart-fpl-2026, ca-scc-mc-ad-fpl-program | playbooks/medicaid/states/ca/parameters/medi_cal_ca.yaml |
| `ca.medi_cal.magi_adult_income_limit_monthly` | 1: 1,836, 2: 2,490, 3: 3,143, 4: 3,795, 5: 4,450, 6: 5,102, 7: 5,755, 8: 6,409, 9: 7,062, 10: 7,715, 11: 8,369, 12: 9,022, additional: 655 | 2026-01-01 | Each year; MAGI levels effective January 1. | ca-scc-chart-fpl-2026, ca-scc-chart-fpl-2026 | playbooks/medicaid/states/ca/parameters/medi_cal_ca.yaml |
| `ca.medi_cal.magi_parent_income_limit_monthly` | 1: 1,450, 2: 1,967, 3: 2,482, 4: 2,998, 5: 3,515, 6: 4,030, 7: 4,546, 8: 5,062, 9: 5,578, 10: 6,094, 11: 6,610, 12: 7,126, additional: 517 | 2026-01-01 | Each year; MAGI levels effective January 1. | ca-scc-chart-fpl-2026 | playbooks/medicaid/states/ca/parameters/medi_cal_ca.yaml |
| `ca.medi_cal.magi_parent_medicare_income_limit_monthly` | 1: 1,517, 2: 2,057, 3: 2,596, 4: 3,135, 5: 3,676, 6: 4,215, 7: 4,754, 8: 5,295, 9: 5,834, 10: 6,373, 11: 6,913, 12: 7,453, additional: 541 | 2026-01-01 | Each year; MAGI levels effective January 1. | ca-scc-chart-fpl-2026 | playbooks/medicaid/states/ca/parameters/medi_cal_ca.yaml |
| `ca.medi_cal.magi_pregnant_income_limit_monthly` | 1: 2,833, 2: 3,843, 3: 4,851, 4: 5,858, 5: 6,868 | 2026-01-01 | Each year; MAGI levels effective January 1. | ca-scc-chart-fpl-2026 | playbooks/medicaid/states/ca/parameters/medi_cal_ca.yaml |
| `ca.medi_cal.maintenance_need_monthly` | 1: 600, 2: 934, 3: 934, 4: 1,100, 5: 1,259, 6: 1,417, 7: 1,550, 8: 1,692, 9: 1,825, 10: 1,959 | 1989-07-01 | The county chart shows the level unchanged since July 1, 1989 (see MCD-CA-OQ-04 on the reported, then revoked, plan to raise it to 138% FPL). | ca-scc-chart-maintenance-need | playbooks/medicaid/states/ca/parameters/medi_cal_ca.yaml |
| `ca.medi_cal_ltc.appr` | 14,440 | 2026-01-01 | Each January-February (ACWDL); applies to cases with an application or institutionalization date in that year. | ca-dhcs-acwdl-26-03 | playbooks/ltc_medicaid/states/ca/parameters/ltc_ca.yaml |
| `ca.medi_cal_ltc.asset_limit` | 1: 130,000, 2: 195,000, 3: 260,000, 4: 325,000, 5: 390,000 | 2026-01-01 | Only by legislation (not indexed). | ca-dhcs-acwdl-25-14, ca-dhcs-acwdl-26-02 | playbooks/ltc_medicaid/states/ca/parameters/ltc_ca.yaml |
| `ca.medi_cal_ltc.asset_test_applies` | 1 | 2026-01-01 | Only by legislation. | ca-dhcs-acwdl-25-14 | playbooks/ltc_medicaid/states/ca/parameters/ltc_ca.yaml |
| `ca.medi_cal_ltc.csra` | 162,660 | 2026-01-01 | Each January (ACWDL on spousal impoverishment caps). | ca-dhcs-acwdl-26-02 | playbooks/ltc_medicaid/states/ca/parameters/ltc_ca.yaml |
| `ca.medi_cal_ltc.lookback_months` | 30 | 2026-01-01 | Regulation (22 CCR 50408); not indexed. | ca-dhcs-acwdl-25-18 | playbooks/ltc_medicaid/states/ca/parameters/ltc_ca.yaml |
| `ca.medi_cal_ltc.max_poi_months` | 30 | 2026-01-01 | Regulation. | ca-dhcs-acwdl-25-18 | playbooks/ltc_medicaid/states/ca/parameters/ltc_ca.yaml |
| `ca.medi_cal_ltc.mmmna` | 4,067 | 2026-01-01 | Each January (ACWDL). | ca-dhcs-acwdl-26-02 | playbooks/ltc_medicaid/states/ca/parameters/ltc_ca.yaml |
| `ca.medi_cal_ltc.pna` | 35 | 2002-01-01 | Set in statute/regulation; DHCS may raise it. | ca-dhcs-ltc-medi-cal-qa | playbooks/ltc_medicaid/states/ca/parameters/ltc_ca.yaml |
| `ca.msp.asset_limit` | 1: 130,000, 2: 195,000 | 2026-01-01 | Not indexed; DHCS said it will no longer publish a yearly MSP property-limit letter. | ca-dhcs-acwdl-25-27, ca-dhcs-acwdl-25-14, ca-dhcs-msp-page | playbooks/msp/states/ca/parameters/msp_ca.yaml |
| `ca.msp.asset_test_applies` | 1 | 2026-01-01 | Only by legislation (WIC 14005.62). | ca-dhcs-acwdl-25-14, ca-dhcs-acwdl-25-27 | playbooks/msp/states/ca/parameters/msp_ca.yaml |
| `ca.msp.asset_test_start_application_date` | 2026-01-01 | 2026-01-01 | One-time transition. | ca-dhcs-acwdl-25-14 | playbooks/msp/states/ca/parameters/msp_ca.yaml |
| `ca.msp.new_fpl_month_rsdi` | 3 | 2025-01-01 | Restated each January in the FPL ACWDL. | ca-dhcs-acwdl-25-01, ca-dhcs-acwdl-26-01, ca-dhcs-fpl-2026-programs | playbooks/msp/states/ca/parameters/msp_ca.yaml |
| `ca.msp.qdwi_income_limit_monthly` | 1: 2,660, 2: 3,608 | 2026-01-01 | Each January by ACWDL (Enclosure 1). | ca-dhcs-msp-page, ca-dhcs-fpl-2026-programs | playbooks/msp/states/ca/parameters/msp_ca.yaml |
| `ca.msp.qi_income_limit_monthly` | 1: 1,796, 2: 2,436 | 2026-01-01 | Each January by ACWDL (Enclosure 1). | ca-dhcs-fpl-2026-monthly, ca-dhcs-msp-page | playbooks/msp/states/ca/parameters/msp_ca.yaml |
| `ca.msp.qmb_income_limit_monthly` | 1: 1,330, 2: 1,804 | 2026-01-01 | Each January by ACWDL (Enclosure 1); in effect from January 1 for non-RSDI cases and March 1 for RSDI cases. | ca-dhcs-fpl-2026-monthly, ca-dhcs-msp-page | playbooks/msp/states/ca/parameters/msp_ca.yaml |
| `ca.msp.slmb_income_limit_monthly` | 1: 1,596, 2: 2,165 | 2026-01-01 | Each January by ACWDL (Enclosure 1). | ca-dhcs-fpl-2026-monthly, ca-dhcs-msp-page | playbooks/msp/states/ca/parameters/msp_ca.yaml |
| `ca.msp.standard_ssi_allocation_monthly` | None | 2025-01-01 | MEPM 5L says the amount is "provided to counties annually"; no current DHCS figure was found. | ca-dhcs-mepm-5l | playbooks/msp/states/ca/parameters/msp_ca.yaml |
| `ca.ssp.payment_level_couple` | A: {'aged/aged': 607.83, 'blind/blind': 833.35, 'disabled/disabled': 607.83, 'aged/blind': 747.44, 'aged/disabled': 607.83, 'blind/disabled': 747.44}, B: {'all': 1761.14}, C: {'aged/aged': 865.57, 'disabled/disabled': 865.57, 'aged/disabled': 865.57}, D: {'aged/aged': 615.7, 'blind/blind': 841.22, 'disabled/disabled': 615.7, 'aged/blind': 755.31, 'aged/disabled': 615.7, 'blind/disabled': 755.31}, F: {'all': 1604.2}, J: {'all': 64.0} | 2026-01-01 | State budget; POMS SI 01415.0xx each January. | ssa-poms-si-01415-058, ca-cdss-2026mr-ssp-grant | playbooks/disability/states/ca/parameters/ssp_ca.yaml |
| `ca.ssp.payment_level_individual` | A: {'aged': 239.94, 'blind': 324.32, 'disabled': 239.94}, B: {'all': 632.07}, C: {'aged': 368.81, 'disabled': 368.81}, D: {'aged': 245.2, 'blind': 329.58, 'disabled': 245.2}, F: {'all': 624.4}, J: {'all': 32.0} | 2026-01-01 | State budget; SSA publishes the January levels in POMS SI 01415.0xx each year. | ssa-poms-si-01415-058, ca-cdss-2026mr-ssp-grant | playbooks/disability/states/ca/parameters/ssp_ca.yaml |

### Illinois

| Parameter | Current value | In effect from | Usually changes | Source | File |
|---|---|---|---|---|---|
| `il.aabd.grant_adjustment_monthly` | 816.9 | 2026-01-01 | Each January with the SSI increase. | il-dhs-pm-11-01-07 | playbooks/disability/states/il/parameters/aabd_il.yaml |
| `il.aging.benefit_access_income_limit` | 1: 33,562, 2: 44,533, 3: 55,500 | 2026-01-01 | Illinois Department on Aging, yearly. | il-aging-benefit-access | playbooks/turning_65/states/il/parameters/t65_il.yaml |
| `il.isbe.dcm_type` | free_and_reduced | 2022-07-01 | **cadence not recorded** | fns-dcm-demonstration, il-isbe-dc-slides-2026 | playbooks/school_meals/states/il/parameters/school_meals_il.yaml |
| `il.isbe.hsmfa_statewide_funded` | 0 | 2025-07-01 | **cadence not recorded** | il-105-ilcs-125-2-3, il-hb2365-status, il-hsc-hsmfa-blog, il-iphi-hsmfa-overview-2026 | playbooks/school_meals/states/il/parameters/school_meals_il.yaml |
| `il.ltc.csmna_standard` | 4,066.5 | 2026-01-01 | Each January (IDHS manual release). | il-idhs-mr-26-05, il-idhs-pm-15-04-04-a | playbooks/ltc_medicaid/states/il/parameters/ltc_il.yaml |
| `il.ltc.csra` | 143,172 | 2026-01-01 | Each January (Public Act 102-1037; IDHS manual release), for applications received in that year. | il-idhs-mr-26-05, il-idhs-pm-07-02-22 | playbooks/ltc_medicaid/states/il/parameters/ltc_il.yaml |
| `il.ltc.fmna_standard` | 2,705.0 | 2026-01-01 | Each January. | il-idhs-wag-25-03-02-2 | playbooks/ltc_medicaid/states/il/parameters/ltc_il.yaml |
| `il.ltc.home_equity_limit` | 752,000 | 2026-01-01 | Each January. | il-idhs-wag-25-03-02-2, il-idhs-pm-07-02-04-a | playbooks/ltc_medicaid/states/il/parameters/ltc_il.yaml |
| `il.ltc.lookback_months` | 60 | 2026-01-01 | Federal law. | il-idhs-pm-07-02-20 | playbooks/ltc_medicaid/states/il/parameters/ltc_il.yaml |
| `il.ltc.pna_nursing_home` | 60 | 2026-01-01 | State rule; not indexed. | il-idhs-pm-15-06-02-b | playbooks/ltc_medicaid/states/il/parameters/ltc_il.yaml |
| `il.medicaid.aabd_asset_limit` | 17,500 | 2023-05-12 | State policy; unchanged since May 12, 2023. | il-idhs-pm-07-02-01-mcd | playbooks/medicaid/states/il/parameters/medicaid_il.yaml |
| `il.medicaid.aabd_income_disregard_monthly` | 25 | 2026-10-07 | State policy. | il-idhs-pm-15-04-03-a | playbooks/medicaid/states/il/parameters/medicaid_il.yaml |
| `il.medicaid.aabd_income_limit_monthly` | 1: 1,330, 2: 1,803, 3: 2,276, 4: 2,750, 5: 3,223, 6: 3,696, 7: 4,170, 8: 4,643, 9: 5,116, 10: 5,590, additional: 473 | 2026-10-07 | Yearly with the FPL. | il-idhs-wag-25-03-02-2-mcd, il-idhs-pm-15-06-02-a | playbooks/medicaid/states/il/parameters/medicaid_il.yaml |
| `il.medicaid.aca_adult_income_limit_monthly` | 1: 1,835, 2: 2,488, 3: 3,141, 4: 3,795, 5: 4,448, 6: 5,101, 7: 5,754, 8: 6,407, 9: 7,061, 10: 7,714, additional: 652 | 2026-10-07 | Yearly with the FPL; IDHS updates WAG 25-03-02 (2). | il-idhs-wag-25-03-02-2-mcd, il-idhs-pm-15-06-01-b | playbooks/medicaid/states/il/parameters/medicaid_il.yaml |
| `il.medicaid.moms_babies_income_limit_monthly` | 2: 3,841, 3: 4,849, 4: 5,857, 5: 6,865, 6: 7,873, 7: 8,882, 8: 9,890, 9: 10,898, 10: 11,906, additional: 1,007 | 2026-10-07 | Yearly with the FPL. | il-idhs-wag-25-03-02-2-mcd | playbooks/medicaid/states/il/parameters/medicaid_il.yaml |
| `il.medicaid.vehicle_exempt_value` | 4,500 | 2026-10-07 | State policy. | il-idhs-pm-07-02-05 | playbooks/medicaid/states/il/parameters/medicaid_il.yaml |
| `il.msp.qdwi_income_limit_monthly` | 1: 2,660, 2: 3,606 | 2026-01-01 | Yearly with the FPL. | il-idhs-pm-06-06-03, il-idhs-wag-25-03-02-msp | playbooks/msp/states/il/parameters/msp_il.yaml |
| `il.msp.qdwi_resource_limit` | 1: 4,000, 2: 6,000 | 1997-03-01 | Only if the SSI resource limit changes. | il-idhs-pm-06-06-03, ssa-poms-hi-00815-023 | playbooks/msp/states/il/parameters/msp_il.yaml |
| `il.msp.qi_income_limit_monthly` | 1: 1,794, 2: 2,433 | 2026-01-01 | With the QMB standard. | il-idhs-wag-25-03-02-msp | playbooks/msp/states/il/parameters/msp_il.yaml |
| `il.msp.qi_income_limit_pm_text_monthly` | 1: 1,795, 2: 2,434 | 2026-01-01 | With the QMB standard. | il-idhs-pm-06-14-01-b, fr-2026-hhs-poverty-guidelines | playbooks/msp/states/il/parameters/msp_il.yaml |
| `il.msp.qmb_income_limit_monthly` | 1: 1,330, 2: 1,803 | 2026-01-01 | Each spring by Manual Release, effective January 1 (MR | il-idhs-wag-25-03-02-msp, il-idhs-mr-26-11 | playbooks/msp/states/il/parameters/msp_il.yaml |
| `il.msp.resource_limit` | 1: 9,950, 2: 14,910 | 2026-01-01 | Yearly, with the federal MSP / Part D LIS resource level; posted in WAG 25-03-02(2). | il-idhs-wag-25-03-02-msp, il-idhs-mr-26-11 | playbooks/msp/states/il/parameters/msp_il.yaml |
| `il.msp.slib_income_limit_monthly` | 1: 1,595, 2: 2,163 | 2026-01-01 | With the QMB standard. | il-idhs-wag-25-03-02-msp | playbooks/msp/states/il/parameters/msp_il.yaml |
| `il.snap.bbce_gross_income_limit_monthly` | 1: 2,195, 2: 2,976, 3: 3,757, 4: 4,538, 5: 5,319, 6: 6,100, 7: 6,881, 8: 7,662, 9: 8,443, 10: 9,224, additional: 781 | 2026-10-01 | Each October 1 (IDHS COLA Manual Release). | il-idhs-mr-26-26, il-idhs-wag-25-03-02-1 | playbooks/snap/states/il/parameters/snap_il.yaml |
| `il.snap.bbce_qm_gross_income_limit_monthly` | 1: 2,660, 2: 3,607, 3: 4,554, 4: 5,500, 5: 6,447, 6: 7,394, 7: 8,340, 8: 9,287, 9: 10,234, 10: 11,180, additional: 947 | 2026-10-01 | Each October 1. | il-idhs-mr-26-26, il-idhs-wag-25-03-02-1 | playbooks/snap/states/il/parameters/snap_il.yaml |
| `il.snap.standard_deduction_monthly` | 1: 213, 2: 213, 3: 213, 4: 225, 5: 264, 6: 304 | 2026-10-01 | Each October 1. | il-idhs-mr-26-26, il-idhs-wag-25-03-02-1 | playbooks/snap/states/il/parameters/snap_il.yaml |
| `il.snap.utility_standards_monthly` | ac_heat: 565, limited: 472, single: 80, telephone: 69 | 2026-10-01 | Each October 1 (FNS-approved annual review). | il-idhs-mr-26-26, il-idhs-wag-25-03-02-1 | playbooks/snap/states/il/parameters/snap_il.yaml |

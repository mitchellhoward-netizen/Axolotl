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

Generated 2026-10-07. 11 statutory or fixed numbers are not listed.

### Federal (every state)

| Parameter | Current value | In effect from | Usually changes | Source | File |
|---|---|---|---|---|---|
| `federal.cms.part_b_deductible` | 283 | 2026-01-01 | CMS announces in October-November; effective January 1. | cms-2026-part-a-b-premiums | shared/parameters/medicare.yaml |
| `federal.cms.part_b_standard_premium` | 202.9 | 2026-01-01 | CMS announces in October-November; effective January 1. | cms-2026-part-a-b-premiums | shared/parameters/medicare.yaml |
| `federal.hhs.poverty_guideline_annual` | 1: 15,960, 2: 21,640, 3: 27,320, 4: 33,000, 5: 38,680, 6: 44,360, 7: 50,040, 8: 55,720, additional: 5,680 | 2026-01-13 | Published in the Federal Register in mid-January each year. | fr-2026-hhs-poverty-guidelines | shared/parameters/poverty_guidelines.yaml |
| `federal.hhs.poverty_guideline_published` | 2026-01-15 | 2026-01-01 | Mid-January each year. | fr-2026-hhs-poverty-guidelines | shared/parameters/poverty_guidelines.yaml |
| `federal.lis.resource_limit` | 1: 16,590, 2: 33,100 | 2026-01-01 | Indexed yearly; SSA updates POMS HI 03030.025 in the fall/January. | ssa-poms-hi-03030-025 | playbooks/msp/federal/parameters/msp_federal.yaml |
| `federal.msp.qdwi_income_limit_monthly` | 1: 5,405, 2: 7,299 | 2026-01-01 | Mid-January, with the poverty guidelines. | ssa-poms-hi-00815-023 | playbooks/msp/federal/parameters/msp_federal.yaml |
| `federal.msp.qdwi_resource_limit` | 1: 4,000, 2: 6,000 | 2026-01-01 | Changes only if the SSI resource limit changes. | ssa-poms-hi-00815-023 | playbooks/msp/federal/parameters/msp_federal.yaml |
| `federal.msp.qi_income_limit_monthly` | 1: 1,816, 2: 2,455 | 2026-01-01 | Mid-January, with the poverty guidelines. | ssa-poms-hi-00815-023, medicare-gov-msp | playbooks/msp/federal/parameters/msp_federal.yaml |
| `federal.msp.qmb_income_limit_monthly` | 1: 1,350, 2: 1,824 | 2026-01-01 | After the HHS poverty guidelines are published (mid-January); SSA posts the table in POMS HI 00815.023. | ssa-poms-hi-00815-023, medicare-gov-msp | playbooks/msp/federal/parameters/msp_federal.yaml |
| `federal.msp.resource_limit` | 1: 9,950, 2: 14,910 | 2026-01-01 | Indexed yearly with the Part D LIS resource level; CMS/SSA publish in the fall or January. | ssa-poms-hi-00815-023, medicare-gov-msp, usc-42-1396d | playbooks/msp/federal/parameters/msp_federal.yaml |
| `federal.msp.slmb_income_limit_monthly` | 1: 1,616, 2: 2,184 | 2026-01-01 | Mid-January, with the poverty guidelines. | ssa-poms-hi-00815-023, medicare-gov-msp | playbooks/msp/federal/parameters/msp_federal.yaml |
| `federal.ssa.ssi_federal_benefit_rate_monthly` | 1: 994, 2: 1,491 | 2026-01-01 | Each January 1 with the Social Security COLA (announced in October). | ssa-poms-si-02001-020 | shared/parameters/ssi.yaml |

### New York

| Parameter | Current value | In effect from | Usually changes | Source | File |
|---|---|---|---|---|---|
| `ny.msp.part_b_premium_budgeted_before_fpl_release` | 185.0 | 2026-01-01 | Each January, by GIS. | ny-gis-26-ma-03, ny-gis-26-ma-05 | playbooks/msp/states/ny/parameters/msp_ny.yaml |
| `ny.msp.qdwi_income_limit_monthly` | 1: 2,660, 2: 3,607 | 2026-01-01 | New FPL chart each year. | ny-gis-26-ma-05-att1 | playbooks/msp/states/ny/parameters/msp_ny.yaml |
| `ny.msp.qi_income_limit_monthly` | 1: 2,474, 2: 3,355 | 2026-01-01 | New FPL chart via a GIS each January-February, effective January 1. | ny-gis-26-ma-05-att1, ny-doh-msp-2026 | playbooks/msp/states/ny/parameters/msp_ny.yaml |
| `ny.msp.qmb_income_limit_monthly` | 1: 1,836, 2: 2,489 | 2026-01-01 | New FPL chart via a GIS each January-February, effective January 1. | ny-gis-26-ma-05-att1, ny-doh-msp-2026 | playbooks/msp/states/ny/parameters/msp_ny.yaml |

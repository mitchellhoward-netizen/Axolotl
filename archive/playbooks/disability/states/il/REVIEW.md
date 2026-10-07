# Review notes: Disability and SSI, Illinois

For a reviewer who knows Illinois AABD. Built 2026-10-07 from SSA POMS
(SI 01415.010, SI 01715.010 and the federal SSI sections) and the IDHS Cash,
SNAP and Medical Policy Manual and Workers' Action Guide (PM 03-03-02,
PM 07-02-01, PM 09-02-03-b, PM 11-01-00 to 11-02-07-e, WAG 11-01-01,
WAG 25-03-03, WAG 25-06-01), plus an IDHS DRS report and the state grant
catalog for Disability Determination Services. Rules are in `playbook.yaml`
and `../../federal/playbook.yaml`; numbers in `parameters/aabd_il.yaml`.

## What is solid

- **Illinois supplements SSI through IDHS, not SSA**: SSA's chart lists both
  Illinois supplements as state-administered; IDHS calls AABD cash its "State
  Supplemental Payments".
- **The budgeting method**: AABD cash = AABD Cash Assistance Standard minus
  nonexempt income (SSI included) after a $25 exemption, paid if at least $1
  (PM 03-03-02, 11-01-13, 11-02-02, 11-02-03).
- **The standard's parts**: personal allowance chart (active $62.43 alone,
  $57.25 for two), shelter up to $97 per dwelling (divided in a shared
  arrangement), standard utility allowances by area (all eight areas and 102
  counties), grant adjustment $816.90 from January 2026 ($788.90 in 2025).
- **Couples**: separate budgets, each with the grant adjustment and $25,
  excess income of one spouse applied to the other (PM 11-02-07-e).
- **AABD cash resource limit** $2,000 / $3,000; AABD medical $17,500 since
  May 12, 2023.
- **Medicaid link**: Illinois is a 209(b) state (SI 01715.010); SSI does not
  bring Medicaid; apply for AABD medical with IDHS.

## Assumptions made

1. **All unearned income counts** for AABD (Social Security, pensions, VA,
   etc.). PolicyEngine's Illinois model exempts pensions and VA benefits; the
   archive did not find the IDHS income-exemption list (DIS-IL-OQ-03).
2. **Earned income disregard** of $20 plus half of the next $60 is taken from
   the worked example in PM 11-01-13 (DIS-IL-OQ-05).
3. **Utilities default to none** unless the household says which it pays; the
   allowance is the standard amount, not the actual bill.
4. **SSI resource exclusions** are used for the AABD resource test
   (DIS-IL-OQ-06).
5. **Effective dates**: most WAG/PM values are undated; they are recorded from
   2026-01-01 (the archive's earliest vouched date) with DIS-IL-OQ-02.
6. A couple's federal SSI is split equally between the spouses as income.

## Weakest parts

- **Ineligible spouse, child with parents, long-term care, sheltered care**:
  AABD is left undetermined (DIS-IL-OQ-01). Only the federal SSI is computed.
- **Income exemptions** (pensions, VA) could change results for union
  retirees (DIS-IL-OQ-03) — the highest-risk gap for this population.
- **89 Ill. Adm. Code 113** could not be read (ilga.gov TLS chain failed from
  this environment), so the manual is the only source.
- Laundry, telephone, transportation, special diet and restaurant-meal
  allowances are not encoded.
- The "Bureau of Disability Determination Services" title was not found; IDHS
  sources say "Disability Determination Services" in the Division of
  Rehabilitation Services.

## Questions for an Illinois benefits expert

1. Which unearned income is exempt for AABD cash (private and union pensions,
   VA compensation and pension)?
2. Does every AABD client with earnings get "$20 plus one-half of the next
   $60", and what employment expenses are allowed?
3. How is AABD cash budgeted with an ineligible (responsible-relative)
   spouse in practice?
4. Are the personal allowance, $97 shelter maximum and utility allowances
   current, and since when?
5. How long does IDHS take to approve AABD medical for a new SSI recipient?

## Cross-checks

`crosscheck/results/disability.md`: 13 Illinois runs through PolicyEngine US
(12 Illinois households plus the cross-state household). **Federal SSI agrees
in all 13.** AABD differs in 9, all explained:

- 8 cases: PolicyEngine's AABD grant adjustment stops at 2025 ($788.90); IDHS
  sets $816.90 for January 2026. Needs are $28 lower per person in
  PolicyEngine, which wipes out the small single-person payments and lowers
  the others by $28 per person. Personal allowance, shelter, utilities, the
  $25 exemption and federal SSI otherwise agree.
- DIS-IL-T07: the archive leaves AABD undetermined with an ineligible spouse;
  PolicyEngine reports $0.

# Review notes: long-term care Medicaid, Illinois

For a reviewer who knows Illinois AABD medical for nursing-home residents. Built
2026-10-07 from the IDHS Cash, SNAP and Medical Policy Manual (PM 02-04-00,
07-02-01, 07-02-04, 07-02-04-a, 07-02-20, 07-02-20-d, 07-02-22, 15-04-04,
15-04-04-a/b, 15-06-02-b), WAG 25-03-02 (2) Medical Standards, Manual Release
26.05, and the HFS ABE Partner Portal guide for long-term care providers.

## What is solid

- **Asset limit $17,500** for AABD medical, the same for one person or more, since
  May 12, 2023 (PM 07-02-01; WAG table).
- **2026 spousal standards**: CSRA $143,172 (flat), CSMNA standard $4,066.50
  (MR #26.05; PM 07-02-22; PM 15-04-04-a); 2025 values from the WAG table.
- **Home equity limit $752,000** (the federal minimum) with the occupant exceptions
  and the tax-assessment valuation rule (PM 07-02-04-a; WAG).
- **PNA $60** in a nursing facility, $120 in a supportive living program.
- **Transfers**: 60-month look-back; applies to NH, SLF and DoA HCBS waiver;
  divisor = the facility's monthly private rate; partial months rounded up to two
  decimals and counted in days; no maximum; start = later of otherwise-eligible
  date or the first day of the transfer month (PM 07-02-20, 07-02-20-d).

## Assumptions made

1. **Resources over $17,500 for a nursing-home resident** are added to the first
   month's amount owed (two-step budgeting, PM 15-04-04) and the case is a
   spenddown that is met only if the facility's private rate exceeds what is owed.
   We apply the whole excess in one month (LTC-IL-OQ-05). This is the main way
   Illinois differs from New York and California.
2. **Divisor input**: households give the facility's monthly private rate; without
   it the penalty is "undetermined" (LTC-IL-OQ-03). HCBS cases need a Bureau of Long
   Term Care rate we do not have (LTC-IL-OQ-01).
3. **CSMNA** uses the community spouse's gross income; the resident is assumed to
   make the income available.
4. **Family maintenance allowance** amount not computed (formula not found,
   LTC-IL-OQ-02); cases with dependants return eligible without a patient liability.
5. **Retroactive months, estate recovery** follow the federal rules; Illinois's own
   estate recovery rules were not retrieved (LTC-IL-OQ-06).

## Weakest parts

- **Excess-resource spenddown for nursing-home applicants** (LTC-IL-RESOURCES). The
  manual text supports it, but a caseworker may instead require spending down
  before eligibility. Highest-priority question.
- **The penalty examples in PM 07-02-20-d date from 2012** (and use a $30 PNA); the
  rule text is current, the examples are not (conflict LTC-IL-CONFLICT-01).
- **Paper application form number** not confirmed (LTC-IL-OQ-07).
- **Community spouse non-disclosure** makes the applicant ineligible in Illinois; the
  federal support-assignment route was not found in the Illinois manual.

## Questions for an Illinois benefits expert

1. For a nursing-home applicant with $30,000-$200,000 in savings, does the FCRC
   approve with a spenddown (excess added to the NH credit), or deny until spent?
2. How is the FMNA computed per family member?
3. What rate does BLTC give for HCBS transfer penalties?
4. Is the federal support-assignment exception available when a community spouse
   refuses to cooperate?
5. Which paper application is used for long-term care, and is there a supplement?

## Cross-checks

PolicyEngine US models only the home equity limit, with one national figure (the
federal maximum $1,130,000). Illinois uses the federal minimum ($752,000), so an
Illinois household with equity between those amounts and no spouse or qualifying
child at home is ineligible here and eligible in PolicyEngine; each such difference
is explained in `crosscheck/explanations/ltc_medicaid.yaml`. Transfer penalties,
spousal impoverishment, the PNA and the $17,500 limit are not modelled in PolicyEngine.

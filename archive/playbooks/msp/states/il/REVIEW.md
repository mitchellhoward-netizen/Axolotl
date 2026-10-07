# Review notes: Medicare Savings Program, Illinois

For a reviewer who knows Illinois HFS/IDHS medical programs. Built 2026-10-07
from the IDHS Cash, SNAP and Medical Policy Manual (PM 06-06-03, 06-12 to 06-14,
08-02-03, 15-04 to 15-06, 22-07), WAG 25-03-02(2), Manual Releases 25.15,
25.17, 26.10 and 26.11, HFS brochure 3352 and (secondary) the Department on
Aging's 2026 MSP chart. Rules: `playbook.yaml`; numbers: `parameters/msp_il.yaml`.

## What is solid

- **2026 bands** (WAG 25-03-02(2), effective January 1, 2026 per MR #26.11):
  QMB <= $1,330 / $1,803; SLIB $1,331-1,595 / $1,804-2,163; QI-1 $1,596-1,794 /
  $2,164-2,433 of countable income, rounded down.
- **$25 income exemption**, not $20 (PM 06-12-01-c, PM 15-04-03-a): gross Social
  Security up to $1,355 is QMB. One $25 per applicant with income.
- **Federal resource limit**, $9,950 / $14,910, no spenddown.
- **COLA ignored January-March** (PM 06-12-01-b etc.), one month longer than
  federal law requires.
- **QI-1 and Medicaid** (MR #26.10): barred by approved Medicaid or met
  spenddown, allowed with unmet spenddown.
- **Couples**: always the 2-person standard when living with a spouse
  (PM 15-06-02-c).
- **Timing**: QMB from the month after approval; SLIB/QI-1 up to 3 months back;
  45-day decision; 12-month REDE; estate claim for QMB 55+ only.
- **No Part A buy-in**: the Department "cannot enroll a person in HIB";
  conditional enrollment at SSA is required.

## Assumptions made

1. Earned income follows the AABD rule ($20 + 1/2 of next $60, plus employment
   expenses), as the PM chain says. Where SSI counting would give a better
   result, the evaluator returns undetermined (federal-floor conflict).
2. Resource exemptions are SSI-style (home, one vehicle, burial spaces); PM 07-02
   was not reviewed for MSP (MSP-IL-OQ-08).
3. The WAG bands govern over PM wording at 120%; the $1 above the QI-1 band and
   resources exactly at the limit return undetermined.
4. QDWI income is measured with SSI methodology against $2,660 / $3,606.

## Weakest parts

- **Earned income**: Illinois's AABD disregard appears more restrictive than the
  SSI methodology federal law requires (MSP-IL-OQ-02). High priority.
- **When the Part B deduction stops** after approval (MSP-IL-OQ-07): no Illinois
  source found.
- **AABD Medical recipients "automatically" QMB** when their resources are
  between $9,950 and $17,500 (MSP-IL-OQ-05).
- Most PM pages are dated 1997-2009; only the standards (MR #26.11) and QI-1
  (MR #26.10) were updated in 2026.
- The 2027 retroactivity change was not found in Illinois sources.

## Questions for an Illinois benefits expert

1. For working MSP applicants, do FCRCs use $20 + 1/2 of $60 or SSI's $65 + 1/2?
2. Is countable income of $1,795 QI-1 eligible? Are resources of exactly $9,950?
3. Is an AABD Medical recipient with $12,000 in resources QMB?
4. How long after approval does the Part B deduction stop, and how are
   retroactive months refunded?
5. Which notice (form number) approves a new QMB/SLIB/QI-1 application?
6. Which resources are exempt for MSP (burial allowance)?

## Cross-checks

`crosscheck/results/msp.md`: 26 Illinois rows (20 Illinois households plus the
Illinois column of cross-state households) were run through PolicyEngine US
2.29.14, which uses the $20 SSI exclusion, SSI earned income rules, unrounded
FPL and "at or below" the federal resource limit. Differences come from the $25
exemption (band edges shift by $5), the disputed QI-1 top dollar, resources
exactly at the limit, and the earned-income rule; all are explained in
`crosscheck/explanations/msp.yaml`. Our federal-minimum column agrees with
PolicyEngine on every Illinois row.

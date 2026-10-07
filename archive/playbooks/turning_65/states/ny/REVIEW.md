# Review notes: Turning 65 (Medicare enrollment, penalties, coordination, Medigap), New York

For a reviewer who knows Medicare and New York's Medigap market. Built
2026-10-07. Almost everything in this playbook is federal (`../../federal/`):
enrollment windows, coverage start dates, the Part A/B/D penalties, IRMAA,
who pays first and the federal Medigap rights. The New York part adds only
Medigap continuous open enrollment and community rating, the EPIC check and
HIICAP. Every rule is in `playbook.yaml` with its source and locator; numbers
are in `parameters/t65_ny.yaml` and `../../federal/parameters/`; snapshots are in
`../../snapshots/`.

## What is solid

- **Federal windows and penalties** (federal part): 7-month IEP, first-of-month
  birthday rule, 2023 coverage-start rule, GEP with next-month start, the
  8-month employment SEP (retiree and COBRA coverage do not count), the 2023
  exceptional SEPs, 10% per full 12 months (11 months = 0%), Part D 1% x $38.99,
  Part A $311/$565, 2026 IRMAA tables. All from the CFR (Oct 2025 edition),
  POMS, the U.S. Code and CMS pages.
- **Continuous Medigap open enrollment and community rating**: Insurance Law
  3231(a) — Medicare supplemental coverage "must be accepted at all times
  throughout the year" and must be community rated. NYSOFA's 2025 counselor
  guide says the same.
- **EPIC**: age 65+, NY resident, income below $75,000 single / $100,000
  married (previous year), Part D enrolled or eligible, no full Medicaid (DOH).
- **HIICAP**: 1-800-701-0501.

## Assumptions made

1. A New Yorker with Parts A and B is treated as having a guaranteed Medigap
   purchase on any date (`medigap_guaranteed_issue_now = 1`); the possible
   six-month pre-existing-condition waiting period is reported as a note, not as
   a denial.
2. EPIC income is approximated from the household's monthly income x 12; EPIC
   actually uses the previous year's income including federal AGI. EPIC is a
   link (`ny_epic:may_qualify`), never a decision.
3. The employment SEP start date is reported as the enrollment month (CFR and
   POMS); Medicare.gov says the month after SSA gets the forms
   (T65-FED-CONFLICT-02).
4. Penalty months for someone who had job coverage are counted as the months
   after the IEP not covered by current-employment coverage (T65-FED-OQ-05).

## Weakest parts

- **Waiting period for pre-existing conditions** rests on NYSOFA's guide, not
  the DFS regulation (11 NYCRR Part 58), which was not retrieved
  (T65-NY-OQ-01).
- **Effective year of continuous enrollment (1996)** comes from the NAIC chart
  (secondary).
- **Outcome proof** (Medicare card, SSA premium deduction) has no primary
  description yet (T65-FED-OQ-02).

## Questions for a New York benefits expert

1. Does DFS Regulation 62 (11 NYCRR 58) still allow a six-month pre-existing
   condition waiting period for Medigap bought outside the federal open
   enrollment, and how is creditable coverage credited?
2. Does continuous open enrollment apply to under-65 Medicare beneficiaries in
   New York on the same terms (T65-NY-OQ-02)?
3. Does EPIC count income "below" or "up to" $75,000 / $100,000
   (T65-NY-CONFLICT-01)?
4. In practice, when a New York retiree uses the employment SEP, does SSA start
   Part B in the month of enrollment?

## Cross-checks

`crosscheck/results/turning_65.md`: 10 New York households (Part A premium by
quarters 29/30/39/40, Part B premium with IRMAA at $109,000 / $109,001 /
$137,001 / $205,001 / $500,000 and a joint $218,001 couple, Part D IRMAA) were
run through PolicyEngine US 2.29.14; all 10 agree. PolicyEngine does **not**
model enrollment periods, coverage start dates, late penalties, Medicare
Secondary Payer rules or Medigap rights, so those were not cross-checked.
New numbers that other playbooks may want in `shared/` (Part A premiums,
IRMAA tables, Part D base premium) are noted in the coordinator report.

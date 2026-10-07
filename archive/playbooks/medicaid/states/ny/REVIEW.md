# Review notes: Medicaid, New York

For a reviewer who knows New York Medicaid. Built 2026-10-07 from the DOH 2026
Income and Resource Standards chart (GIS 26 MA/05 attachment), GIS 26 MA/03,
26 MA/05, 26 MA/10 and 26 MA/14, the DOH "How to Apply" page, form DOH-4220,
18 NYCRR 360-2.4, the Medicaid Reference Guide (Income and Resources) and NY
State of Health's H.R.1 page. Rules are in `playbook.yaml`; numbers in
`parameters/medicaid_ny.yaml`; snapshots in `../../snapshots/` (some NY sources
are shared with the MSP playbook and snapshotted there).

## What is solid

- **2026 levels** (effective January 1, 2026): MAGI adults and parents 138% FPL
  ($1,836 / $2,489 / $3,142 for 1/2/3), pregnant 223% ($4,022 for 2);
  SSI-related income $1,836 / $2,489 after the $20 disregard; resources
  $33,038 / $44,796. 2025 values ($1,800 / $2,433; $32,396 / $43,781) from the
  DOH page.
- **Spenddown**: Excess Income program (monthly outpatient, six-month
  inpatient, pay-in) and excess-resource spenddown (MRG).
- **Immigration from October 1, 2026** (GIS 26 MA/14): adults 21-64 without
  federal funding go to the Essential Plan; State-only Medicaid otherwise; MSP
  ends.
- **Timelines** 45 / 90 / 30 days and 3-month retroactive (18 NYCRR 360-2.4);
  2027 changes as described by NY State of Health.

## Assumptions made

1. Countable SSI-related income is compared with $1,836 after the $20, so gross
   unearned income up to $1,856 qualifies (same convention as the MSP part).
2. Over-level SSI-related cases are reported as *eligible* with tier
   `spenddown` and the amount (income and/or resources) to be met.
3. Parents with Medicare stay in the MAGI parent group (DOH page: "Parents and
   Caretaker Relatives of any age, who may have Medicare").
4. 2027 dates use the 2026 tables until the 2027 GIS chart exists (MCD-NY-OQ-03).
5. Resource counting: home, one car, burial spaces and retirement funds in
   payout excluded; second-car and burial-fund details not modelled.
6. Retroactive months from 2027 follow the statute's group test (adult group 1
   month, everyone else 2), not NYSoH's "adults 19-64" shorthand (MCD-NY-CONFLICT-01).

## Weakest parts

- Undocumented children/young adults and pre-October 2026 parolees: undetermined (MCD-NY-OQ-04).
- Pooled trusts for income spenddown: only the asset exemption is sourced (MCD-NY-OQ-06).
- Approval notice name/format (MCD-NY-OQ-02); LDSS-2921 current use (MCD-NY-OQ-01).
- MRG pages are 2008-2011; used for methods only.

## Questions for a New York benefits expert

1. Does New York give 1 or 2 retroactive months in 2027 to a parent aged 19-64 enrolled as a parent/caretaker?
2. Is the Excess Income program still the route for over-resource SSI-related applicants (bills ≥ excess resources), as the 2011 MRG says?
3. Which directive governs pooled trusts for monthly income spenddown today?
4. When will the 2027 SSI-related levels take effect (January 1 again)?
5. How are undocumented applicants under 21 covered (Medicaid vs CHPlus)?

## Cross-checks

`crosscheck/results/medicaid.md`: 16 New York runs (incl. the cross-state case)
through PolicyEngine US. 9 differ, all explained: PolicyEngine's New York
senior/disabled parameters are the pre-2023 82% FPL / $31,175 levels, and it has
no spenddown. MAGI adult and parent cases agree.

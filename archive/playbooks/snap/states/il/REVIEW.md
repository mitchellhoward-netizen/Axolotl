# Review notes: SNAP, Illinois

For a reviewer who knows IDHS SNAP policy. Built 2026-10-07 from the IDHS
Cash, SNAP and Medical Manual (PM/WAG pages) and Manual Releases, all fetched
from dhs.state.il.us. The Illinois Administrative Code (ilga.gov) could not be
fetched (TLS failure); a Cornell LII copy is kept as a secondary source.

## What is solid

- **COLA figures**: MR #25.33 (October 2025) and MR #26.26 (October 2026):
  165% / 200% gross limits, utility standards ($546/$457/$78/$67, then
  $565/$472/$80/$69), standard deductions, asset limits, minimum benefit.
- **Categorical eligibility**: 165% for all households, 200% with a qualifying
  member; no asset or net test for categorically eligible households
  (WAG 13-01-01, 13-01-01-b).
- **LIHEAP change** from September 26, 2025 (MR #25.33, PM 13-01-08-b).
- **Child support paid is an income exclusion** (PM 13-01-07).
- **Certification**: 6-month periods since October 22, 2025, alternating
  interview / EZ REDE; EDSRP 24 months for elderly/disabled households
  without earnings (MR #26.15, MR #25.28). ABAWD from February 2026 (MR #26.03).

## Assumptions made

1. Households choose the larger of the $185 SMD and actual costs over $35.
2. Shelter and medical cents are kept (IDHS drops cents from totals; at most
   $1 of difference).

## Weakest parts

- **Standard deduction $4 below FNS** (SNAP-IL-CONFLICT-01): IDHS's figures
  are used; the reason is unknown (possibly an SMD cost-neutrality offset).
- **SMD amount**: $185 (IDHS manual and chart) vs $150 (Administrative Code
  copy, secondary) — SNAP-IL-CONFLICT-02; the manual's own example uses a
  $450 group-home figure against the stated $485.
- Form titles for IL444-2378B / IL444-0683 not captured.

## Questions for an Illinois benefits expert

1. Why is the Illinois standard deduction $4 below the FNS table?
2. Is the community SMD $185 or $150 (and group home $485 or $450)?
3. Does IES drop cents before or after summing medical and shelter costs?

## Cross-checks

22 Illinois rows (including the NY cross-state household evaluated in IL)
run through PolicyEngine US 2.29.14; 13 agree. Differences: at-limit rounding
of 165%/200% limits, the $4 standard deduction gap, missing FY 2027 IL
utility values in PolicyEngine, and LIHEAP-conferred AC/Heating (not modelled
by PolicyEngine). All explained.

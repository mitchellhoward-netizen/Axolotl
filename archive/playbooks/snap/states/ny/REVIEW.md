# Review notes: SNAP, New York

For a reviewer who knows New York SNAP (OTDA / HRA). Built 2026-10-07. Every
rule is in `playbook.yaml` with source and locator, numbers in
`parameters/snap_ny.yaml`, snapshots in `../../snapshots/`. **otda.ny.gov could
not be reached at all** (bot challenge, resets, HTTP 503 for scripts, research
tools and a headless browser), so the New York part rests on one OTDA GIS
(25 DC059, taken from a verbatim copy posted by Warren County DSS), HRA's NYC
pages, FNS's BBCE chart and SUA table, and Hunger Solutions New York.

## What is solid

- **FFY 2026 standards (October 2025 - September 2026)** from GIS 25 DC059:
  federal deductions and limits, HT/AC SUA $1,062 NYC / $988 Nassau-Suffolk /
  $877 rest of state, UTIL SUA $419 / $388 / $355, Phone $32.
- **BBCE**: 200% FPL (no resource test, minimum benefit guaranteed) for
  households with an aged/disabled member or dependent care costs; 150% FPL
  for other households with earnings; no BBCE route for other households.
- **NYC procedure**: LDSS-4826, ACCESS HRA, interview by phone (On Demand),
  all-SSI households can apply at SSA, ABAWD rules from November 1, 2025 with
  compliance from March 1, 2026.

## Assumptions made

1. The Utility SUA needs at least two non-heating utilities (federal LUA rule);
   a single non-heating utility gets nothing unless there is a phone (Phone SUA).
2. HEAP-only households without an aged/disabled member lose the HT/AC SUA
   from November 1, 2025 (date from a search snippet; SNAP-NY-OQ-03).
3. No New York standard medical deduction: actual costs over $35 (SNAP-NY-OQ-04).
4. Child support paid is excluded from gross income (federal default; NY's
   choice not found).
5. Regular rules are tried first and BBCE only when they fail, so FY 2027
   cases that need New York's own FY 2027 numbers come back undetermined.

## Weakest parts

- **No FFY 2027 New York figures** (SUAs, 200%/150% limits): every FY 2027
  case with a utility bill, or that fails the regular tests, is undetermined
  (SNAP-NY-OQ-01, -02). Highest priority.
- **02 ADM-07** (medical deduction frozen until recertification after MSP
  approval) could not be confirmed or refuted; only the federal frame
  (7 CFR 273.12(c)) is recorded. The MSP playbook's MSP-NY-SNAP-EFFECT should
  also correct "roughly 30 cents per dollar": with an excess shelter
  deduction the loss is about 45 cents per dollar (SNAP-X-01: $220 -> $145).
- NYSCAP and ESAP rest on Hunger Solutions New York only (secondary).
- Upstate filing channels (myBenefits, county DSS) are not documented.
- Conflict SNAP-NY-CONFLICT-01: FNS's SUA table lists different UTIL SUAs.

## Questions for a New York benefits expert

1. What are the FFY 2027 (October 2026) HT/AC, UTIL and Phone SUAs and the
   200%/150% BBCE limits?
2. Is 02 ADM-07 still in force, and does it hold the medical deduction until
   recertification when QMB/QI starts paying Part B?
3. Does New York have any standard medical deduction?
4. Has New York applied FNA's 2026 change removing non-disabled 60-64-year-olds
   from ESAP?
5. Child support paid: exclusion or deduction in New York?
6. Is FNS's New York LUA column wrong, or OTDA's GIS?

## Cross-checks

`crosscheck/results/snap.md`: 23 New York-budgeted rows (22 NY households
plus the cross-state household in CA/IL) run through PolicyEngine US 2.29.14.
New York differences: four from PolicyEngine giving every NY household the
full HT/AC SUA, one from PolicyEngine dropping the asset test for all NY
households, one from at-limit rounding of the 150% limit. All explained in
`crosscheck/explanations/snap.yaml`.

# Review notes: SNAP, New York

For a reviewer who knows New York SNAP (OTDA / HRA). Built 2026-10-07. Every
rule is in `playbook.yaml` with source and locator, numbers in
`parameters/snap_ny.yaml`, snapshots in `../../snapshots/`. **otda.ny.gov could
not be reached at all** (bot challenge, resets, HTTP 503 for scripts, research
tools and a headless browser), so the New York part rests on one OTDA GIS
(25 DC059, taken from a verbatim copy posted by Warren County DSS), HRA's NYC
pages, FNS's BBCE chart and SUA table, and Hunger Solutions New York.

**Second pass (same day).** otda.ny.gov still answered only with an F5
JavaScript challenge (Playwright headful under Xvfb, desktop user agent,
network-idle waits) or HTTP 503 (WebFetch); web.archive.org was unreachable and
archive.org has no capture of 02 ADM-07. New material: Erie County DSS's
official page with the FY 2027 BBCE limits; HRA's community-updates page naming
the FFY 2027 standards GIS (26 DC045, still unread); NYC DSS's October 2025
notice on the HEAP/HT-AC change; Hunger Solutions New York's 2026-27 reference
sheet and CSS Benefits Plus's calculator (FY 2027 SUAs); and OTDA's SNAP
regulations (18 NYCRR 387.12, 387.17, 387.24 NYSCAP, 387.26 ESAP) in Cornell
LII's third-party copy (secondary).

## What is solid

- **FFY 2026 standards (October 2025 - September 2026)** from GIS 25 DC059:
  federal deductions and limits, HT/AC SUA $1,062 NYC / $988 Nassau-Suffolk /
  $877 rest of state, UTIL SUA $419 / $388 / $355, Phone $32.
- **BBCE**: 200% FPL (no resource test, minimum benefit guaranteed) for
  households with an aged/disabled member or dependent care costs; 150% FPL
  for other households with earnings; no BBCE route for other households.
- **FFY 2027 BBCE limits** (from October 1, 2026; Erie County DSS, matching
  two advocacy tables): 200% FPL $2,660 / $3,607 / $5,500 (1 / 2 / 4 people,
  +$947); 150% FPL $1,995 / $2,705 / $4,125 (+$710). The first pass's
  undetermined FY 2027 cases now have real expectations (T17, T18) and new
  threshold pairs (T24/T25 at 200%, T26/T27 at 150%).
- **HEAP change start**: November 1, 2025 for new and pending applications;
  certified households move at recertification or a reported change (NYC DSS
  notice).
- **NYC procedure**: LDSS-4826, ACCESS HRA, interview by phone (On Demand),
  all-SSI households can apply at SSA, ABAWD rules from November 1, 2025 with
  compliance from March 1, 2026.

## Assumptions made

1. **Changed in the second pass:** any separate non-heating utility cost
   (other than phone alone) gives the Utility SUA; phone only gives the Phone
   SUA. The first pass required two utilities, reading the federal LUA rule
   (7 CFR 273.9(d)(6)(iii)(A)(3)); NYC DSS's notice and Hunger Solutions
   describe one utility as enough (SNAP-NY-CONFLICT-05, test T29).
2. HEAP-only households without an aged/disabled member lose the HT/AC SUA
   from November 1, 2025; the evaluator treats every case as a new
   application, so the protection for households certified before then is
   not modelled. Hunger Solutions dates it July 4, 2025 (SNAP-NY-CONFLICT-03).
3. No New York standard medical deduction: actual costs over $35 (18 NYCRR
   387.12(c), LII copy; SNAP-NY-OQ-04).
4. Child support paid is subtracted before the gross test (exclusion). The
   regulation calls it a deduction "prior to determining the excess shelter
   expense deduction"; Hunger Solutions says it is always taken before the
   gross income test (SNAP-NY-OQ-09).
5. The FY 2027 SUAs ($1,100 / $1,023 / $908 HT/AC, $434 / $402 / $368 UTIL,
   $33 phone) are used although they rest on two secondary sources.

## Weakest parts

- **FY 2027 SUAs are secondary** (SNAP-NY-SUA-FY27, SNAP-NY-OQ-02): OTDA GIS
  26 DC045 is the document to read. They match the FY 2026 amounts raised
  about 3.5%, the FNS simplified-adjustment option.
- **02 ADM-07** is still unread. New York's regulation (18 NYCRR 387.17, LII
  copy) supports part of NYSOFA's description (no duty to report a medical
  drop before recertification; other-source changes needing household contact
  wait) and contradicts the rest (reported changes are acted on; for
  six-month reporters a Medicaid-verified change is acted on). Recorded as
  SNAP-NY-MEDICAL-CHANGE-REPORTING (secondary), SNAP-NY-MSP-MEDICAL-FREEZE
  (unresolved) and SNAP-NY-CONFLICT-04. The MSP playbook's
  MSP-NY-SNAP-EFFECT should also correct "roughly 30 cents per dollar": with
  an excess shelter deduction the loss is about 45 cents per dollar
  (SNAP-X-01: $220 -> $145).
- NYSCAP and ESAP now rest on the regulations (LII copy) plus Hunger Solutions
  New York; still secondary because no official host could be read.
- Upstate filing channels (myBenefits, county DSS) are not documented.
- Conflict SNAP-NY-CONFLICT-01: FNS's SUA table lists different UTIL SUAs.

## Questions for a New York benefits expert

1. Does GIS 26 DC045 give HT/AC $1,100 / $1,023 / $908, UTIL $434 / $402 /
   $368 and Phone $33 for FFY 2027?
2. What exactly does 02 ADM-07 say about medical-expense changes, and does
   New York hold the deduction until recertification even when the household
   reports the drop or the Medicaid unit verifies the MSP approval?
3. Does one non-heating utility (e.g. electricity only) qualify for the
   Utility SUA?
4. Did the HEAP/HT-AC change start November 1, 2025 or July 4, 2025?
5. Has New York applied FNA's 2026 change removing non-disabled 60-64-year-olds
   from ESAP?
6. Child support paid: subtracted before the gross test, or only after?
7. Is FNS's New York LUA column wrong, or OTDA's GIS?

## Cross-checks

`crosscheck/results/snap.md`: 30 New York rows run through PolicyEngine US
2.29.14 (second pass added T17, T18, T24-T28). New York differences: five
from PolicyEngine giving every NY household the full HT/AC SUA (T01, T16,
T18, T19, T22), two from PolicyEngine's single statewide FY 2026 HT/AC value
($877) where the archive uses the FY 2027 regional amounts (T17 upstate $908,
T28 NYC $1,100), one from PolicyEngine dropping the asset test for all NY
households (T14), one from at-limit rounding of the FY 2026 150% limit (T07).
The FY 2027 threshold pairs (T24-T27) agree. All explained in
`crosscheck/explanations/snap.yaml`.

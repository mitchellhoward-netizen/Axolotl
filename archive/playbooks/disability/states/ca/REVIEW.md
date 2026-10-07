# Review notes: Disability and SSI, California

For a reviewer who knows SSI/SSP in California. Built 2026-10-07 from SSA POMS
(SI 01415.057 and .058 payment levels, San Francisco regional SI SF01415
sections, SI 01320.430, SI 02005.001, SI 01715.010), CDSS pages (SSI/SSP,
eligibility summary, CalFresh expansion, CAPI, 2026 May Revision grant table,
PUB 417). Rules are in `playbook.yaml` (state) and
`../../federal/playbook.yaml`; numbers in `parameters/ssp_ca.yaml`.

## What is solid

- **SSA administers California's SSP** under agreement; SSI eligibility
  implies SSP eligibility (SI SF01415.100; CDSS).
- **2026 levels** from POMS SI 01415.058: aged/disabled individual, own
  household with cooking, $1,233.94 total (SSP $239.94); blind $1,318.32; no
  cooking facilities $1,362.81; out-of-home care $1,626.07; household of another
  $907.87; couples $2,098.83 (aged/aged), $2,238.44 (aged/blind) etc. CDSS's
  2026 May Revision table shows the same $1,234 / $2,099. 2025 levels recorded
  too (state amounts unchanged; only the FBR rose).
- **SSP computation**: income above the FBR reduces the SSP dollar for dollar;
  no SSP when the excess equals the level (SI 02005.001 D.2). Tests pin the
  federal breakeven ($1,014), $1 over, and the SSP zero point ($1,253.94).
- **Medi-Cal** follows SSI/SSP automatically (CDSS FAQ; 1634 state in POMS).
- **CalFresh**: SSI/SSP recipients eligible since June 1, 2019 (AB 1811).
- **CAPI**: state-funded, same amount as SSI/SSP, county application (SOC 814),
  no automatic Medi-Cal or CalFresh.

## Assumptions made

1. **Default living arrangement is code A** (independent with cooking). Codes
   C (no cooking), D (household of another, from the federal VTR) and J
   (Medicaid facility) are set from household facts; B and F (out-of-home
   care) only when given explicitly.
2. **Deeming with an ineligible spouse** follows SI 01320.430, using the
   applicant's own category for the couple level (aged/aged for an aged
   applicant). The POMS does not say which couple level applies when the
   spouse has no category (DIS-CA-OQ-02).
3. **One combined SSI/SSP payment** is inferred from SSA administering and
   paying the SSP; no text saying "one check" was retrieved.
4. Retrospective budgeting is not modelled.

## Weakest parts

- **DHCS could not be reached** (Incapsula bot wall for both scripts and a
  headless browser): the Medi-Cal link rests on CDSS's undated FAQ (which is
  stale elsewhere — it still says SGA is $500) and on SSA's state list. DHCS's
  2025 automatic QMB enrollment for SSI recipients was not confirmed
  (DIS-CA-OQ-03).
- **Mid-year or 2027 state changes** to SSP levels were not checked beyond the
  May Revision (DIS-CA-OQ-01).
- **CAPI** amounts and sponsor deeming are not encoded (DIS-CA-OQ-04).
- Mandatory minimum income levels (people converted in 1974) are not modelled.

## Questions for a California benefits expert

1. In a deeming case (SI 01320.430), which couple level does SSA use when the
   spouse is not aged, blind or disabled?
2. Are any SSP level changes scheduled for January 2027?
3. Is QMB now automatic for every SSI/SSP recipient with Medicare (DHCS 2025)?
4. Do counties still see SSI/SSP recipients told they cannot get CalFresh?

## Cross-checks

`crosscheck/results/disability.md`: 16 California runs through PolicyEngine US
(15 California households plus the cross-state household). **Federal SSI
agrees in all 16.** The SSP differs in 14, all explained in
`crosscheck/explanations/disability.yaml`:

- 12 cases: PolicyEngine's California payment standards stop at 2025-01-01
  (totals $1,206.94 / $2,057.83), so it does not pass the January 2026 FBR
  increase through and understates the SSP by $27 (individual) or $41 (couple).
- DIS-CA-T08: PolicyEngine does not apply SI 01320.430 to an ineligible-spouse
  case (it reports $0 SSP; the archive $239.94).
- DIS-CA-T11: PolicyEngine does not model code D (household of another); it
  keeps the own-household standard.

The cross-check also showed that PolicyEngine's default for California is "no
food preparation" (code C); the adapter sets cooking facilities explicitly.

# Review notes: Disability and SSI, New York

For a reviewer who knows SSI and New York's State Supplement Program. Built
2026-10-07 from SSA POMS (SI and DI chapters), 20 CFR, the U.S. Code, New York
Social Services Law § 209, NY DOH's GIS 26 MA/03 and Medicaid Reference Guide,
a 2006-07 Executive Budget page, and a NY Senate post quoting an OTDA notice.
Rules are in `playbook.yaml` (state) and `../../federal/playbook.yaml`;
numbers in `parameters/ssp_ny.yaml` and the federal parameters; snapshots in
`../../snapshots/`.

## What is solid

- **Federal SSI** (same in every state): 2026 FBR $994 / $1,491, resource limit
  $2,000 / $3,000, $20 and $65-plus-half exclusions, VTR $331.33 / $497.00, PMV
  $351.33 / $517.00, food out of ISM since 9/30/2024, spouse deeming ($497
  threshold), parent deeming, SGA $1,690 / $2,830, TWP $1,210. Federal SSI
  matches PolicyEngine in all 18 New York households compared.
- **New York standards of need for 2026** (SSL 209(2)): $1,081 / $1,595 living
  alone, $1,017 / $1,537 living with others, plus family care, residential care
  and enhanced residential care. The SSP is standard minus (SSI + countable
  income) (SSL 209(4)): $87 / $104 living alone and $23 / $46 with others when
  there is no other income. DOH's GIS 26 MA/03 confirms $87 / $104.
- **SSP-only payments**: SSL 209(1)(a) makes a person ineligible for SSI only
  by income still eligible for the SSP while countable income is below the
  standard. Tests pin $1,014 (SSI $0, SSP $87), $1,015 (SSP $86), $1,100 (SSP
  $1) and $1,101 (nothing).
- **Medicaid link**: New York is a 1634 state; SSI recipients get Medicaid
  without applying (DOH Medicaid Reference Guide; POMS SI 01715.010).

## Assumptions made

1. **The VTR counts as income in the SSP formula.** For a person in someone
   else's household, SSP = $1,017 - ($662.67 SSI + $331.33 VTR) = $23. SSA calls
   the VTR an income value; no New York text was found applying SSL 209(4) to
   VTR cases. A secondary 2026 chart gives the same $685.67 total.
2. **Living alone vs with others** is taken from household membership (only
   the applicant and spouse = alone) unless a fact says otherwise.
3. **2026 amounts start January 1, 2026**, although nysenate.gov marks the
   2026 paragraphs "NB Effective December 31, 2026" (DIS-NY-CONFLICT-02).
4. **The state took over the SSP on October 1, 2014** (not 2012), based on a
   Senate post quoting OTDA and on OTDA's SSP regulation, 18 NYCRR Part 398,
   which took effect that day (both secondary: the regulation was read in
   Cornell LII's copy; DIS-NY-CONFLICT-01).
5. **Retrospective budgeting is not modelled**: the stated monthly income is
   treated as the budget month's income.

## Weakest parts

- **otda.ny.gov could not be reached** in either pass (first: empty replies;
  second: an F5 JavaScript challenge to headful Playwright under Xvfb and HTTP
  503 to WebFetch; the Internet Archive was unreachable). The second pass
  found OTDA's SSP regulation (18 NYCRR 398-1.1, 398-2.1, 398-4.1) in LII's
  third-party copy: OTDA administers the SSP, there is **no SSP application**,
  OTDA acts on SSA's data-exchange (SDX) status codes (including N01, income
  over the federal rate, which covers SSP-only cases), and eligibility starts
  the first full month after all criteria are met, after a "mandatory 90-day
  waiting period" the regulation does not define. DIS-NY-SSP-PAYMENT and
  DIS-NY-PROC-SSP-ONLY are secondary on that basis; the payment day, method
  and contact line still rest on the 2014 Senate post (DIS-NY-OQ-04).
- **SSP for an SSI recipient with an ineligible spouse** is left undetermined
  (DIS-NY-OQ-01); only the federal amount is computed.
- **Congregate care**: amounts are in statute, but who pays (OTDA or SSA) and
  how facilities are certified is open (DIS-NY-OQ-02).
- **Medicaid for SSP-only recipients** is not established (DIS-NY-OQ-03).
- The **DDD name** rests on a 2006 budget document (DIS-NY-OQ-05).

## Questions for a New York benefits expert

1. How does OTDA budget the SSP when an SSI recipient lives with an ineligible
   spouse, and is that "living alone" or "living with others"?
2. Does OTDA count the VTR as income under SSL 209(4) (giving $23 for a person
   in another's household)?
3. After the 2014 takeover, which recipients (family care, residential care,
   enhanced residential care) still get the SSP from SSA?
4. Does a person with SSP only (no federal SSI) get Medicaid automatically?
5. 18 NYCRR 398-4.1 says no SSP application is accepted and OTDA acts on
   SSA's SDX data: how long does an SSP-only case (status N01) take after SSA's
   decision, and what is the "mandatory 90-day waiting period"?
6. Is the OTDA SSP Customer Support Center number (1-855-488-0541) current?

## Cross-checks

`crosscheck/results/disability.md`: PolicyEngine US has no New York SSP
variable, so the 18 New York household runs compare **federal SSI only**; all
agree. The New York SSP itself is not cross-checked by PolicyEngine. The
cross-state household DIS-NY-T22 was also run in California and Illinois
(differences explained in `crosscheck/explanations/disability.yaml`).

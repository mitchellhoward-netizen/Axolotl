# Review notes: long-term care Medi-Cal, California

For a reviewer who knows California long-term care Medi-Cal. Built 2026-10-07 from
DHCS All County Welfare Directors Letters 25-14 (asset limit reinstatement), 25-18
(transfers and periods of ineligibility), 26-02 (2026 spousal impoverishment caps)
and 26-03 (2026 APPR), an older DHCS long-term care Q&A, and the Justice in Aging
FAQ (secondary). dhcs.ca.gov blocks scripted clients; the PDFs were downloaded with
a headless browser and imported. leginfo.legislature.ca.gov (statutes) could not be
reached at all, so nothing here rests on Welfare and Institutions Code text directly.

## What is solid

- **Property limit reinstated January 1, 2026**: $130,000 for one person, $195,000
  for two, $65,000 per extra person; no property test January 2024 - December 2025
  (ACWDL 25-14, 26-02).
- **Spousal caps 2026**: CSRA $162,660, MMMNA $4,067, community spouse's health
  premiums deducted from their income (ACWDL 26-02).
- **Transfers** (ACWDL 25-18): 30-month look-back starting the month before the
  application; transfers January 2024 - December 2025 never reviewed; disqualifying
  only if over the limit at the time and above the APPR; whole-month POI from the
  month of transfer, at most 30 months; DHCS must approve every POI; no POI for
  community-based programs.
- **2026 APPR $14,440** (ACWDL 26-03).

## Assumptions made

1. **CSRA is the full $162,660 for every community spouse** (no spousal-share
   computation). ACWDL 26-02 gives one figure and describes a combined limit of
   $130,000 plus the CSRA; we read that as California giving the maximum.
2. **POI = floor(amount / APPR)**, using the full amount transferred (not reduced
   by any room under the limit) (LTC-CA-OQ-06).
3. **Each transfer gets its own POI** from its own month; overlapping POIs are not
   combined.
4. **PNA $35** from an old DHCS Q&A (LTC-CA-OQ-03).
5. **Share of cost** = income - $35 - spousal allocation - health premiums; if it
   covers the monthly cost, we call the case "income_covers_cost".
6. **Home equity**: we return "undetermined" when equity exceeds the federal minimum
   ($752,000) and nobody qualifying lives in the home (LTC-CA-OQ-01).

## Weakest parts

- **Home equity limit in California** before 2028 (conflict LTC-CA-CONFLICT-01).
  Federal law says "notwithstanding any other provision"; an advocacy FAQ says
  California does not apply it yet. This decides cases for many California homeowners.
- **California's transfer rules differ from the Deficit Reduction Act** (30 vs 60
  months, whole months, start in the month of transfer, 30-month cap; conflict
  LTC-CA-CONFLICT-02). We apply California's rules because the county will.
- **PNA $35** rests on an undated, old DHCS document.
- **Family allowance** amount not found (LTC-CA-OQ-05).
- **Application forms** for LTC Medi-Cal not confirmed (LTC-CA-OQ-07).

## Questions for a California benefits expert

1. Does California apply a home equity limit to long-term care Medi-Cal in 2026-2027?
2. Is the CSRA always $162,660, or can it be lower for couples with fewer resources?
3. Is the transfer amount divided by the APPR reduced by the amount the person was
   under the $130,000 limit?
4. Is the PNA still $35?
5. How is the family allowance computed?
6. Which application and property-supplement forms do counties use for LTC in 2026?

## Cross-checks

PolicyEngine US models only the home equity limit (one national figure, the federal
maximum $1,130,000). California's home equity treatment is unresolved in this archive,
so for California households with equity above $752,000 we return "undetermined" where
PolicyEngine applies $1,130,000; every such difference is explained in
`crosscheck/explanations/ltc_medicaid.yaml`. PolicyEngine does not model the property
limit, POIs, spousal impoverishment or the share of cost.

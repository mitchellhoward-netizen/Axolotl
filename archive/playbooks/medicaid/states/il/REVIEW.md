# Review notes: Medicaid, Illinois

Built 2026-10-07 from the IDHS Cash, SNAP and Medical Policy Manual (PM 02, 07,
15, 17, 19 and WAG 25-03-02 (2)), the HFS Medical Programs page and SSA POMS SI
01715.010. The IDHS pages carry no revision dates.

## What is solid

- **AABD Medical asset limit $17,500** for any household size since May 12,
  2023 (PM 07-02-01); over it, community cases go into spenddown, assets need
  not be reduced (PM 15-04-01).
- **AABD income** 100% FPL ($1,330 / $1,803) after a $25 disregard; SSI
  protected; 2-person standard whenever living with a spouse.
- **MAGI**: ACA Adults and FamilyCare 138% incl. 5% disregard ($1,835 / $2,488 /
  $3,141), Moms & Babies 213%.
- **Illinois is a 209(b) state** (POMS): SSI does not bring Medicaid automatically.
- Timelines 45 / 60 days; backdating 3 months; 12-month certification; ex parte
  renewal timeline and forms (2381C, 643M/643N); ABE, call center, FCRC, IL444-2378B.

## Assumptions made

1. **Effective dates**: the WAG table gives no start date for the 2026
   figures, so they are recorded from the snapshot date (2026-10-07); January-
   October 2026 Illinois cases return undetermined (MCD-IL-OQ-01).
2. Spenddown amount reported as excess income per month plus excess assets
   (PM 15-05-03 adds excess assets to countable income).
3. Only one $25 disregard unless the spouse is also applying (fact `applying`).
4. Cases with earned income return undetermined (MCD-IL-OQ-03); retirement
   accounts not in payout need the withdrawal penalty as a fact (MCD-IL-OQ-05).
5. For applications from January 1, 2027 the federal 1/2-month retroactive
   limit is applied although the PM still says 3 months (MCD-IL-CONFLICT-02).

## Weakest parts

- The HFS overview page is stale ($2,000 AABD resources; $1,366 ACA Adults) — MCD-IL-CONFLICT-01.
- No Illinois source found for 2027 implementation (work requirement, 6-month renewals) or for post-October 2026 noncitizen coverage (MCD-IL-OQ-02, OQ-04).
- Parents with Medicare: whether FamilyCare applies was not established.

## Questions for an Illinois benefits expert

1. From what date did IDHS apply the 2026 FPL standards?
2. Which AABD earned income exemptions apply (PM 08-02-02/03)?
3. How will IDHS implement the 2027 retroactive, renewal and work-requirement changes?
4. What happens to refugees/asylees/parolees on state-funded medical after October 1, 2026; is Coverage for Immigrant Seniors open?

## Cross-checks

15 Illinois runs through PolicyEngine US; 9 differ, all explained: PolicyEngine
rounds the 138% limit up ($1,836 vs IDHS $1,835), uses a strict asset test at
$17,500, and has no Illinois spenddown (medically needy flag false).

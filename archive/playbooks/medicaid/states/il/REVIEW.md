# Review notes: Medicaid, Illinois

Built 2026-10-07 from the IDHS Cash, SNAP and Medical Policy Manual (PM 02, 07,
08, 15, 17, 19 and WAG 25-03-02 (2)), IDHS/HFS Manual Releases MR #26.11 and
#25.15, 89 Ill. Adm. Code 120 (sections 120.20, 120.335, 120.362, 120.370), the
HFS Medical Programs page and SSA POMS SI 01715.010. The IDHS manual pages carry
no revision dates; the Manual Releases and the Administrative Code do.

## What is solid

- **AABD Medical asset limit $17,500** for any household size since May 12,
  2023 (PM 07-02-01); over it, community cases go into spenddown, assets need
  not be reduced (PM 15-04-01).
- **AABD income** 100% FPL ($1,330 / $1,803) after a $25 disregard; SSI
  protected; 2-person standard whenever living with a spouse.
- **MAGI**: ACA Adults and FamilyCare 138% incl. 5% disregard ($1,835 / $2,488 /
  $3,141), Moms & Babies 213%.
- **2026 start date (second pass)**: MR #26.11 (05/20/2026) says the 2026 FPL
  standards are effective 01/01/26 for every program except presumptive
  eligibility (03/01/2026). IES switched active cases in an April 2026 mass
  change; pending applications use the new standards for any budget month from
  January 2026. The archive now applies them from 2026-01-01, so January-October
  2026 Illinois cases are decided (MCD-IL-OQ-01 answered).
- **AABD earned income (second pass)**: after the $25 disregard, aged/disabled
  $20 + 1/2 of the next $60, blind $85 + 1/2 of the rest (89 Ill. Adm. Code
  120.362(b), PM 08-02-03-a), then employment expenses (120.370, PM 08-02-03-b).
- **Illinois is a 209(b) state** (POMS): SSI does not bring Medicaid automatically.
- Timelines 45 / 60 days; backdating 3 months; 12-month certification; ex parte
  renewal timeline and forms (2381C, 643M/643N); ABE, call center, FCRC, IL444-2378B.

## Assumptions made

1. **Effective dates**: the 2026 figures apply from 2026-01-01 for eligibility
   (MR #26.11). An active case's notice may show the 2025 standard until the
   April 2026 mass change; the archive does not model that lag. The 2025
   figures are not in the archive (the WAG page was overwritten), so 2025 cases
   have no income standard. Several procedural rules still carry the
   2026-10-07 snapshot date because their manual pages are undated.
2. Spenddown amount reported as excess income per month plus excess assets
   (PM 15-05-03 adds excess assets to countable income).
3. Only one $25 disregard unless the spouse is also applying (fact `applying`).
4. Employment expenses are an input (`aabd_work_expenses_monthly`); without it
   a worker whose income is over the standard before expenses is undetermined.
   The order of the $25 against unearned vs earned income is computed both ways
   and only decides the case when earnings are under about $105 (MCD-IL-OQ-03,
   narrowed). A non-applying spouse's earnings still return undetermined.
   Retirement accounts not in payout need the withdrawal penalty as a fact
   (MCD-IL-OQ-05).
5. The $4,500 vehicle value is looked up only when a non-needed vehicle is
   present (its value is dated from the snapshot because PM 07-02-05 is
   undated), so other AABD cases are no longer blocked before October 2026.
6. For applications from January 1, 2027 the federal 1/2-month retroactive
   limit is applied although the PM still says 3 months (MCD-IL-CONFLICT-02).

## Weakest parts

- The HFS overview page is stale ($2,000 AABD resources; $1,366 ACA Adults) — MCD-IL-CONFLICT-01.
- No Illinois source found for 2027 implementation (work requirement, 6-month renewals) or for post-October 2026 noncitizen coverage (MCD-IL-OQ-02, OQ-04).
- Parents with Medicare: whether FamilyCare applies was not established.

## Questions for an Illinois benefits expert

1. For AABD Medical with both earnings and other income, does the $25 come off
   unearned income first? How are a non-applying spouse's wages treated?
2. What were the 2025 medical standards (WAG 25-03-02(2) before MR #26.11)?
3. How will IDHS implement the 2027 retroactive, renewal and work-requirement changes?
4. What happens to refugees/asylees/parolees on state-funded medical after October 1, 2026; is Coverage for Immigrant Seniors open?

## Cross-checks

15 Illinois runs through PolicyEngine US; 9 differ, all explained: PolicyEngine
rounds the 138% limit up ($1,836 vs IDHS $1,835), uses a strict asset test at
$17,500, and has no Illinois spenddown (medically needy flag false).

# New York fund targets for the Part B / MSP wedge

Researched 2026-10-07. Built from DOL Form 5500 filings ([build_list.py](build_list.py):
[pension_plans.csv](pension_plans.csv), [health_plans.csv](health_plans.csv)) and four sourced
fund notes ([funds_1199.md](funds_1199.md), [funds_service.md](funds_service.md),
[funds_industrial.md](funds_industrial.md), [funds_trades.md](funds_trades.md)). The ranking,
[targets.csv](targets.csv), comes from [rank.py](rank.py), using the website calculator's research
numbers.

## The answer

1. **1199SEIU's National Benefit Fund is the first target.** It is the only large New York union
   fund confirmed to pay toward retirees' Part B premiums: 50% of the standard premium for Wage
   Class I/II retirees, generally those with 10+ years, and their spouses. We checked this on the
   live retiree page, the summary plan description (SPD) and the 2024 claim form. Each enrollee
   saves the fund about **$1,217 a year**.
2. **Paying toward Part B is rare among these union funds.** Besides 1199 NBF, only these were
   confirmed:
   - IUOE Local 94 School Division (Medicare premiums up to $7,000 a year per couple);
   - IATSE National H&W ($240 a quarter toward Part B);
   - MILA (one pensioner subgroup);
   - a closed, Part B-sized pension supplement for pre-1987 Local 15 members in NRF / UNITE HERE.

   Most funds end retiree health at 65 (32BJ, Teamsters, UFCW Local One), have none (1199 Home
   Care, Local 813), or make retirees pay Part B themselves (Hotel Trades Council, Carpenters,
   Local 3).
3. **The biggest Part B payer in New York is not a union fund. It is the City of New York.** The
   City reimburses Part B for City pensioners under Admin Code §12-126 (funds_trades.md, DC 37).
   That is a public-employer sale, slower but very large.
4. **The poorest retirees are mostly in funds that pay nothing toward Part B,** so for them MSP is a
   member benefit, not a fund saving. Across the funds below, about **$190 million a year** of Part
   B premiums likely goes unclaimed by retirees (screening estimate).

## Ranked (screening estimates; retirees = pension recipients, all states)

| Fund | Retirees | Avg benefit/mo | Likely eligible, not enrolled | Unclaimed by retirees/yr | Fund saving if all enrolled |
|---|---|---|---|---|---|
| **1199SEIU National Benefit Fund** | 82,266* | $1,027 | ~6,100 | ~$14.8M | **~$7.4M*** |
| IATSE National H&W | 2,938 | $670 | ~480 | ~$1.2M | ~$0.46M |
| National Retirement Fund (Workers United) | 86,306 | $147 | ~28,100 | ~$68.5M | none |
| 1199SEIU Home Care | 32,333 | $75 | ~10,500 | ~$25.7M | none |
| UNITE HERE Retirement Fund | 27,230 | $355 | ~8,900 | ~$21.6M | none |
| 32BJ | 35,057 | $584 | ~5,700 | ~$13.9M | none |
| Amalgamated Insurance Fund | 15,226 | $78 | ~5,000 | ~$12.1M | none |
| Hotel Trades Council | 18,708 | $786 | ~3,100 | ~$7.4M | none (possible coinsurance saving, unconfirmed) |
| UFCW Local One, IUE-CWA, 32BJ North, ATU 1181, Local 389, JIB ESF, UFCW 1500, Laundry, 32BJ School, Local 1102 | 1,500–7,600 each | $75–$856 | 500–2,500 each | $1.2–6.0M each | none |

\* All 1199 Health Care pension retirees. Only the Wage Class I/II retirees who file the claim get
the 50%; spouses add to it. The real base is the Fund's own count of Part B claimants. We don't
have it yet; it's the first thing to ask for.

How to read the estimates:
- **The average pension picks the eligibility band, so mixed funds read low.** 1199 mixes nurses
  with aides and housekeepers, and a split membership has more people under the line than its
  average suggests.
- **National funds overstate New York.** NRF, UNITE HERE, Amalgamated and IATSE retirees don't all
  live in New York.
- **These are pools, not results.** At the website's middle outreach assumption (15% enroll), the
  1199 NBF figure means about 900 enrollees and about $1.1M a year saved by the fund. Its ceiling
  is about $7.4M.

## The 1199 pitch

- **Same union, two funds, one story.** At the National Benefit Fund, MSP is a savings program: the
  50% Part B claim ends when the state pays the premium. It fits the Trustees' cost-savings
  committee (CAVIC) and its savings targets. At Home Care, about 10,500 retirees with ~$75 pensions
  are likely missing ~$2,435 a year each, and no 1199 fund covers their health in retirement.
- **Who decides.**
  - Funds: Executive Director Donna Rey, EdD; 498 Seventh Ave; retiree line (646) 473-8666.
  - Union: President Yvonne Armstrong (since 2025; secondary source).
  - Trustees: joint boards with the League of Voluntary Hospitals and Homes.
  - Vendors: re-bid by RFP. None was found for benefits screening or enrollment help.
- **Ask first:**
  - how many retirees claim the 50% Part B each quarter;
  - what share live in New York;
  - whether the Fund checks claimants for Medicaid or MSP;
  - whether Extra Help (deemed with MSP) changes the Aetna group plan's drug cost.

## Other savings targets, in order

1. **IUOE Local 94 School Division.** Reimburses Medicare premiums with a 15-year service rule.
   Small, but a clean saving. Executive Director William Faranda.
2. **IATSE National H&W.** A flat $80 a month, national.
3. **MILA (longshore).** Only one pensioner subgroup; need claim counts.
4. **City of New York.** Part B reimbursement for City pensioners. Very large, a public-sector sale.

## Not found / to call

Mason Tenders, Excavators 731, Local 282, Iron Workers 40/361/417, Steamfitters 638, Painting
Industry, Bricklayers, IUOE 137, Upstate Engineers, Teamsters 445, Local 210, UFCW 1500. Their plan
rules are behind member logins or unpublished, and phone numbers are in the notes. Two side notes:
cirs.org is no longer the Cultural Institutions plan (it's cirsplans.org), and carpenterfunds.com
and laundryfund.org belong to California funds.

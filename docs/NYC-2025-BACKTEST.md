# Backtest: New York City retiree Part B reimbursement, 2025

**Question.** New York City reimburses 100% of Medicare Part B (plus IRMAA)
for every Medicare-eligible retiree and covered spouse. How much of that would
New York's Medicare Savings Program (MSP) have covered instead in 2025?

**Answer in brief**
- **BERS** (Board of Education Retirement System: retired school aides, lunch
  workers, custodians and other non-teaching school staff) looks **as strong as
  1199**:
  - about **47% of reimbursed retirees are under the limit**
  - about **$9.4–14.2M** of 2025 leakage
  - the City pays the **full** premium ($2,220 a year each)
- **NYCERS** (most other city workers) is a high-pension system, so only a
  thin tail qualifies (about 1–9%). Because it's so large, that tail is still
  about **$5–7M** in the base case.
- **Combined:** about **$14–21M a year** of leakage, and **about $3–11M a
  year** the City could save in year one.

Reproduce it with: `python3 scripts/research/backtest_nyc.py`

## 1. Public data used

**NYC Office of the Actuary, FY2025 GASB 74/75 (OPEB) report**
([PDF](https://www.nyc.gov/assets/actuary/downloads/pdf/OPEB_GASB_7475_Report_FY2025.pdf))

- **The program:** "Upon application, the City … reimburse[s] the Medicare
  Part B Premium for all Medicare-eligible retirees and eligible covered
  dependents," including IRMAA.
- **Assumptions the City's actuary uses:**
  - 90% of Medicare participants claim the reimbursement, "based on
    historical data"
  - FY2025 annual premium of $2,158.20, plus a 12.5% IRMAA load
- **Part B headcounts, participant / spouse:**

  | System | Participants | Spouses |
  |---|---|---|
  | NYCERS | 108,924 | 37,639 |
  | TRS (teachers) | 87,712 | 26,933 |
  | BERS | 19,223 | 5,887 |
  | Police | 54,029 | 33,012 |
  | Fire | 16,677 | 11,613 |
  | **Total** | **about 290,500** | **about 116,600** |

- **The scale:** about 290,500 participants plus 116,600 spouses. At a 90%
  claim rate that's **roughly $800M a year**.

**BERS FY2025 actuarial valuation, Table XII-8 (pensions as of June 30, 2023)**
([PDF](https://www.nyc.gov/assets/actuary/downloads/pdf/BERS_Fiscal_Year_2025_Actuarial_Valuation_Report.pdf))

| | Pensioners and beneficiaries | Average pension |
|---|---|---|
| All | 21,216 | $16,100 a year |
| **Women** | **16,923 (80%)** | **$12,701 a year, about $1,058 a month** |
| Men | 4,293 | $29,497 a year |

- Women's service pensions fall with age: about $14,500 at 65–69 and about
  $9,400 at 90+.
- FY2025 (Empire Center): 21,170 retirees, averaging $16,614.

**NYCERS 2025 ACFR** ([PDF](https://cms.nycers.org/app/uploads/2026/05/2025-ACFR-.pdf))

- **181,949 pensioners** (FY2025).
- Service retirees (June 30, 2023):
  - women: 57,409, averaging **$31,136 a year**
  - men: 82,630, averaging $41,125
- Ordinary disability retirees: 8,976, averaging $21,356.
- Of 2024's new service retirees, 21% have pensions under $25,000 a year.

**New York's 2025 MSP limits:** QI-1 is **$2,426 single, $3,279 couple**,
gross, with no asset test
([NLS](https://nls.org/app/uploads/2025/05/Medicare-Savings-Programs-2025-FINAL-4-9-25.pdf)).

## 2. Model

- **Pensions:** lognormal around the SOURCED averages by sex, with a 0.6
  spread (ASSUMED; tested at 0.4–0.8).
- **Social Security (ASSUMED):**
  - BERS: women $1,250, men $1,700
  - NYCERS: women $1,600, men $2,000
  - 0.35 spread
- **Couples (ASSUMED):** 35% of women and 55% of men, with a spouse adding
  $1,200.
- **Eligible:** gross income under the QI-1 limit.
- **Leakage** = claiming lives (90%) × eligible share × 40% / 50% / 60% not
  enrolled × $2,220.
- **Capture:** 20% / 35% / 50% of the unenrolled.

## 3. Results (2025)

| | BERS | NYCERS |
|---|---|---|
| Reimbursed lives claiming | 22,599 | 131,907 |
| Income-eligible | **47%** (44–51% across spreads) | **4%** (1–9% across spreads) |
| Leakage, low / base / high | $9.4M / **$11.8M** / $14.2M | $4.9M / **$6.1M** / $7.4M |
| City saves in year one, low / base / high | $1.9M / **$4.1M** / $7.1M | $1.0M / **$2.1M** / $3.7M |

**Combined:**

| | Low | Base | High |
|---|---|---|---|
| Leakage a year | $14.3M | **$17.9M** | $21.5M |
| City saves a year | $2.9M | **$6.3M** | $10.8M |
| Fees at $300 | $0.39M | $0.85M | $1.45M |

**On pricing:** the City saves **$2,220 a year** per approval, twice 1199's
figure. $300 undersells that. **$600 per approval plus a renewal fee** is
still an easy yes, and doubles the fees.

## 4. How the three backtests compare (2025)

| | 1199 NBF | **NYC: BERS** | NYC: NYCERS | Hawaii EUTF |
|---|---|---|---|---|
| Who | Hospital and nursing home workers | School aides, lunch workers, custodians | Most city workers | State and county workers |
| Average pension | about $1,027 a month | **about $1,058 a month (women)** | about $2,600–3,400 a month | about $2,863 a month |
| Share of premium the plan pays | 50% | **100%** | 100% | 100% |
| State rules | NY 186%, no asset test | NY | NY | 135%, asset test |
| Income-eligible | about 44% | **about 47%** | about 4% | about 5–10% |
| 2025 leakage (base) | about $11.3M | **about $11.8M** | about $6.1M | about $1.7M |
| Savings per approval | $1,110 a year | **$2,220 a year** | $2,220 a year | $2,220 a year |

## 5. What this means

1. **BERS is as strong a target as 1199, and every approval is worth twice
   as much.**
   - Retired school aides and lunch workers have 1199-level pensions, and the
     City pays 100%.
   - The buyer is the City (its Office of Labor Relations, which runs Part B
     reimbursement).
   - The champions are the unions that represent BERS titles. For school
     aides and school lunch workers that's DC 37, Local 372 (confirm the
     local), plus your teacher contacts.
2. **NYCERS is a big pool with a thin tail.** It's worth including once the
   City is a client, using the pension data to target only low-pension
   retirees, survivors and disability retirees.
3. **New York City is one buyer covering both:** about $18M a year of base
   leakage across BERS and NYCERS, before TRS (teachers, high pensions) and
   police and fire (high pensions).
4. **Public filings are enough to rank targets:** BERS ≈ 1199 > NYCERS tail >
   Hawaii.
5. **Same caveat as before:** the City's own reimbursement file (who claims,
   how much, any existing state buy-in) settles the real number. The free scan
   on de-identified data is the ask.

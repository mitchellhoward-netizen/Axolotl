# Public-employer retirees under the NY MSP line: pension distributions

Researched 2026-10-07. Primary sources are the systems' own annual reports (ACFRs). Labels:
**verified** means the number is quoted from the source. **secondary** means it comes from a
government secondary source. **inferred** means it is my arithmetic, which is shown.

## Summary (10 lines)

1. Likely MSP-eligible (QI line) retirees aged 65+, central estimate (inferred; ranges in §A). **NYSLRS-ERS ≈ 49,800** (41,400–64,200) of 375,255 service and disability retirees.
2. Of the ERS figure, about **17,000 (14,500–19,800)** are school-district non-teaching retirees, out of 78,159. This is the densest pool: 22% likely eligible.
3. **NYCERS ≈ 17,600** (13,400–20,600) of 131,543 pensioners and beneficiaries aged 65+, or 13%.
4. **BERS ≈ 5,000** (4,500–5,200) of 18,219 aged 65+, or 27%. This is the highest rate of any system. Its women retirees average only $10–14k a year.
5. **TRS-NYC ≈ 5,800** (3,700–7,400) of 82,237 aged 65+, or 7%. **NYSTRS ≈ 14,200** of 184,921 at all ages, or 7.7%; about 11,400 if limited to ages 65+.
6. The central total across the five systems is about **92,000**. NYSLRS PFRS, NYC Police and NYC Fire are negligible: their average benefits are $62k–$90k a year.
7. Only NYSTRS publishes an actual count of recipients by monthly benefit band. NYSLRS publishes average pension by age × service × employer cell. The NYC systems publish only average pension by age × gender, so their band shapes are modelled.
8. Not everyone lives in NY. About 79% of NYSLRS recipients and 76% of NYSTRS recipients do (verified counts). Limited to NY residents, ERS falls to ≈ 39,200 and NYSTRS to ≈ 10,800.
9. NY public employees are overwhelmingly covered by Social Security: 94.9% of state and local employees (CRS, 2018 data). So total income is normally Social Security plus pension, which is what the repo's ACS band shares already assume.
10. The biggest bias is upward. The ACS bands measure *all* retirement income, while a fund pension is only part of it, and low fund pensions often come from short public careers where the person has other pensions. Read these figures as ceilings on the pool to market to, not as enrollment forecasts.

## Numbered findings

### 1. NYSLRS (FY ended 2026-03-31)
Source: https://www.osc.ny.gov/files/retirement/resources/pdf/annual-comprehensive-financial-report-2026.pdf

- **Average benefit (verified, p.192 "Average Pension Benefits Paid During Year Shown").** The table gives the average for "All Retirees & Beneficiaries" in 2026: ERS **$29,134** and PFRS **$66,007**. New retirees in 2026: ERS $36,365 and PFRS $97,315.
- **Counts by age (verified, p.208 "Retirees and Beneficiaries by Age").** "Total 493,093 [ERS retirees & beneficiaries] 447,920 [retirees] 45,173 [beneficiaries]". For PFRS: "42,334 39,227 3,107".
  - ERS aged 66+ (inferred, from the same table): 99,983 + 103,205 + 90,538 + 54,784 + 29,381 + 13,058 + 3,968 + 571 = **395,488**, which is 80.2% of 493,093. Of these, 359,105 are retirees and 36,383 are beneficiaries.
- **No band distribution is published.** Instead, "Service Retirees — ERS" (pp.181–182) and "Disability Retirees — ERS" (pp.185–186) give Number and Avg Pen by years of service × nearest age (<55, 55–64, 65–74, 75–84, 85+). They break this down for seven employer categories: State, Counties, Cities, Towns, Villages, Miscellaneous and School Districts.
  - The table defines Avg Pen as the "average annual pension benefit prior to option selection, including any cost-of-living adjustment".
  - My parse of the cells reconciles exactly with each category's printed Total row; for example, the State 65–74 column sums to 66,659.
- **School-district (non-teaching ERS) retirees are the low end (verified, p.182, School Districts, nearest age 65–74).**
  - Total row: "38,175 44,759 20,060". That is 38,175 retirees with average FAS $44,759 and average pension $20,060, or $1,672 a month.
  - Ages 75–84 average $17,695 and ages 85+ average $14,307.
  - Short-service cells are very low. For example, "Under 10 … 4,190 25,983 3,192" means 4,190 retirees averaging $3,192 a year ($266 a month). The 10–14 years cell is 6,654 retirees averaging $6,860.
  - By contrast, State ERS retirees aged 65–74 average $40,544.
- **Residence (verified, pp.32–33).** "New York 421,020 13,828,596,470" against a grand "Total 534,786 $17,247,310,758". 421,020 / 534,786 = **78.7%** live in NY (inferred).
- **Beneficiaries are not in the cells.** The 45,173 ERS beneficiaries, including 36,383 aged 66+, appear in no service × age cell, so the estimates below omit them.

### 2. NYSTRS (FY ended 2025-06-30)
Source: https://www.nystrs.org/getmedia/aa31d8ed-8708-4985-be81-8e124f48dad2/2025-ACFR.pdf

- **Actual band distribution (verified, p.144 "Retired Members and Beneficiaries by Type of Benefit — as of June 30, 2025", "Amount of Monthly Benefit").**

| Monthly benefit | Recipients |
|---|---|
| $1–$500 | 13,782 |
| $501–$1,000 | 13,054 |
| $1,001–$1,500 | 10,494 |
| $1,501–$2,000 | 9,484 |
| $2,001–$2,500 | 10,184 |
| $2,501–$3,000 | 11,052 |
| $3,001–$3,500 | 13,106 |
| $3,501–$4,000 | 16,360 |
| $4,001–$4,500 | 18,051 |
| $4,501–$5,000 | 16,003 |
| over $5,000 | 53,351 |
| **Total** | **184,921** |

  - This total includes beneficiaries (types 4–6: 7,313 + 256 + 90) and 2,008 disability retirees.
  - 25.3% of recipients are at $2,000 a month or less (inferred: 46,814 / 184,921). So teachers are not uniformly high-pension: many short-service and part-time members retire with small pensions.
- **Shape (inferred).** I fitted a lognormal to these bands: median ≈ $39,300 a year and log-sd σ ≈ 1.07. This σ is the only full-stock dispersion measure available, and §A uses it for calibration.
- **Residence (verified, p.133 "Distribution of Benefits Paid by County").** "Out of State 44,221 $1,808,232,496" and "Grand Total 184,921 $8,648,668,392". In NY: 140,700 / 184,921 = **76.1%** (inferred).
- **Age.** No retiree-by-age table was found in the statistical section, so I could not split out ages 65+ (open question). As a proxy I use the ERS 66+ share (80.2%).

### 3. NYCERS (FY ended 2025-06-30)
Source: https://cms.nycers.org/app/uploads/2026/05/2025-ACFR-.pdf (linked from nycers.org's "2025 Annual Comprehensive Financial Report" page)

- **Counts and average (verified, p.273 "Table of Retirement Benefits by Type").** For 2025: "Total 178,659 $36,585". By type:
  - Service: 147,196 at $38,925.
  - Disability (non-duty): 8,967 at $23,202.
  - Disability (duty): 5,000 at $46,679.
  - Surviving beneficiaries: 17,496 at $20,873.
- **By age × gender (verified, pp.254–255, "Data used in the June 30, 2023 actuarial valuation", "All Pensioners and Beneficiaries").** Ages 65+:

| Age | Female number | Female average | Male number | Male average |
|---|---|---|---|---|
| 65–69 | 14,594 | $32,044 | 18,389 | $41,581 |
| 70–74 | 14,329 | $29,733 | 18,358 | $38,767 |
| 75–79 | 12,259 | $27,424 | 15,256 | $36,379 |
| 80–84 | 8,925 | $24,489 | 10,599 | $33,275 |
| 85–89 | 5,398 | $21,180 | 5,648 | $30,552 |
| 90+ | 4,728 | $17,994 | 3,060 | $27,863 |

  - 65+ total = **131,543** (inferred sum) of 170,396 in all.
- **Only new retirees get a band distribution (verified, p.269 "Distribution of Retirement Allowance by Years of Service", calendar 2024, n = 5,210).**
  - Annual bands of $5k: "$4,999 or less … 42", "$5,000–$9,999 … 256", "$10,000–$14,999 … 294", "$15,000–$19,999 … 250", "$20,000–$24,999 … 257" … "$100,000 or more … 357".
  - Lognormal fit (inferred): σ ≈ 0.75 overall. Within a single service band σ is 0.36–0.53; for example, 20–24.9 years gives σ = 0.46 and 25–29.9 years gives σ = 0.36.
- **Residence.** NYCERS reports no out-of-state share in the pages read (open question).

### 4. BERS (FY ended 2025-06-30; retiree data is the June 30, 2023 lag valuation)
Source: https://www.bers.nyc.gov/assets/bers/downloads/pdf/publications/bers_acfr_fy2025.pdf

- **All pensioners and beneficiaries (verified, pp.152–153).** "TOTALS 4,293 $29,497 [men] 16,923 $12,701 [women]", i.e. 21,216 in all. The ACFR notes: "This schedule is based on 2023 data (LAG)".
- **Ages 65+ (verified).**

| Age | Men number | Men average | Women number | Women average |
|---|---|---|---|---|
| 65–69 | 883 | $31,944 | 3,257 | $14,306 |
| 70–74 | 910 | $30,072 | 3,634 | $13,423 |
| 75–79 | 741 | $28,829 | 3,153 | $12,140 |
| 80–84 | 537 | $28,569 | 2,195 | $11,546 |
| 85–89 | 317 | $26,825 | 1,324 | $10,363 |
| 90+ | 193 | $25,958 | 1,075 | $10,221 |

  - 65+ total = **18,219** (inferred), of whom 14,638 (80%) are women averaging roughly $1,000–1,200 a month.
- **Service retirees (verified, p.157 "Annual Average Benefit Payment Amounts").** "2023(Lag) 18,665 $16,317 $1,360", i.e. 18,665 retirees averaging $16,317 a year or $1,360 a month.
- **No amount-band table** was found.

### 5. TRS-NYC (FY ended 2025-06-30; retiree schedules as of 2024-06-30)
Source: https://trsnyc.org/memberportal/getmedia/d0a40747-9cde-4bf0-83db-47acd08ee3e3/ACFR2025.pdf

- **Average benefit (verified, p.185, Schedule 12).** "2024 85,435 55,143". That is 85,435 service retirees averaging $55,143. Ordinary disability: 2,675 at $26,244. Survivors: 5,715 at $41,933.
- **By age × gender (verified, Schedules 13–16).**
  - Service retirees: men total "22,057 $64,067", women "63,378 $52,036". Women aged 65–69 are "9,969 46,871".
  - Ordinary disability: women aged 65–69 are "391 24,204".
  - The 65+ cells across service, ordinary disability, accidental disability and survivors sum to **82,237** (inferred).
- **No amount-band table** was found.

### 6. NYC uniformed funds (verified; not estimated because their averages are far above the line)
- **Fire.** https://www.nyc.gov/assets/fdny/downloads/pdf/about/fire-pension-fund-cafr.pdf, "All Pensioners and Beneficiaries", June 30, 2023 data: "TOTAL … 16,871 1,523,609,382 90,309". The youngest 65+ cell, ages 65–69, averages $99,642.
- **Police.** https://www.nyc.gov/assets/nycppf/downloads/pdf/acfr-fy2025.pdf, same table: "TOTAL … 54,321 3,359,671,401 61,848". Ages 85–89 average $37,870.
- **NYSLRS PFRS.** Average $66,007 (from §1).
- These are treated as ≈ 0 eligible.

### 7. Social Security coverage
- **CRS R46961, Table 1, 2018 data (secondary).** "New York 1,746,900 1,658,100 94.9% 88,800 5.0%". That is 1,746,900 state and local employees, of whom 1,658,100 (94.9%) are covered and 88,800 (5.0%) are not. Mirror: https://www.everycrsreport.com/files/2021-11-10_R46961_b651c2fe9a2834584a8ee2f21bb8da899aac4b75.html
- **Same CRS report (secondary).** Under the 1956 amendments, "eight states (Florida, Georgia, New York, …) … were permitted to operate divided retirement systems in which some positions are covered by Social Security and some p[ositions are not]". The legal basis is the Section 218 agreement under NY Retirement & Social Security Law Art. 3 (§133). I only saw search-result text of that statute, so its exact wording is not verified here.
- **Plan documents confirm coverage, NYC included (verified).**
  - BERS (2025 ACFR): Tier 3 "benefits were reduced by one half of the primary Social Security benefit attributable to service with the Employer".
  - TRS-NYC (2025 ACFR) has the same Tier III offset.
  - NYCERS defines "Primary Social Security Benefit … based upon wages earned from a public employer from which Social Security deductions were taken".
  - FDNY (2025 ACFR) lets members reduce contributions "up to the amount of Social Security (FICA) contributions".
- **Conclusion (inferred).** For the great majority of these retirees, countable income is Social Security plus pension. A pension alone near the line therefore means they are almost certainly *over* it unless their Social Security is small.

## A. Arithmetic (all inferred)

**Band shares.** These come from `archive/research/msp_ny_eligibility/estimates.json`: the share of NY residents aged 65+ on Medicare under the QI line, by the person's own monthly retirement income (ACS RETP):

| Monthly retirement income | Share under the line |
|---|---|
| < $500 | 0.5181 |
| $500–999 | 0.3025 |
| $1,000–1,499 | 0.1503 |
| $1,500–1,999 | 0.0626 |
| $2,000+ | 0.0070 |

Likely-eligible = Σ over bands of (recipients in band × share).

**Modelling bands where only cell averages exist.** Each cell's recipients are spread on a lognormal with mean equal to the cell average and log-sd σ:

```
mu = ln(mean_annual / 12) − σ²/2
P(band) = Φ((ln hi − mu)/σ) − Φ((ln lo − mu)/σ)
```

I also report σ = 0, which puts the whole cell at its average. That is a floor, because it ignores within-cell spread.

- **NYSLRS ERS.** Cells are age × service × employer, so the within-cell σ should be small. Central σ = 0.45, from NYCERS' within-service fits of 0.36–0.53. The range runs from σ = 0 to σ = 0.75.
- **NYC systems.** Cells are only age × gender, so service variation stays inside the cell. Central σ = 0.9, with a range of 0.75 (NYCERS 2024 new retirees) to 1.0 (NYSTRS full stock, σ 1.07, less a little between-cell variance).

**NYSTRS (direct, no model).**

```
13,782×.5181 + 13,054×.3025 + 10,494×.1503 + 9,484×.0626 + 138,107×.007
= 7,140 + 3,949 + 1,577 + 594 + 967 = 14,227   (7.7% of 184,921)
```

- Ages 65+ proxy: ×0.802 → 11,410.
- NY residents: ×0.761 → 10,827.
- Both adjustments: ≈ 8,700.
- Caveat: the $2,000 edge differs slightly. NYSTRS's band is $1,501–2,000, while the ACS band is $1,500–1,999.

**NYSLRS ERS, service + disability retirees, nearest age 65+.** n = 375,255 across 7 employers × 7 service bands × 3 age bands × 2 types.

| σ | <$500 | $500–999 | $1,000–1,499 | $1,500–1,999 | $2,000+ | Eligible |
|---|---|---|---|---|---|---|
| 0 (cell avg) | 19,332 | 76,587 | 34,726 | 23,809 | 220,801 | **41,439** (11.0%) |
| 0.45 (central) | 39,624 | 61,302 | 46,209 | 40,101 | 188,019 | **49,845** (13.3%) |
| 0.75 | 63,507 | 66,827 | 50,232 | 38,576 | 156,112 | **64,176** (17.1%) |

- In NY only (×0.787): central 39,241, range 32,624–50,524.
- School Districts only (n = 78,159): σ = 0 gives 14,506 (18.6%); σ = 0.45 gives **16,994 (21.7%)**; σ = 0.75 gives 19,841 (25.4%).
- Worked example of one cell: School Districts, under 10 years of service, nearest age 65–74. 4,190 retirees at $3,192 a year is $266 a month. At σ = 0 the whole cell is in the < $500 band, giving 4,190 × 0.5181 = 2,171.
- If the 36,383 ERS beneficiaries aged 66+ had the same rate (13.3%), that would add ≈ 4,800. This is not included.

**NYC systems (age × gender cells, 65+).**

| System | n | σ = 0 | σ = 0.75 | σ = 0.9 (central) | σ = 1.0 |
|---|---|---|---|---|---|
| NYCERS | 131,543 | 1,898 | 13,389 | **17,638** (13.4%) | 20,570 |
| BERS | 18,219 | 2,924 | 4,523 | **4,964** (27.2%) | 5,246 |
| TRS-NYC | 82,237 | 589 | 3,734 | **5,805** (7.1%) | 7,402 |

- Example for BERS at σ = 0.9: women aged 70–74 number 3,634 with an average of $13,423 a year, or $1,119 a month.
  - mu = ln(1,119) − 0.405 = 6.615.
  - P(< $500) = Φ((6.215 − 6.615)/0.9) = Φ(−0.44) ≈ 0.33, so about 1,200 of this cell fall in the band with a 52% eligibility share.
- The σ = 0 column is shown only to make clear how much the result depends on within-cell spread. At σ = 0 every NYCERS cell average is above $1,500 a month, so almost no one counts as eligible. That is not realistic.

**Total, central.** 49,845 + 14,227 + 17,638 + 4,964 + 5,805 = **92,479**, of which the three NYC systems contribute 28,407 (range 21,646–33,218).

## B. Caveats

1. **Pension ≠ ACS retirement income.**
   - RETP includes all pensions and IRA withdrawals. A retiree with a $400-a-month ERS pension from 7 years of service may also have a private pension, so their RETP band is higher than their fund band. Applying shares by fund band therefore overstates eligibility, most of all in the low bands, which drive the result.
   - Survey under-reporting of pensions, already noted in estimate.py, pushes the other way.
2. **Benefit definitions differ by system.**
   - NYSLRS "Avg Pen" is before option reduction. Actual payments under a joint-and-survivor option are lower.
   - NYSTRS bands use the "Maximum" benefit with supplementation and COLA. NYC averages are allowances.
3. **Beneficiaries and disability retirees.**
   - Included: NYSTRS, NYCERS, BERS and TRS (all-pensioner tables), and ERS disability retirees.
   - Excluded: ERS beneficiaries.
   - Surviving spouses are budgeted as singles, which helps them qualify. The ACS shares already reflect this.
4. **Age 65+.** NYSLRS uses "nearest age", so its 65–74 band includes some 64-year-olds. NYSTRS has no age split. NYC tables use 2023 or 2024 valuation data, not 2025.
5. **Residence.** An out-of-state retiree cannot use NY's MSP. The employer still saves if they enroll in their own state's MSP, but that is outside Mycelium's NY scope. About 21–24% live out of state (NYSLRS, NYSTRS). The NYC share is unknown.
6. **Part B reimbursement eligibility.** The employer only benefits for retirees whom it actually reimburses for Part B. That generally means retirees enrolled in the employer's retiree health plan (NYSHIP or a NYC plan) with enough service. This was not quantified here, and some ERS local employers do not participate in NYSHIP.
7. **Already enrolled.** Some of these retirees already have an MSP. The ACS data cannot identify them, as noted in estimate.py.
8. **σ is a modelling choice.** The NYC estimates move ±25% across the plausible σ range, and much more if within-cell spread is ignored entirely.

## C. Open questions

1. **Actual amount-band data for NYSLRS, NYCERS, BERS and TRS-NYC.** The actuaries' valuation data has it, so it could be requested from OSC or the NYC Office of the Actuary. SeeThroughNY publishes NYSLRS pension amounts by name, which could rebuild the ERS distribution directly.
2. **Ages 65+ for NYSTRS**, from its actuarial valuation report.
3. **Out-of-state shares for the NYC systems.**
4. **How many of each system's 65+ retirees are in NYSHIP or a NYC retiree health plan**, and therefore receive Part B reimbursement. Sources would be the Department of Civil Service and NYC OLR / Office of Labor Relations Health Benefits.
5. **ERS beneficiaries' benefit amounts.** 45,173 recipients are not in any cell table.
6. **The exact text of the Section 218 agreement and its modifications for NY** (SSA State Social Security Administrator, NYS Office of the State Comptroller). This would confirm which positions are excluded from coverage. Per CRS, about 5% of state and local employees are not covered.

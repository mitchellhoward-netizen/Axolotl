# Backtest: Hawaii EUTF, 2025

**Question.** Hawaii's Employer-Union Health Benefits Trust Fund (EUTF)
reimburses retirees' Medicare Part B premium in full. How much of that would
the state's Medicare Savings Program (MSP) have covered instead in 2025?

**Answer in brief: far less than 1199.**

- Only about **5–10% of Hawaii's public retirees** are under the state's MSP
  income limit.
- Hawaii also keeps an **asset test**, which removes many more.
- 2025 leakage is about **$1.1–2.4M** on roughly $100M of Part B
  reimbursement.
- A year of Axolotl outreach would move about **$0.2–1.2M**, so roughly
  **$0.03–0.16M in fees** at $300.

That makes Hawaii a weak target for premium help. It may be a better one for
disability-to-Medicare coordination.

Reproduce it with: `python3 scripts/research/backtest_hawaii.py`

## 1. Public data used

**Hawaii ERS 2024 ACFR, Statistical Section**
- Source: "Benefit Payments by Retirement Type and Option," as of March 31,
  2024 ([ERS](https://ers.ehawaii.gov/wp-content/uploads/2025/11/ACFR-2024-Final-Web-r.pdf)).
- Every retiree and beneficiary is counted by $500 pension band, across the
  Contributory, Hybrid and Noncontributory classes.
- **55,820 recipients** in total.
- **11,780 (21%) have a pension under $1,000 a month.**
- The average service pension is **$2,863 a month** (2024), nearly 3× 1199's
  about $1,027.
- All three classes are generally covered by Social Security.
- About 1,769 recipients (3.2%) are disability retirees.

**EUTF Part B reimbursement**
- About **$98M a year**, of which about $8.5M is IRMAA (the extra premium
  for higher-income retirees). Source: Hawaii Legislature, 2023
  ([SB1315](https://data.capitol.hawaii.gov/sessions/session2023/Bills/SB1315_.PDF)).
- Earlier annual reports: $92.4M (FY2020) and $99.4M (FY2021).
- That implies **about 45,000 reimbursed lives**. At the 2025 premium the
  standard part costs **about $100M**.
- The EUTF reimburses **100%** of the standard premium (IRMAA too, for those
  hired before July 2023).
  ([EUTF](https://eutf.hawaii.gov/medicare/part-b-reimbursement/))

**Hawaii MSP limits for 2025**
- Income: QI about **$2,044 single, $2,756 couple**, gross with the $20
  disregard. That's lower than New York's $2,426, because Hawaii uses the
  regular 135% QI cutoff.
- Assets: about **$9,660 single / $14,470 couple** (federal standard).
- Sources: [CMS NTP 2025](https://cmsnationaltrainingprogram.cms.gov/sites/default/files/shared/2025%20Medicare%20Savings%20Program%20Income%20Limits_FINAL508.pdf),
  [Med-QUEST](https://medquest.hawaii.gov/en/archive/eligibility/EligPrograms_MSP.html).

## 2. Model

**Income**
- Pension: drawn from the SOURCED bands.
- Social Security: mean $1,700 a month, 35% spread. 5% of retirees have
  little or none.
- Couples: 45%, with a spouse adding $1,200 a month.
- All of these are ASSUMED.

**Eligibility** = income under the QI limit **×** a 40% / 50% / 60% share who
also pass the asset test (ASSUMED).

**Leakage** = fully eligible × 40% / 50% / 60% not enrolled × $2,220 (100% of
the 2025 premium).

**Capture** = 20% / 35% / 50% of the unenrolled.

## 3. Results

**Income-eligible share:** **6.6%** in the base case. It's 9.7% if Social
Security averages $1,400, and 4.6% if it averages $2,000.

| | Low | Base | High |
|---|---|---|---|
| Fully eligible reimbursed lives | 1,195 | 1,493 | 1,792 |
| **2025 leakage** | **$1.1M** | **$1.7M** | **$2.4M** |
| Enrollments Axolotl moves in a year | 96 | 261 | 538 |
| EUTF saves a year | $0.2M | $0.6M | $1.2M |
| Fees at $300 | $0.03M | $0.08M | $0.16M |

## 4. What this shows

1. **The premium-help opportunity depends on two things together:**
   - low pensions
   - generous state rules (New York's 186% limit with no asset test)

   1199 has both. Hawaii has neither: pensions are 3× higher, the limit is
   135% of the poverty line, and there's an asset test.

2. **Paying 100% doesn't make up for few eligible retirees.** Each Hawaii
   enrollment saves twice as much ($2,220 against $1,110), but there are about
   15× fewer of them.

3. **Hawaii's better angle is disability.**
   - About 1,769 ERS recipients are disability retirees, and the EUTF keeps
     retirees on coverage.
   - So disability-to-Medicare coordination (SSDI, then Medicare paying first)
     saves real money per member. The outside estimate is about $9–37K a
     year for each disabled retiree under 65 who isn't yet on Medicare.
   - That's the plan design where SSDC and PCG already sell to public plans.
   - It needs the EUTF's own list of disability retirees under 65 and their
     Medicare status.

4. **This sharpens how to pick targets.** Rank prospects by:
   1. **Share of retirees with pensions under about $1,000 a month.** It's
      public for pension funds, in the Form 5500 or ACFR.
   2. **The state's MSP rules:** the income limit, and whether there's an
      asset test.
   3. **How much of the premium the plan reimburses.**

   **1199 scores high, Hawaii low.** New York public plans (NYC, NYS, school
   districts) are next to check. They have New York's rules, but their pensions
   are higher than 1199's.

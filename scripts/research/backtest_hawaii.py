"""
Backtest: how much Part B leakage would continuous monitoring have found at
Hawaii's Employer-Union Health Benefits Trust Fund (EUTF) in 2025?

Public inputs only. SOURCED figures come from the Hawaii ERS 2024 ACFR
(Statistical Section, "Benefit Payments by Retirement Type and Option", as of
March 31, 2024), CMS and Hawaii Med-QUEST; ASSUMED figures are modelling choices.
See docs/HAWAII-2025-BACKTEST.md.

    python3 scripts/research/backtest_hawaii.py
"""

import random

random.seed(808)

# ── SOURCED: ERS retirees and beneficiaries by monthly pension band ─────────────
# (Contributory, Hybrid, Noncontributory) counts per band; last band is $5,000+.
BANDS = [
    ((1, 500), (676, 703, 2197)),
    ((500, 1000), (1134, 2540, 4530)),
    ((1000, 1500), (1244, 2680, 3359)),
    ((1500, 2000), (1462, 2135, 2516)),
    ((2000, 2500), (1405, 1653, 1985)),
    ((2500, 3000), (1573, 1523, 1930)),
    ((3000, 3500), (1791, 1378, 1569)),
    ((3500, 4000), (1732, 1277, 974)),
    ((4000, 4500), (1395, 950, 565)),
    ((4500, 5000), (1115, 683, 336)),
    ((5000, 8000), (4639, 1641, 530)),
]
RECIPIENTS = sum(sum(c) for _, c in BANDS)   # 55,820

# ── SOURCED: rules ──────────────────────────────────────────────────────────────
PART_B_2025 = 185.00
EUTF_SHARE = 1.00                    # EUTF reimburses the full standard premium
HI_QI_2025 = {"single": 2044, "couple": 2756}   # Hawaii FPL-based, incl. $20 disregard
ASSET_LIMIT_2025 = {"single": 9660, "couple": 14470}
# EUTF's Part B reimbursement ≈ $98M a year, of which ≈ $8.5M IRMAA (Hawaii Legislature, 2023)
EUTF_STANDARD_PART_B_SPEND_2023 = 98_000_000 - 8_500_000
PART_B_2023 = 164.90

# ── ASSUMED ─────────────────────────────────────────────────────────────────────
SS_MEAN = 1700          # monthly Social Security for a covered public employee, 2025
SS_SPREAD = 0.35        # lognormal spread
NO_SS_SHARE = 0.05      # retirees with little or no Social Security
COUPLE_SHARE = 0.45
SPOUSE_INCOME = 1200
ASSET_PASS = (0.40, 0.50, 0.60)   # share of income-eligible who also pass the asset test
UNENROLLED = (0.40, 0.50, 0.60)
CAPTURE = (0.20, 0.35, 0.50)


def draw_pension() -> float:
    r = random.random() * RECIPIENTS
    acc = 0
    for (lo, hi), counts in BANDS:
        acc += sum(counts)
        if r <= acc:
            return random.uniform(lo, hi)
    return 6000.0


def income_eligible_share(n: int = 300_000) -> float:
    hits = 0
    for _ in range(n):
        pension = draw_pension()
        ss = 0.0 if random.random() < NO_SS_SHARE else SS_MEAN * random.lognormvariate(0, SS_SPREAD)
        couple = random.random() < COUPLE_SHARE
        income = pension + ss + (SPOUSE_INCOME if couple else 0)
        if income <= HI_QI_2025["couple" if couple else "single"]:
            hits += 1
    return hits / n


def main() -> None:
    reimbursed = EUTF_STANDARD_PART_B_SPEND_2023 / (PART_B_2023 * 12)
    print(f"ERS recipients (SOURCED): {RECIPIENTS:,}")
    print(f"Reimbursed Part B lives implied by ~$89.5M standard spend (2023): {reimbursed:,.0f}")
    print(f"2025 standard Part B cost to EUTF at that headcount: "
          f"${reimbursed * PART_B_2025 * 12 / 1e6:,.1f}M")
    low_pension = sum(sum(c) for (lo, hi), c in BANDS if hi <= 1000)
    print(f"Recipients with pension under $1,000/mo (SOURCED): {low_pension:,} "
          f"({low_pension / RECIPIENTS:.1%})")

    share = income_eligible_share()
    print(f"\nIncome-eligible for Hawaii MSP (QMB/SLMB/QI), 2025: {share:.1%}")
    per_life = PART_B_2025 * 12 * EUTF_SHARE
    for label, a, u, c in zip(("low", "base", "high"), ASSET_PASS, UNENROLLED, CAPTURE):
        eligible = reimbursed * share * a
        leak = eligible * u * per_life
        moved = eligible * u * c
        print(f"  {label}: fully eligible {eligible:,.0f} → leakage ${leak / 1e6:,.1f}M/yr; "
              f"captured {moved:,.0f} → EUTF saves ${moved * per_life / 1e6:,.1f}M/yr, "
              f"fees at $300 ${moved * 300 / 1e6:,.2f}M")


if __name__ == "__main__":
    main()

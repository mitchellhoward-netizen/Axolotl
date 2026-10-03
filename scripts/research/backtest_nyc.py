"""
Backtest: how much Part B leakage would continuous monitoring have found in New
York City's Medicare Part B reimbursement program in 2025, for retirees of the
Board of Education Retirement System (BERS: non-teaching school staff) and the
New York City Employees' Retirement System (NYCERS: most other city workers)?

Public inputs only. SOURCED: NYC Office of the Actuary FY2025 GASB 74/75 report
(Part B headcounts, 90% claim rate, 100% + IRMAA reimbursement); BERS FY2025
actuarial valuation (pensions by sex, June 30, 2023); NYCERS 2025 ACFR
(pensioners by sex). ASSUMED: Social Security, marriage, take-up, capture.
See docs/NYC-2025-BACKTEST.md.

    python3 scripts/research/backtest_nyc.py
"""

import random

random.seed(212)

PART_B_2025 = 185.00
CITY_SHARE = 1.00          # City reimburses the full standard premium (plus IRMAA)
CLAIM_RATE = 0.90          # SOURCED: OPEB valuation assumption, "based on historical data"
NY_QI_2025 = {"single": 2426, "couple": 3279}   # gross, incl. $20 disregard (NLS 2025)

# SOURCED: Part B reimbursement headcounts (participant + spouse), FY2025 OPEB report
SYSTEMS = {
    "BERS": {"participants": 19_223, "spouses": 5_887},
    "NYCERS": {"participants": 108_924, "spouses": 37_639},
}

# SOURCED pensions (monthly) by sex; ASSUMED Social Security and couple share
COHORTS = {
    # BERS, June 30, 2023: women 16,923 avg $12,701/yr; men 4,293 avg $29,497/yr
    "BERS": [
        {"share": 16_923 / 21_216, "pension": 12_701 / 12, "ss": 1250, "couple": 0.35},
        {"share": 4_293 / 21_216, "pension": 29_497 / 12, "ss": 1700, "couple": 0.55},
    ],
    # NYCERS service retirees, June 30, 2023: women 57,409 avg $31,136; men 82,630 avg $41,125
    "NYCERS": [
        {"share": 57_409 / 140_039, "pension": 31_136 / 12, "ss": 1600, "couple": 0.35},
        {"share": 82_630 / 140_039, "pension": 41_125 / 12, "ss": 2000, "couple": 0.55},
    ],
}
PENSION_SPREAD = 0.60      # ASSUMED lognormal spread (pensions vary widely by service)
SS_SPREAD = 0.35
SPOUSE_INCOME = 1200
UNENROLLED = (0.40, 0.50, 0.60)
CAPTURE = (0.20, 0.35, 0.50)


def lognormal_with_mean(mean: float, sigma: float) -> float:
    # E[X] = exp(mu + sigma^2 / 2) → mu = ln(mean) - sigma^2 / 2
    import math
    return random.lognormvariate(math.log(mean) - sigma ** 2 / 2, sigma)


def eligible_share(system: str, n: int = 200_000) -> float:
    hits = 0
    for _ in range(n):
        r, acc = random.random(), 0.0
        for c in COHORTS[system]:
            acc += c["share"]
            if r <= acc:
                break
        income = lognormal_with_mean(c["pension"], PENSION_SPREAD) + lognormal_with_mean(c["ss"], SS_SPREAD)
        couple = random.random() < c["couple"]
        if couple:
            income += SPOUSE_INCOME
        if income <= NY_QI_2025["couple" if couple else "single"]:
            hits += 1
    return hits / n


def main() -> None:
    per_life = PART_B_2025 * 12 * CITY_SHARE
    total = {"leak": [0, 0, 0], "save": [0, 0, 0], "fees": [0, 0, 0]}
    for system, h in SYSTEMS.items():
        lives = (h["participants"] + h["spouses"]) * CLAIM_RATE
        share = eligible_share(system)
        eligible = lives * share
        print(f"{system}: reimbursed lives claiming ≈ {lives:,.0f}; income-eligible {share:.1%} "
              f"≈ {eligible:,.0f}; City pays ${per_life:,.0f}/yr each")
        for i, (label, u, c) in enumerate(zip(("low", "base", "high"), UNENROLLED, CAPTURE)):
            leak = eligible * u * per_life
            moved = eligible * u * c
            total["leak"][i] += leak
            total["save"][i] += moved * per_life
            total["fees"][i] += moved * 300
            print(f"   {label}: leakage ${leak / 1e6:,.1f}M/yr; captured {moved:,.0f} → "
                  f"City saves ${moved * per_life / 1e6:,.1f}M/yr")
    print("\nBERS + NYCERS combined:")
    for i, label in enumerate(("low", "base", "high")):
        print(f"   {label}: leakage ${total['leak'][i] / 1e6:,.1f}M/yr; City saves "
              f"${total['save'][i] / 1e6:,.1f}M/yr; fees at $300 ${total['fees'][i] / 1e6:,.2f}M")


if __name__ == "__main__":
    main()

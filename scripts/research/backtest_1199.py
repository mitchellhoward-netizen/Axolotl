"""
Backtest: how much Part B leakage would continuous monitoring have found at the
1199SEIU National Benefit Fund (NBF) in 2025?

Public inputs only (no member data). Every figure is labelled SOURCED (from a
public filing or agency) or ASSUMED (our modelling choice, to be replaced by the
fund's real files). See docs/1199-2025-BACKTEST.md for sources and discussion.

    python3 scripts/research/backtest_1199.py
"""

import random
import statistics

random.seed(1199)

# ── SOURCED: Form 5500, plan year 2024 (DOL EFAST2 public dataset) ──────────────
NBF_RETIREES_RECEIVING = 43_673          # NBF health fund, line 6b
HCEPF_RECIPIENTS = 82_266 + 11_294       # pension fund retirees + beneficiaries
HCEPF_BENEFITS_PAID = 1_153_470_407      # pension fund, Schedule H
HCEPF_AVG_MONTHLY = HCEPF_BENEFITS_PAID / HCEPF_RECIPIENTS / 12   # ≈ $1,027

# ── SOURCED: program rules by year ──────────────────────────────────────────────
# New York MSP gross monthly limits, incl. the $20 disregard (NLS 2025; NLS/NCOA 2026)
LIMITS = {
    2024: {"qi_single": 2355, "qi_couple": 3190},  # ASSUMED from 2024 FPL x 186% + $20
    2025: {"qi_single": 2426, "qi_couple": 3279},
    2026: {"qi_single": 2494, "qi_couple": 3375},
}
PART_B = {2024: 174.70, 2025: 185.00, 2026: 202.90}   # CMS standard premium
COLA = {2025: 0.025, 2026: 0.028}                     # SSA
FUND_SHARE = 0.50                                     # NBF reimburses 50% of standard Part B

# ── ASSUMED: retiree population mix (replace with the fund's pension bands) ─────
# SSA scaled monthly benefits at full retirement age, 2025 dollars:
# very low $988, low $1,295, medium $2,140, high $2,823 (SSA Trustees, scaled workers).
# Tier shares and pension by tier are chosen so the average pension reproduces the
# SOURCED pension fund average (~$1,027/month).
TIERS = [
    # (share, Social Security at FRA, pension/month)
    (0.10, 988, 400),     # very low earners (aides, dietary, housekeeping)
    (0.35, 1295, 700),    # low earners (CNAs, clerical)
    (0.40, 2140, 1150),   # medium earners (techs, LPNs)
    (0.15, 2823, 2000),   # high earners (RNs)
]
EARLY_CLAIM_SHARE = 0.40      # claimed Social Security before full retirement age
EARLY_CLAIM_FACTOR = 0.77     # benefit at ~62-63 vs FRA
SPREAD = 0.20                 # lognormal spread within a tier
MARRIED_SHARE = 0.45          # share of retirees who are a couple for MSP purposes
SPOUSE_INCOME = 1000          # monthly income a spouse adds
MEDICARE_AGE_SHARE = 0.85     # NBF retirees 65+ (Part B reimbursement requires 65+)
REIMBURSED_SPOUSE_RATIO = 0.25  # extra reimbursed spouses per reimbursed retiree
UNENROLLED = (0.40, 0.50, 0.60)  # share of eligibles NOT in MSP: low / base / high
CAPTURE = (0.20, 0.35, 0.50)      # share of unenrolled eligibles Axolotl enrolls


def draw_person(year: int) -> tuple[float, bool]:
    """Return (gross monthly income, is_couple) for one simulated retiree in `year`."""
    r, acc = random.random(), 0.0
    for share, ss, pension in TIERS:
        acc += share
        if r <= acc:
            break
    ss *= EARLY_CLAIM_FACTOR if random.random() < EARLY_CLAIM_SHARE else 1.0
    ss *= random.lognormvariate(0, SPREAD)
    pension *= random.lognormvariate(0, SPREAD)
    # Express Social Security in the given year's dollars (pensions are flat).
    if year == 2024:
        ss /= 1 + COLA[2025]
    elif year == 2026:
        ss *= 1 + COLA[2026]
    couple = random.random() < MARRIED_SHARE
    income = ss + pension + (SPOUSE_INCOME if couple else 0)
    return income, couple


def eligible_share(year: int, n: int = 200_000) -> float:
    lim = LIMITS[year]
    hits = 0
    for _ in range(n):
        income, couple = draw_person(year)
        if income <= (lim["qi_couple"] if couple else lim["qi_single"]):
            hits += 1
    return hits / n


def main() -> None:
    pensions = []
    for _ in range(100_000):
        r, acc = random.random(), 0.0
        for share, _ss, pension in TIERS:
            acc += share
            if r <= acc:
                break
        pensions.append(pension * random.lognormvariate(0, SPREAD))
    print(f"Calibration: modelled avg pension ${statistics.mean(pensions):,.0f}/mo "
          f"vs SOURCED ${HCEPF_AVG_MONTHLY:,.0f}/mo")

    reimbursed = NBF_RETIREES_RECEIVING * MEDICARE_AGE_SHARE * (1 + REIMBURSED_SPOUSE_RATIO)
    print(f"Reimbursed Medicare lives (ASSUMED from SOURCED retirees): {reimbursed:,.0f}")
    print(f"Implied max NBF Part B reimbursement 2025 if all claim: "
          f"${reimbursed * PART_B[2025] * 12 * FUND_SHARE / 1e6:,.1f}M")

    shares = {y: eligible_share(y) for y in (2024, 2025, 2026)}
    for y, s in shares.items():
        print(f"{y}: income-eligible for NY MSP (QMB or QI) ≈ {s:.1%}")
    print(f"Monitoring effect 2024→2025 (FPL rise vs 2.5% COLA): "
          f"{(shares[2025] - shares[2024]) * reimbursed:+,.0f} lives newly eligible")

    fund_per_life = PART_B[2025] * 12 * FUND_SHARE
    eligible = reimbursed * shares[2025]
    print(f"\n2025 eligible reimbursed lives ≈ {eligible:,.0f}; fund pays ${fund_per_life:,.0f}/yr each")
    for label, u in zip(("low", "base", "high"), UNENROLLED):
        leak = eligible * u * fund_per_life
        print(f"  {label}: unenrolled {u:.0%} → 2025 leakage ${leak / 1e6:,.1f}M/yr "
              f"(members lose the same)")
    print("Captured savings (what Axolotl would have moved in a year):")
    for label, u, c in zip(("low", "base", "high"), UNENROLLED, CAPTURE):
        moved = eligible * u * c
        print(f"  {label}: {moved:,.0f} enrollments → fund saves ${moved * fund_per_life / 1e6:,.1f}M/yr; "
              f"fees at $300 ${moved * 300 / 1e6:,.2f}M")


if __name__ == "__main__":
    main()

"""Rank New York funds for the Part B / MSP wedge.

    python -m research.ny_fund_targets.rank      (from archive/)

Combines three things already in the repo:
- retirees receiving a pension and the average benefit paid, per fund
  (pension_plans.csv, from DOL Form 5500 via build_list.py);
- the share of New Yorkers 65+ under the MSP line by pension size and the
  take-up assumption (tools/site/msp-ny.json, the website calculator's numbers);
- what each fund pays toward Part B, from the sourced fund notes (FUNDS below).

"Likely missing" = retirees x share under the line x share not yet enrolled,
using the fund's AVERAGE benefit to pick the pension band. That is a screening
estimate: averages hide the spread, retirees of national funds do not all live
in New York, and the PUMS shares are for all New Yorkers with that pension.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
SITE = HERE.parents[2] / "tools" / "site" / "msp-ny.json"

# pension plan name in pension_plans.csv -> (short name, what the fund pays toward
# the Part B premium per retiree per month, who decides / note, source note)
FUNDS = {
    "1199SEIU HEALTH CARE EMPLOYEES PENSION FUND": (
        "1199SEIU National Benefit Fund (hospital & nursing home)", 0.5, "50% of standard Part B for Wage Class I/II retirees (generally 10+ yrs) and spouses; NYC government retirees excluded", "funds_1199.md 4-11"),
    "1199SEIU HOME CARE EMPLOYEES PENSION FUND": (
        "1199SEIU Home Care", 0.0, "no retiree health (Home Care Benefit Fund SPD 2025)", "funds_1199.md 19"),
    "LEGACY PLAN OF THE NATIONAL RETIREMENT FUND": (
        "National Retirement Fund (Workers United), Legacy", 0.0, "national fund; closed Local 15 Part B-equal pension supplement only", "funds_industrial.md"),
    "THE RETIREMENT PLAN OF THE AMALGAMATED INSURANCE FUND": (
        "Amalgamated Insurance Fund retirement plan", 0.0, "national; no Part B payment found", "funds_industrial.md"),
    "THE LEGACY PLAN OF THE UNITE HERE RETIREMENT FUND": (
        "UNITE HERE Retirement Fund, Legacy", 0.0, "14 states; closed Local 15 supplement only", "funds_industrial.md"),
    "BUILDING SERVICE 32BJ PENSION FUND": (
        "32BJ", 0.0, "retiree health 62 to 65 only", "funds_service.md"),
    "NEW YORK HOTEL TRADES COUNCIL AND HOTEL ASSOCIATION OF NEW YORK CITY, INC. PENSION FUND": (
        "Hotel Trades Council", 0.0, "post-65 coverage via Health Centers; retiree pays Part B; Part D rule risk", "funds_service.md"),
    "I. A. T. S. E. NATIONAL PENSION FUND": (
        "IATSE National (H&W pays $240/quarter toward Part B)", 80 / 202.90, "national; flat $80/mo toward Part B", "funds_trades.md"),
    "EMPLOYEES SECURITY FUND OF THE ELEC IND PENSION PLAN": (
        "JIB Employees Security Fund (IBEW Local 3 M&S)", 0.0, "drug/dental/optical only", "funds_trades.md"),
    "DC 37 LOCAL 389 HOME CARE EMPLOYEES PENSION FUND": (
        "DC 37 Local 389 Home Care", 0.0, "no retiree health found; critical status", "funds_service.md"),
    "LOCAL 1102 RETIREMENT TRUST": (
        "Local 1102", 0.0, "no retiree health found", "funds_service.md"),
    "UFCW LOCAL ONE PENSION FUND": ("UFCW Local One", 0.0, "retiree benefit ends at 65", "funds_service.md"),
    "UFCW LOCAL 1500 PENSION PLAN": ("UFCW Local 1500", 0.0, "not found", "funds_service.md"),
    "IUE-CWA PENSION PLAN": ("IUE-CWA", 0.0, "national; not found", "funds_industrial.md"),
    "DIVISION 1181 ATU - NY EMPLOYEES PENSION FUND AND PLAN": (
        "ATU Division 1181 (school bus)", 0.0, "fund pays Part B deductible + 20%, not the premium", "funds_trades.md"),
    "32BJ NORTH PENSION FUND": ("32BJ North", 0.0, "see 32BJ", "funds_service.md"),
    "32BJ SCHOOL WORKERS PENSION FUND": ("32BJ School Workers", 0.0, "see 32BJ", "funds_service.md"),
    "LAUNDRY, DRY CLEANING WORKERS & ALLIED INDUSTRIES RETIREMENT FUND, WORKERS UNITED": (
        "Laundry Workers (Workers United)", 0.0, "not found", "funds_industrial.md"),
}


def band(avg: float) -> str:
    if avg < 500:
        return "under_500"
    if avg < 1000:
        return "500_999"
    if avg < 1500:
        return "1000_1499"
    if avg < 2000:
        return "1500_1999"
    return "2000_plus"


def main() -> None:
    est = json.loads(SITE.read_text())
    year = est["values"]["part_b_premium_monthly"] * 12
    shares = est["estimates"]["eligible_share_by_pension"]
    a = est["estimates"]["take_up_among_eligible"]["middle"]
    out = []
    for r in csv.DictReader((HERE / "pension_plans.csv").open()):
        if r["plan_name"] not in FUNDS:
            continue
        name, reimb, note, src = FUNDS[r["plan_name"]]
        retirees = int(r["retirees_receiving"])
        avg = float(r["avg_monthly_benefit"] or 0)
        e = shares[band(avg)]["share"]
        missing = retirees * e * (1 - a) / (1 - e * a)
        out.append({
            "fund": name, "retirees": retirees, "avg_benefit": round(avg), "band": band(avg),
            "likely_missing": round(missing), "unclaimed_per_year": round(missing * year),
            "fund_pays_share_of_part_b": round(reimb, 2), "fund_saving_ceiling": round(missing * year * reimb),
            "note": note, "source": src,
        })
    out.sort(key=lambda x: (-x["fund_saving_ceiling"], -x["unclaimed_per_year"]))
    with (HERE / "targets.csv").open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(out[0]))
        w.writeheader()
        w.writerows(out)
    for x in out:
        print(f"{x['fund'][:52]:52} {x['retirees']:>7,} ${x['avg_benefit']:>5,} {x['likely_missing']:>6,} "
              f"${x['unclaimed_per_year']:>12,} ${x['fund_saving_ceiling']:>11,}")


if __name__ == "__main__":
    main()

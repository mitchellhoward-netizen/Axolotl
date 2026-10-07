"""New York multiemployer funds from the Department of Labor's Form 5500 data.

    python -m research.ny_fund_targets.build_list      (from archive/)

Downloads EBSA's public Form 5500 and Schedule H datasets (filing years 2024
and 2025, "Latest" files; https://www.askebsa.dol.gov/FOIA%20Files/) into the
gitignored .cache/, keeps multiemployer plans (Part I line A = 1) whose sponsor
mailing or location address is in New York, and writes:

- pension_plans.csv: defined-benefit plans (pension feature codes 1x) with
  retirees and beneficiaries receiving benefits, and an average monthly
  benefit = Schedule H line 2e(1) benefits paid directly to participants
  / (retirees receiving + beneficiaries receiving) / 12;
- health_plans.csv: health plans (welfare feature code 4A) with participants.

The average benefit is a screening number, not a pension: it mixes retirees,
beneficiaries, disability pensioners and any lump sums, and it covers the
whole plan, not only New Yorkers. Use it to rank funds, then check the fund.
Each row keeps the latest filing for its EIN and plan number.
"""

from __future__ import annotations

import csv
import io
import urllib.request
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
CACHE = HERE.parents[2] / ".cache" / "form5500"
BASE = "https://www.askebsa.dol.gov/FOIA%20Files/{y}/Latest/{name}_{y}_Latest.zip"
YEARS = (2024, 2025)


def fetch(name: str, year: int) -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{name}_{year}.zip"
    if not path.exists():
        req = urllib.request.Request(BASE.format(y=year, name=name), headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=300) as r:
            path.write_bytes(r.read())
    return path


def rows(name: str, year: int):
    with zipfile.ZipFile(fetch(name, year)) as z:
        member = next(n for n in z.namelist() if n.lower().endswith(".csv"))
        with z.open(member) as fh:
            yield from csv.DictReader(io.TextIOWrapper(fh, encoding="latin-1"))


def num(v: str) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def main() -> None:
    plans: dict[tuple[str, str], dict] = {}
    for year in YEARS:
        for r in rows("F_5500", year):
            if r["TYPE_PLAN_ENTITY_CD"] != "1":
                continue
            if "NY" not in (r["SPONS_DFE_MAIL_US_STATE"], r["SPONS_DFE_LOC_US_STATE"]):
                continue
            key = (r["SPONS_DFE_EIN"], r["SPONS_DFE_PN"])
            prev = plans.get(key)
            if prev is None or r["FORM_PLAN_YEAR_BEGIN_DATE"] >= prev["FORM_PLAN_YEAR_BEGIN_DATE"]:
                r["_year"] = year
                plans[key] = r

    paid: dict[str, float] = {}
    for year in YEARS:
        for h in rows("F_SCH_H", year):
            paid[h["ACK_ID"]] = num(h["DISTRIB_DRT_PARTCP_AMT"])

    pension, health = [], []
    for (ein, pn), r in plans.items():
        common = {
            "plan_name": r["PLAN_NAME"].strip(),
            "sponsor": r["SPONSOR_DFE_NAME"].strip(),
            "ein": ein, "pn": pn,
            "plan_year_begin": r["FORM_PLAN_YEAR_BEGIN_DATE"],
            "city": r["SPONS_DFE_MAIL_US_CITY"] if "SPONS_DFE_MAIL_US_CITY" in r else "",
            "administrator": (r["ADMIN_NAME"] or "").strip(),
            "admin_phone": r["ADMIN_PHONE_NUM"],
            "participants_boy": int(num(r["TOT_PARTCP_BOY_CNT"])),
            "active": int(num(r["TOT_ACTIVE_PARTCP_CNT"])),
            "ack_id": r["ACK_ID"],
        }
        codes = r["TYPE_PENSION_BNFT_CODE"] or ""
        if any(codes[i:i + 2].startswith("1") for i in range(0, len(codes), 2)):
            retirees = int(num(r["RTD_SEP_PARTCP_RCVG_CNT"]))
            benef = int(num(r["BENEF_RCVG_BNFT_CNT"]))
            amount = paid.get(r["ACK_ID"], 0.0)
            receiving = retirees + benef
            pension.append({**common, "retirees_receiving": retirees, "beneficiaries_receiving": benef,
                            "benefits_paid": round(amount),
                            "avg_monthly_benefit": round(amount / receiving / 12) if receiving and amount else ""})
        if "4A" in [(r["TYPE_WELFARE_BNFT_CODE"] or "")[i:i + 2] for i in range(0, 40, 2)]:
            health.append(common)

    pension.sort(key=lambda p: -p["retirees_receiving"])
    health.sort(key=lambda p: -p["participants_boy"])
    for name, data in (("pension_plans.csv", pension), ("health_plans.csv", health)):
        with (HERE / name).open("w", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=list(data[0]))
            w.writeheader()
            w.writerows(data)
        print(f"wrote {name}: {len(data)} plans")


if __name__ == "__main__":
    main()

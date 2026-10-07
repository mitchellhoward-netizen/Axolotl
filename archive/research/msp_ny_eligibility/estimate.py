"""How many New Yorkers 65+ on Medicare fall under the MSP income line, by pension size.

    python research/msp_ny_eligibility/estimate.py            # downloads the PUMS file (~37 MB) to a temp dir
    python research/msp_ny_eligibility/estimate.py --csv PATH # use an already-downloaded psam_p36.csv

Data: U.S. Census Bureau, American Community Survey 2024 1-year Public Use
Microdata Sample, New York persons (psam_p36.csv), downloaded from
https://www2.census.gov/programs-surveys/acs/data/pums/2024/1-Year/csv_pny.zip

Method (mirrors the archive's New York MSP evaluator, playbooks/msp/states/ny):
- Universe: people aged 65+ who report Medicare (HINS3 = 1).
- Countable monthly income: Social Security (SSP) + retirement income (RETP)
  + interest/dividends/rent (INTP, if positive) + other income (OIP), minus the
  $20 disregard; plus wages and self-employment minus $65 and one-half.
  SSI and public assistance are not counted. Incomes are put in 2024 dollars
  with ADJINC.
- A married person living with a spouse (householder + spouse) is budgeted as
  a couple: both spouses' income against the two-person line.
- The line is 186% of the 2024 HHS poverty guideline ($15,060 / $20,440;
  Federal Register 2024-00796), the same percentage New York uses for QI in
  2026. Using 2024 incomes against the 2024 line keeps the ratio consistent.
- Pension band = the person's own monthly retirement income (RETP), which
  includes every pension and retirement-account withdrawal, not only the
  fund's pension.
- Margins of error: 90%, from the 80 replicate weights (successive difference
  replication, as the Census Bureau documents for PUMS).

Known limits, stated on the website:
- Surveys under-report retirement income somewhat (O'Hara & Bee 2016 found
  ~87% agreement between ACS and IRS 1099-R pension records), so these shares
  lean high.
- Health insurance premiums and other New York deductions are not in the data,
  which leans the other way.
- It cannot tell who is already enrolled in an MSP.
"""

from __future__ import annotations

import argparse
import collections
import csv
import io
import json
import math
import sys
import tempfile
import urllib.request
import zipfile
from datetime import date
from pathlib import Path

URL = "https://www2.census.gov/programs-surveys/acs/data/pums/2024/1-Year/csv_pny.zip"
FPL_2024 = {1: 15060, 2: 20440}
LINE_PCT = 186
REPLICATES = 80
BANDS = [("under_500", 0.01, 500), ("500_999", 500, 1000), ("1000_1499", 1000, 1500),
         ("1500_1999", 1500, 2000), ("2000_plus", 2000, float("inf"))]
OUT = Path(__file__).resolve().parent / "estimates.json"


def _rows(csv_path: Path | None):
    if csv_path:
        with open(csv_path, newline="") as f:
            yield from csv.DictReader(f)
        return
    with tempfile.TemporaryDirectory() as d:
        z = Path(d) / "pny.zip"
        urllib.request.urlretrieve(URL, z)
        with zipfile.ZipFile(z) as zf, zf.open("psam_p36.csv") as f:
            yield from csv.DictReader(io.TextIOWrapper(f, newline=""))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", type=Path)
    args = ap.parse_args(argv)
    num = lambda x: float(x) if x not in ("", None) else 0.0
    households = collections.defaultdict(list)
    for row in _rows(args.csv):
        adj = num(row["ADJINC"]) / 1e6
        g = lambda k: num(row[k]) * adj / 12
        p = {"rel": row["RELSHIPP"], "age": int(row["AGEP"]), "medicare": row["HINS3"] == "1",
             "w": [int(row["PWGTP"])] + [int(row[f"PWGTP{i}"]) for i in range(1, REPLICATES + 1)],
             "retp": g("RETP")}
        p["unearned"] = g("SSP") + p["retp"] + max(0.0, g("INTP")) + g("OIP")
        p["earned"] = max(0.0, g("WAGP") + g("SEMP"))
        households[row["SERIALNO"]].append(p)

    def countable(u, e):
        return max(0.0, u - 20) + max(0.0, e - max(0.0, 20 - u) - 65) / 2

    def band(x):
        if x <= 0:
            return "no_pension"
        return next(n for n, lo, hi in BANDS if lo <= x < hi)

    tot = collections.defaultdict(lambda: [0.0] * (REPLICATES + 1))
    under = collections.defaultdict(lambda: [0.0] * (REPLICATES + 1))
    rows = collections.Counter()
    for members in households.values():
        ref = [m for m in members if m["rel"] == "20"]
        sp = [m for m in members if m["rel"] in ("21", "23")]
        pair = (ref[0], sp[0]) if ref and sp else None
        for m in members:
            if m["age"] < 65 or not m["medicare"]:
                continue
            if pair and (m is pair[0] or m is pair[1]):
                size, c = 2, countable(pair[0]["unearned"] + pair[1]["unearned"], pair[0]["earned"] + pair[1]["earned"])
            else:
                size, c = 1, countable(m["unearned"], m["earned"])
            ok = c <= FPL_2024[size] * LINE_PCT / 100 / 12
            for key in ("all", "with_pension" if m["retp"] > 0 else "no_pension_all", band(m["retp"])):
                rows[key] += 1
                for i in range(REPLICATES + 1):
                    tot[key][i] += m["w"][i]
                    under[key][i] += m["w"][i] if ok else 0.0

    out = {"source": "ACS 2024 1-year PUMS, New York (psam_p36.csv)", "url": URL, "computed": date.today().isoformat(),
           "line": f"{LINE_PCT}% of the 2024 HHS poverty guideline", "universe": "New Yorkers 65+ reporting Medicare",
           "groups": {}}
    for key in ["all", "with_pension", "no_pension_all"] + [b[0] for b in BANDS]:
        th = [under[key][i] / tot[key][i] for i in range(REPLICATES + 1)]
        se = math.sqrt(4 / REPLICATES * sum((th[i] - th[0]) ** 2 for i in range(1, REPLICATES + 1)))
        out["groups"][key] = {"share_under_line": round(th[0], 4), "moe90": round(1.645 * se, 4),
                              "people": round(tot[key][0]), "sample_rows": rows[key]}
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    for k, v in out["groups"].items():
        print(f"{k:16} {100 * v['share_under_line']:5.1f}% ± {100 * v['moe90']:.1f}  ({v['people']:,} people, {v['sample_rows']} rows)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

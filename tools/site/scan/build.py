"""Build the district scan dataset for the homepage picker.

Inputs (public, California Department of Education):
  chrabs<yy>_district.psv   district-level chronic absenteeism, all students,
                            non-charter, from chronicabsenteeism<yy>-v2.txt
  lcffsummary<yy>.xlsx      LCFF Summary Data (AN R1 sheet): funded ADA, UPP,
                            base/supplemental/concentration grants, state aid

Output:
  public/scan-data.json     one record per district with the filing numbers and
                            the conservative recovery arithmetic the page shows

Every number the page shows is either read from a filing (marked in the record)
or derived from the three assumptions at the top of this file, which the page
states next to the figure. Keep the assumptions conservative: the point is a
number a CBO can argue up, not down.
"""
import json, sys
from pathlib import Path
import openpyxl

HERE = Path(__file__).parent
ROOT = HERE.parent.parent.parent
YEAR = "2024-25"

# ---- assumptions (the page prints these) -------------------------------------
REACH = 0.25          # share of chronically absent students whose family the helper reaches
DAYS = 3              # additional days of attendance per reached student, per year
UNCOUNTED = 0.005     # share of enrollment that is eligible but not counted as unduplicated
SCHOOL_DAYS = 180

def load_absent(path):
    out = {}
    for line in path.read_text().splitlines():
        cds, county, name, cat, enroll, count, rate = line.split("|")
        if cat != "TA" or enroll == "*" or count == "*":
            continue
        out[cds] = dict(county=county, name=name, enrollment=int(enroll),
                        absent=int(count), rate=float(rate))
    return out

def load_lcff(path):
    wb = openpyxl.load_workbook(path, read_only=True)
    ws = wb[[n for n in wb.sheetnames if "ANR1" in n][0]]
    out = {}
    for r in ws.iter_rows(min_row=7, values_only=True):
        if r[0] is None or r[2] != "0000000":
            continue
        cds = f"{r[0]}{r[1]}"
        ada = r[9] or 0
        if not ada:
            continue
        out[cds] = dict(
            ada=float(ada), upp=float(r[10] or 0),
            base=float(r[11] or 0), supp=float(r[12] or 0), conc=float(r[13] or 0),
            entitlement=float(r[15] or 0), local=float(r[16] or 0),
            state_aid=float(r[18] or 0) + float(r[19] or 0),
        )
    return out

def model(a, l):
    per_ada = (l["base"] + l["supp"] + l["conc"]) / l["ada"]
    per_day = per_ada / SCHOOL_DAYS
    base_per_ada = l["base"] / l["ada"]
    # Basic aid: local property tax covers the whole entitlement, so another
    # day of attendance or another counted student brings no new state money.
    basic_aid = l["local"] >= l["entitlement"]
    reached = round(a["absent"] * REACH)
    days = reached * DAYS
    attendance = 0 if basic_aid else days * per_day
    uncounted = round(a["enrollment"] * UNCOUNTED)
    # one more unduplicated pupil raises UPP by 1/enrollment; the grant is paid
    # on ADA, so the marginal value is base × factor × ADA/enrollment
    factor = 0.20 + (0.65 if l["upp"] > 0.55 else 0)
    per_counted = base_per_ada * factor * (l["ada"] / a["enrollment"])
    counting = 0 if basic_aid else uncounted * per_counted
    per_point = 0 if basic_aid else l["ada"] * 0.01 * per_ada
    return dict(
        basic_aid=basic_aid, per_day=per_day, per_counted=per_counted,
        reached=reached, days=days, attendance=attendance,
        uncounted=uncounted, counting=counting, total=attendance + counting,
        per_point=per_point,
    )

def main():
    absent = load_absent(HERE / "chrabs2425_district.psv")
    lcff = load_lcff(HERE / "lcffsummary2425.xlsx")
    records = []
    for cds, a in absent.items():
        l = lcff.get(cds)
        if not l or "County Office" in a["name"] or a["enrollment"] < 300:
            continue
        m = model(a, l)
        records.append(dict(
            id=cds, name=a["name"], county=a["county"],
            filed=dict(enrollment=a["enrollment"], absent=a["absent"], rate=a["rate"],
                       ada=round(l["ada"]), upp=round(l["upp"] * 100, 1),
                       lcff=round(l["base"] + l["supp"] + l["conc"])),
            basic_aid=m["basic_aid"],
            per_day=round(m["per_day"]), per_counted=round(m["per_counted"]),
            reached=m["reached"], days=m["days"], uncounted=m["uncounted"],
            attendance=round(m["attendance"]), counting=round(m["counting"]),
            total=round(m["total"]), per_point=round(m["per_point"]),
        ))
    records.sort(key=lambda r: r["name"])
    # The page recomputes the arithmetic from the filed numbers and the
    # assumptions, so each district ships as a compact row:
    # [id, name, county, enrollment, absent, rate, $/day, $/counted student, $/point, basic aid]
    rows = [[r["id"], r["name"], r["county"], r["filed"]["enrollment"], r["filed"]["absent"],
             r["filed"]["rate"], r["per_day"], r["per_counted"], r["per_point"], 1 if r["basic_aid"] else 0]
            for r in records]
    out = dict(year=YEAR, assumptions=dict(reach=REACH, days=DAYS, uncounted=UNCOUNTED,
               school_days=SCHOOL_DAYS), districts=rows)
    (ROOT / "public" / "scan-data.json").write_text(json.dumps(out, separators=(",", ":")))
    print(f"{len(records)} districts written")
    if "--rank" in sys.argv:
        print("\nTop 25 by recoverable dollars")
        for r in sorted(records, key=lambda r: -r["total"])[:25]:
            print(f"  {r['total']/1e6:6.1f}M  {r['name']:<40} {r['county']:<16} enr {r['filed']['enrollment']:>6}  abs {r['filed']['rate']:>5}%  upp {r['filed']['upp']:>5}%")
        print("\nTop 25 by dollars per chronically absent student (enrollment ≥ 5,000)")
        big = [r for r in records if r["filed"]["enrollment"] >= 5000 and not r["basic_aid"]]
        for r in sorted(big, key=lambda r: -r["total"] / r["filed"]["absent"])[:25]:
            print(f"  ${r['total']/r['filed']['absent']:>6,.0f}  {r['name']:<40} {r['county']:<16} enr {r['filed']['enrollment']:>6}  abs {r['filed']['rate']:>5}%  upp {r['filed']['upp']:>5}%  total {r['total']/1e6:.1f}M")
        print("\nTop 25 mid-size (10–40K enrollment) by recoverable dollars")
        mid = [r for r in records if 10000 <= r["filed"]["enrollment"] <= 40000 and not r["basic_aid"]]
        for r in sorted(mid, key=lambda r: -r["total"])[:25]:
            print(f"  {r['total']/1e6:6.1f}M  {r['name']:<40} {r['county']:<16} enr {r['filed']['enrollment']:>6}  abs {r['filed']['rate']:>5}%  upp {r['filed']['upp']:>5}%")
        ba = [r for r in records if r["basic_aid"]]
        print(f"\n{len(ba)} basic-aid districts (attendance moves no state money), e.g. " + ", ".join(r["name"] for r in sorted(ba, key=lambda r: -r['filed']['enrollment'])[:8]))
        for n in ("Pajaro Valley Unified", "Oakland Unified", "Fresno Unified", "Santa Cruz City Schools", "Los Angeles Unified"):
            r = next((r for r in records if r["name"] == n), None)
            if r: print(f"\n{n}: reach {r['reached']} of {r['filed']['absent']}, {r['days']} days × ${r['per_day']} = ${r['attendance']:,}; {r['uncounted']} counted × ${r['per_counted']:,} = ${r['counting']:,}; total ${r['total']:,}; per point ${r['per_point']:,}")

if __name__ == "__main__":
    main()

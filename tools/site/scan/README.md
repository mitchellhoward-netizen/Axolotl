# District scan data

`public/scan-data.json` powers the district picker on the homepage. Rebuild it with

```sh
npm run build:scan
```

Sources, both public from the California Department of Education:

- `chrabs2425_district.psv` — district-level, all-students, non-charter rows from
  `https://www3.cde.ca.gov/demo-downloads/attendance/chronicabsenteeism25-v2.txt`
  (33 MB; fields kept: CDS code, county, district, category, eligible enrollment,
  chronically absent count, rate).
- `chrabs2425_charter.psv` — school-level rows for charter schools (Charter =
  Yes, DASS = No, all students) from the same file.
- `lcffsummary2425.xlsx` — LCFF Summary Data, first annual recertification, from
  `https://www.cde.ca.gov/fg/aa/pa/documents/lcffsummary2425.xlsx` (funded ADA,
  unduplicated pupil percentage, base/supplemental/concentration grants, local
  revenue, state aid). Districts and charters both.
- `lcffsummary2324.xlsx` — the prior year, for the funded-ADA trend. LCFF pays
  the greater of current, prior and three-year-average ADA; we don't have
  current-year ADA, so a district whose funded ADA fell is flagged as *likely*
  paid on last year or the average (the gain arrives a year late). Charters are
  paid on current-year ADA by rule.

The model and its three assumptions are at the top of `build.py`; the page
prints the assumptions next to the figure, so change them in one place only.
Districts whose local property tax covers their whole LCFF entitlement (basic
aid) are flagged and shown as $0, because attendance does not move their state
money. `python3 tools/site/scan/build.py --rank` prints the rankings used to pick
target districts.

Refresh each year when CDE posts the new absenteeism file (autumn) and the
annual LCFF recertification (summer).

# Replica districts: Pajaro Valley, San Bernardino City, Palm Springs

**Chosen 2026-10-16.** Mitch picked Pajaro Valley. The other two were picked as good ICP: high
chronic absence, high unduplicated share, CEP everywhere (so an income form is the form that
matters), not basic aid. **Each one returns its income form through a different channel**, so
together the three replicas cover the lanes in `PATHWAYS.md` §2.1.

Numbers come from `public/scan-data.json` and the model in `tools/site/scan/build.py` (2024-25
CDE data). Form details were read from each district's own pages on 2026-10-16. "Not verified"
means nobody has seen it yet.

| | **Pajaro Valley USD** (replica 1) | **San Bernardino City USD** | **Palm Springs USD** |
|---|---|---|---|
| CDS | 4469799 | 3667876 | 3367173 |
| County | Santa Cruz | San Bernardino | Riverside |
| Enrollment | 15,311 | 46,581 | 19,935 |
| Chronic absence | 25.2% | 29.6% | 29.5% |
| Unduplicated | 82.7% | 92.4% | 96.5% |
| Scan total (attendance + count) | $0.95M ($0.24M + $0.70M) | $2.92M ($0.92M + $2.00M) | $1.28M ($0.40M + $0.87M) |
| CEP | All students free, no application needed (the site never says "CEP": not verified) | All sites CEP for 2026-27 (Nutrition Director's letter, July 1, 2026) | CEP for all students; 2026-27 site list posted |
| The form | **Universal Benefits Application 2026**, the district's own, branded SUN Bucks | **Alternative Household Income Form 2026** ("Income Survey"), the district's own | **LINQ Connect "Income Form"** (an alternative income form), plus a separate LINQ UBA for SUN Bucks |
| Kind (lane) | **Flat PDF, image only** (Canva; no text layer, no fields). Printed and returned on paper → lane C/F | **Inside ParentSquare, login required** (plus paper and a QR code) → lane D | **Public vendor web form, no login** (Angular app behind AWS WAF; reCAPTCHA not verified) → lane A/B |
| Counts for LCFF? | Yes (UBA is accepted alongside the AIF templates) | Yes | Yes |
| Gets SUN Bucks? | **Yes** (it is a UBA) | **No** (an AIF) | Income Form **no**; the separate LINQ UBA **yes** |
| Confirmation | None printed. Paper → only the school's record or a notice | Not verified (ParentSquare submission state) | **Yes:** "Your reference code is…" |
| Languages | English, Spanish (pages 3-4) | English, Spanish | LINQ offers 11; which this district enabled: not verified |
| District deadline | Printed "8/31/26" (the SUN Bucks date); Oct 31 still applies for LCFF | Oct 1, 2026 (passed; Oct 31 LCFF still applies) | Not stated |
| URL | [UBA PDF](https://docs.isitesoftware.com/snaf-assets%2Fdistrict%2Fpajarovalleyusd%2Ffiles%2FUBA-SUNBUCKS%20(2)%20(2).pdf) · pvusdschoolfood.net | [ParentSquare post](https://www.parentsquare.com/feeds/80437834) · [flyer](https://docs.isitesoftware.com/snaf-assets%2Fdistrict%2Fsanbernardinocsd%2Ffiles%2FIncome%20Survey%2F2026-2027%2FLCFF2026_Flyer-ENG.pdf) | [Income Form](https://linqconnect.com/public/income-form/new?identifier=KCZ8JY) via [psusd.us](https://www.psusd.us/departments/n/nutrition-and-wellness/sun-bucks-alternate-income-form) |

**Why these two.** San Bernardino City has the biggest dollar figure among mid-to-large districts
with high absence after LAUSD and Fresno, every site on CEP, and it tells every family to fill the
survey. It also tests a logged-in family-messaging portal (ParentSquare, which Fresno and
Stockton use too). Palm Springs has the highest unduplicated share on the shortlist (96.5%) and a
public vendor form with a reference code. LINQ Connect is used across California (Oakland's
meal application runs on it), so one replica carries over to many districts. Both are Inland
Empire; Fresno Unified is the swap for more spread.

**Runners-up.** Fresno Unified ($4.43M; "Confidential Family Survey" by personal link only; fields
not verified). Oakland ($2.15M; LCFF questions inside the Aeries portal's data confirmation).
Stockton ($2.11M; its form's host doesn't resolve). Twin Rivers ($1.46M; RocketScan UBA, closed now).

---

## Replica 1: Pajaro Valley UBA 2026 (read from the form itself)

Two pages in English, two in Spanish. Letter landscape.

**Header:** "BEFORE SUBMITTING, CALL FOOD & NUTRITION SERVICES AT 831-786-2325. YOUR CHILD MAY
ALREADY QUALIFY WITHOUT APPLYING." "It does not affect your child's free school meals or
immigration status. Health, food, and housing services are not considered part of public
charge. You may ask someone outside your household to help you complete it."

**1. Students living with you (5 rows):** last name, first name, MI; **Foster / Homeless /
Migrant** checkboxes; date of birth; school; grade; student monthly income ($) with how often
(weekly, bi-weekly, 2x monthly, monthly).

**2. Case number:** one line, "If any member of your household currently participates in
TANF / SNAP / MEDICAID".

**3. All other household members (5 rows):** last name, first name, MI; three incomes, each in
whole dollars with how often: earnings from work (before deductions); public assistance, child
support, alimony; other income (pensions, retirement, Social Security).

**Certification (the parent's, never ours):** "I certify (promise) that all information on this
application is true, that all income is reported, and that no one included on this application
is receiving Summer EBT in another state or from another agency…" Then: adult household member
signature, date, printed name, email, street address, city/state/ZIP, phone.

**Page 2:** the income guidelines (printed for July 1, 2025 to June 30, 2026, last year's; we
grade with the archive's current ones); optional ethnicity and race ("does not affect
eligibility"); the Russell Act notice ("We may share your eligibility information with
education, health, and nutrition programs", with no checkbox); "Incomplete forms will delay
processing"; and a school-use block (total income, household size, status) we never fill.

**No household-size field and no SSN.** Household size is the rows counted.

### What it means for the pathway

- **Ask before filing.** The form says to call first because the child may already qualify (direct
  certification). The pathway checks that first: CalFresh, CalWORKs or Medi-Cal in the household,
  or foster, homeless or migrant, means the helper says "you're likely already covered" and
  offers to confirm with the office instead of filing. The archive already knows these rules.
- **Lane C/F.** The PDF has no fields, so the helper fills it by drawing the values onto the
  page images (an overlay map per field), shows the parent the filled pages, and the parent signs.
  **How the district accepts it is not verified:** paper at the school is certain; email or a
  photo to Food & Nutrition Services (831-786-2325) needs a call. Until then "done" is "sent, not
  confirmed".
- **What the agent must get right on this form:** every student (DOB, school, grade, and the
  foster/homeless/migrant boxes, which are sensitive and only ever from the parent or district);
  every other household member by name; each income in whole dollars with the right frequency;
  the case number if there is one; nothing on page 2's school-use block; the signature left to
  the parent.

## Replica 2: San Bernardino City Alternative Household Income Form 2026

From the district's ParentSquare post (the form itself needs a login): student (picked from the
account's children), student ID, grade, class, school; total household members; **monthly
household income from listed ranges** (not itemized); parent or guardian name, email, phone;
signature and date. "Only data totals are used." **Not verified:** SSN, case number, foster/
homeless boxes, consent to share, which fields are required. The replica needs a real look at
the form; a family in the district (or the district) can show it.

## Replica 3: Palm Springs LINQ Connect Income Form

From LINQ's public label bundle (Palm Springs' own configuration returns 401, so **not
verified**): students (first, last, date of birth required, student ID required, school, grade
required; "Add Student"); household size, checked against the students entered; "Select your
Annual Income Range" or "Total Household Income" (which one Palm Springs uses: not verified);
optional case number; the adult completing it (must match a household member); the required
certification ("…the school may receive state and federal funds based on the information I
provide…"); **a reference code on submit**. The separate LINQ UBA adds the SUN Bucks pieces: a
required "I have read the statement" box, foster/homeless/migrant/runaway, income by member and
source, address and contact, the Summer EBT certification, and an **opt-out box** ("I do not
wish to receive Summer EBT benefits").

## Open questions

1. Pajaro: does Food & Nutrition Services accept the UBA by email or photo, or only on paper?
2. Pajaro: CEP status, stated.
3. San Bernardino: the form's actual fields (needs someone with a ParentSquare login there).
4. Palm Springs: income range or total, and the enabled languages.
5. SUN Bucks summer 2027: rules and deadline, when CDSS publishes them.

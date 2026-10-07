# National fund targets: batch 2 results (30 plans)

Researched 2026-10-07. Source list: `batch_2.csv` (DOL Form 5500 multiemployer health plans; `non_active` is a rough proxy for retirees).

**Method and limits.** Fund websites and their plan documents were fetched directly and searched for "Part B", "Medicare premium", "reimburse" and "HRA". Labels: **verified** means the text was read in the fund's own document or website. **secondary** means another source, such as the union, CBA text or ProPublica. **inferred** means a reasoned guess with no direct quote. The shared web-search budget ran out partway through this batch, so the plans without a findable fund website are marked `unknown` after domain probing and direct fetches. They were not checked with a full search. They are worth a second pass with search, or a phone call to the fund office.

## Summary

- **No plan in this batch has general Part B premium reimbursement (full, partial or flat) for its Medicare retirees.** That is 0 of 30.
- **3 plans have an HRA-type route to Part B.** All three are weaker than a premium benefit:
  - **Bakery & Confectionery Union & Industry International Health Benefits Fund (MD, 14,277 non-active).** The legacy P-Plan HRA explicitly reimburses "Premiums ... for Medicare Part B or Part D". It is closed to new money: only people who retired before 2017-01-01 and chose the HRA have balances. Verified.
  - **Gene Upshaw NFL Player HRA Plan (MD, 9,363 non-active).** The account reimburses medical expenses, and the NFLPA says "Insurance premiums are eligible as well". Medicare or Part B is not named. Secondary.
  - **Southern California IBEW-NECA Health Trust Fund (CA, 1,483 non-active).** HRA balances built up while working can be used in retirement for IRC §213 expenses. The SPD names retiree self-pay premiums, but not Part B. Verified (weak).
- **1 narrow Part B premium reimbursement: The Bledsoe Health Trust (WA).** It reimburses Part B premiums only while a retiree is getting supplemental kidney dialysis (2018 Retiree SPD). This is not a general benefit.
- **2 plans explicitly do NOT pay Part B, verified:**
  - **IUOE Local 139 (WI).** "the HRA may not be used to pay for Medicare Part A or B coverage". Retiree self-payments are reimbursable "excluding reimbursement for Medicare Part B premium".
  - **Heavy & General Laborers 472/172 NJ.** Retirees "must enroll and pay the Medicare premiums and deductibles" (2026 notice).
- **Post-65 retiree coverage confirmed for 10 plans:**
  - St. Louis–KC Carpenters (UHC Medicare Advantage, retiree-paid, $287/mo in 2026)
  - Bakery & Confectionery (W-1 Medicare Advantage + Part D, retirees pay premiums)
  - SMART-TD (secondary: GA-23111 Plan F Medicare supplement)
  - Teamsters Benefit Trust (CRP/RSP/SRP/BRP retiree plans)
  - IUOE 139 (Medicare Advantage PPO; plan 502 is the insured MA plan itself)
  - HGL 472/172 (Medicare supplement, free with 20+ pension years)
  - American Maritime Officers (supplement that pays the 20% and the Part A/B deductibles)
  - SoCal IBEW-NECA (Kaiser Senior Advantage / Anthem Medicare Preferred)
  - Bledsoe (self-pay "over-65 rate")
  - Gene Upshaw HRA (an account, not coverage)
- **Unknown on Part B: 17 plans.** In most of these I could not reach a fund document: no findable public site, a login wall or a parked domain.
- **Notable for Mycelium:**
  1. **Bakery & Confectionery** is the only verified explicit "Part B premiums" reimbursement language in this batch. It is legacy and account-capped, so the fund's own savings from MSP enrollment would be small, but retirees with balances would save money.
  2. **NFL:** the bigger Medicare money sits outside this batch. The Former Player Life Improvement Plan pays a $160/mo Medicare Supplement/Advantage premium subsidy (rising to $200), which is not a Part B subsidy.
  3. **Funds that only coordinate with Medicare** (HGL, AMO, OE3 Pensioned) make retirees pay Part B themselves. MSP enrollment would help those *retirees* directly but would not save the *fund* money. They are a member-benefit pitch, not a savings pitch.
- **Existing MSP / Extra Help / Medicaid help:** none found in any document reviewed. The Bakery fund lists a "State Health Insurance Assistance Program Contact Listing" among its health documents, which is a SHIP referral only.

## Table

| plan_name | state | ein | non_active | retiree_health | part_b | part_b_detail (short) | label | url |
|---|---|---|---|---|---|---|---|---|
| THE SMART-TD HEALTH & WELFARE PLAN | VA | 800616629 | 73193 | post65 (secondary) | unknown | SMART-TD lists GA-23111 Plan F Medicare Supplement for retired TD (UTU) members; no Part B premium language found; unclear which rail plan this EIN is | secondary | https://www.smart-union.org/get-involved/retirees/ |
| ST. LOUIS-KANSAS CITY CARPENTERS REGIONAL HEALTH PLAN | MO | 431622970 | 17340 | post65 | none | Non-Active Medicare retirees must join the UHC Medicare Advantage program; "The Plan does not ... pay any part of its cost"; 2026 Medicare self-pay $287/mo | verified | https://laborfunds.org/wp-content/uploads/2025/05/2025-05-FINAL-Southern-Region-Benefit-Plan-SPD_web.pdf |
| BAKERY & CONFECTIONERY UNION & INDUSTRY INTERNATIONAL HEALTH BENEFITS FUND | MD | 530227042 | 14277 | post65 | hra | Legacy P-Plan HRA reimburses Medicare Part B/D premiums; only for those who retired before 1/1/2017 and chose HRA; W-1 Medicare Advantage retirees pay premiums | verified | https://www.bctrustfunds.org/the-funds/hb-1/ |
| 88 PLAN | MD | 113805565 | 11740 | none (not a health plan) | none | Reimburses dementia/ALS/Parkinson's care (in-patient/at-home) for former NFL players; no Medicare premium benefit | secondary | https://static.www.nfl.com/image/upload/v1613673951/league/k6mtb60spqbrqkwre6ui.pdf |
| GENE UPSHAW NFL PLAYER HEALTH REIMBURSEMENT ACCOUNT PLAN | MD | 113805568 | 9363 | hra (post-CV coverage) | hra | Account (up to $450k max) reimburses medical expenses; "Insurance premiums are eligible as well"; Part B not named | secondary | https://nflpa.com/former-players/faq/when-do-i-get-my-hra-benefits-and-what-is-eligible-for-reimbursement |
| NFL DEDICATED HOSPITAL NETWORK | NY | 133077470 | 8468 | none (no-cost care network) | none | Defined no-cost care (physicals, preventive, ortho, mental health) at designated hospitals for former players without Player Insurance Plan coverage | secondary | https://overthecap.com/collective-bargaining-agreement/article/58/section/4 |
| TEAMSTERS BENEFIT TRUST | CA | 942848389 | 7012 | post65 | unknown | Retiree plans BRP/CRP/RSP/SRP; retirees "must enroll in Medicare Parts A and B"; booklets "PDF coming soon"; no Part B premium language found | verified (coverage) | https://www.tbtfund.org/eligibility/ |
| RETIREE'S WELFARE TRUST | WA | 916065367 | 5832 | unknown | unknown | Seattle retiree trust (address 2323 Eastlake Ave E, same as Northwest Administrators); no public plan document found | secondary | https://projects.propublica.org/nonprofits/organizations/916065367 |
| SIDNEY HILLMAN HEALTH CENTER | NY | 160864443 | 4965 | unknown | unknown | "Sidney Hillman Health Center of Rochester" (ProPublica); no fund website found (sidneyhillman.org parked) | secondary | https://projects.propublica.org/nonprofits/organizations/160864443 |
| HEARTLAND HEALTH AND WELLNESS FUND | OH | 316173363 | 4471 | unknown | unknown | No fund website or document found | n/a | n/a |
| CARPENTERS & JOINERS WELFARE FUND | MN | 416024791 | 4078 | unknown | unknown | Administered by Wilson-McShane (Bloomington MN); site carpentersandjoinersbenefits.com is login-only | secondary | https://www.nmcarpenters.com/members/member-benefits |
| TEAMSTERS AND EMPLOYERS WELFARE TRUST OF ILLINOIS | MO | 366441012 | 3777 | unknown | unknown | No fund website or document found | n/a | n/a |
| OPERATING ENGINEERS LOCAL 139 HEALTH BEN FUND MEDICARE PREFERRED(PPO) WITH SENIOR RX PLUS PLAN | WI | 237166771 | 3539 | post65 | none | Medicare retirees in Anthem MA PPO; HRA usable in retirement but "may not be used to pay for Medicare Part A or B coverage" | verified | https://iuoe139healthfund.org/app/uploads/2026/04/SPD-2026-Final.pdf |
| CALIFORNIA IRONWORKERS FIELD WELFARE PLAN | CA | 956042868 | 3322 | unknown | unknown | Pasadena CA (ProPublica); no fund document found | n/a | n/a |
| OPERATING ENGINEERS' LOCAL 324 HEALTH CARE PLAN | MI | 381940673 | 2977 | unknown | unknown | Troy MI; BeneSys appears to administer (from oe324.org fringe links); no retiree document found | inferred | https://www.oe324.org/fringe-links/ |
| HEAVY & GENERAL LABORERS' LOCAL 472 & LOCAL 172 OF NJ- WELFARE FUND | NJ | 221481564 | 2666 | post65 | none | Retirees (15+ pension yrs) keep coverage; plan supplements Medicare; free at 20+ yrs, 20% of COBRA rate at 15–19 yrs; retirees "must enroll and pay the Medicare premiums" | verified | https://www.hglfunds.org/forms/welfare/medicarenotice2026.pdf |
| SHEET METAL WORKERS LOCAL 104 HEALTH CARE PLAN | CA | 942541328 | 2393 | unknown | unknown | Pleasanton CA; no fund document found | n/a | n/a |
| MINNESOTA LABORERS HEALTH AND WELFARE FUND | MN | 416187750 | 2271 | unknown (retirees mentioned) | unknown | Zenith American Solutions administers; benefit guide mentions "Active or Retiree members"; no Medicare/Part B detail | verified (admin) | https://laborersfunds.org/ |
| JOINT BENEFIT TRUST | CA | 946284253 | 2073 | unknown | unknown | Cannery Teamsters trust (Dublin CA); website has no retiree/Medicare content | verified (no content) | https://jointbenefittrust.com/about-us/ |
| OPERATING ENGINEERS HEALTH AND WELFARE TRUST FUND | CA | 942784001 | 1951 | unknown | unknown (likely none) | If this is OE Local 3, its retirees are in the separate Pensioned OE H&W Trust Fund (EIN 94-6096327), which says "you will have to pay a monthly premium for Part B"; ProPublica lists 94-2784001 in Bothell WA, so the match is unconfirmed | inferred | https://www.oe3trustfunds.org/SPDs_retire/ |
| HEARTLAND HEALTHCARE FUND | MN | 020656066 | 1910 | unknown | unknown | Bloomington MN; 0 actives (retiree-only?); no document found | n/a | https://projects.propublica.org/nonprofits/organizations/020656066 |
| TEAMSTERS MISCELLANEOUS SECURITY FUND | CA | 956060502 | 1763 | unknown | unknown | Pasadena CA; no fund document found | n/a | n/a |
| AMERICAN MARITIME OFFICERS MEDICAL PLAN | FL | 135600786 | 1679 | post65 | none (inferred) | Medicare-eligible pensioners: plan reimburses the 20% and the Part A/B *deductibles*; must enroll in A and B; no premium reimbursement listed | verified (coverage) / inferred (Part B) | https://www.amoplans.com/bulletins/Active_vs_Pensioner_Medical_Coverage_Quick_Guide_2026.pdf |
| EXCAVATORS UNION LOCAL 731 WELFARE FUND | NY | 131615440 | 1598 | unknown | unknown | Astoria NY; union site has no fund documents | n/a | https://local731.org/funds-home |
| NORTHERN NEW ENGLAND BENEFIT TRUST DBA ALLEGIANT CARE | NH | 026015031 | 1539 | unknown | unknown | Manchester NH; benefits portal (Empyrean) is login-only | n/a | n/a |
| SOUTHERN CALIFORNIA IBEW-NECA HEALTH TRUST FUND | CA | 956140101 | 1483 | post65 | hra (weak) | Retiree Health Plan (Kaiser Senior Advantage / Anthem Medicare Preferred, self-pay); HRA balance usable in retirement for §213 expenses incl. "Retiree Health Plan self-pay premiums"; Part B not named | verified | https://www.scibew-neca.org/html/hrspd0000.htm |
| INDIANA LABORERS WELFARE FUND | IN | 350923209 | 1363 | unknown | unknown | Terre Haute IN; no fund document found | n/a | n/a |
| NORTHERN NEVADA OPERATING ENGINEERS HEALTH AND WEL | NV | 886031750 | 1302 | unknown | unknown | Reno NV; 0 actives; not on oe3trustfunds.org | n/a | n/a |
| SHEET METAL WORKERS HEALTH FUND OF LOCAL UNION NO. 19 | PA | 231324693 | 1262 | unknown | unknown | Philadelphia PA (ProPublica: "Sheet Metal Workers Welfare Fund of Southeastern Pennsylvania"); no document found | n/a | n/a |
| THE BLEDSOE HEALTH TRUST | WA | 930478837 | 1232 | post65 (self-pay) | none (dialysis-only exception) | Retiree Plans 1/2 self-pay with "over-65-rate"; Part B premiums reimbursed only during supplemental kidney dialysis | verified | https://cdn.prod.website-files.com/63c5d99eb097af03eba70119/6418e6c42f4ea8485a692387_Summary%20Plan%20Description%20-%20Retirees%20-%20January%201%2C%202018.pdf |

## Findings per plan

All accessed 2026-10-07.

1. **SMART-TD Health & Welfare Plan (VA, EIN 80-0616629).**
   - SMART's retiree page lists "UnitedHealthcare GA-23111 Plan F", a Medicare supplement for transportation members, and GA-46000/Plan E early-retiree coverage.
   - The 2022 benefits directory says: "For retired SMART-TD (UTU) members and others covered under GA-23111 Plan F, the Medicare Supplement, send claims to UnitedHealthcare…".
   - No Part B premium language was found.
   - Which rail-industry arrangement this EIN files for is unconfirmed.
   - Label: secondary.
   - Sources: https://www.smart-union.org/get-involved/retirees/ and https://static.smart-union.org/worksite/PDFs/RetireeNews/H%26W+Directory+of+Benefits_1022.pdf
2. **St. Louis–Kansas City Carpenters Regional Health Plan (MO, 43-1622970).**
   - Administrator: Mid-America Carpenters Regional Benefit Services (MACRBS), 1419 Hampton Ave, St. Louis; laborfunds.org.
   - The SPD (eff. 7/1/2025) says: "To remain covered by the Plan, the Participant or Dependent must enroll in the UHC Medicare Advantage Program… The Plan's monthly charge for an individual who participates in the UHC Medicare Advantage Program includes 100% of the Premium due from the individual to UnitedHealthcare. The Plan does not endorse the UHC Medicare Advantage Program, or pay any part of its cost…"
   - 2026 Non-Active rates: "Medicare $287.00".
   - The active HRA ("Active Plan participants have access to a Health Reimbursement Arrangement") is for actives.
   - part_b = none. Verified.
3. **Bakery & Confectionery Union & Industry International Health Benefits Fund (MD, 53-0227042).**
   - Fund office: Kensington MD (bctrustfunds.org; the live site returned 503, so it was read through the Wayback Machine).
   - The website says: "Today's Medicare-eligible W-1 participants are enrolled in a Medicare Advantage plan… While employer contributions cover most of the Plan's expenses, the retirees pay monthly premiums as well."
   - The P-Plan SPD says a pre-2017 retiree's HRA may be used "to pay Medicare premiums, premiums under the W-Plans of the Health Benefit Fund, and most other health insurance premiums". It also lists "Premiums that you or your Dependents pay for Medicare Part B or Part D".
   - Retirements on or after 1/1/2017 get a death benefit only.
   - Executive Director named in the P-Plan SPD: John Beck (SPD undated, post-2017).
   - part_b = hra (legacy, closed). Verified.
   - P-Plan SPD: https://www.bctrustfunds.org/__static/9fd897a782c011d82368c958100eaaa1/9893m_final.pdf
4. **88 Plan (MD, 11-3805565).**
   - The NFL benefits sheet (issued 8/2020) says it "Provides reimbursement of eligible expenses if you are diagnosed with Dementia, ALS or Parkinson's. Up to $160,000 per year… in-patient care… $140,000 per year… at-home care."
   - It is not retiree health coverage, so there is no Part B route. Secondary.
5. **Gene Upshaw NFL Player HRA Plan (MD, 11-3805568).**
   - The NFL sheet says: "can be used for reimbursement of out-of-pocket health expenses… Available to use after CV coverage ends… account maximum is now $450,000."
   - The NFLPA FAQ says: "Eligible medical, dental, hearing and vision expenses that are not covered by insurance can be reimbursed… Insurance premiums are eligible as well."
   - Part B is not named.
   - Separate from this plan, the CBA's Former Player Life Improvement Plan provides "a monthly nominal credit of $160 (increasing to $200 effective September 1, 2026)" for "monthly premiums incurred for the purchase of a Medicare Supplement or Advantage Plan" (https://overthecap.com/collective-bargaining-agreement/article/63/section/8).
   - Players' office: NFL Player Benefits Office, 800-638-3186.
   - part_b = hra. Secondary.
6. **NFL Dedicated Hospital Network (NY, 13-3077470).**
   - The CBA describes defined no-cost care (annual physicals, preventive, mental health, outpatient orthopedic) at participating providers for former players without NFL Player Insurance Plan coverage. The program started 9/1/2021 and Cigna administers it.
   - No premium benefit. part_b = none. Secondary.
7. **Teamsters Benefit Trust (CA, 94-2848389).**
   - tbtfund.org lists retiree plans: Basic Retiree Plan, Comprehensive Retiree Plan, Retirement Security Plan and Supplemental Retiree Plan.
   - The site says: "RETIREES—Medicare Enrollment Required… you must enroll in Medicare Parts A and B immediately."
   - Notices exist for "CRP with Subsidy" (Part D) and "Plan I-85 Retiree Self-Pay Subsidy Change for Eligible Retirees Age 60 and Over".
   - The plan booklets are marked "PDF coming soon".
   - No Part B premium language found. part_b = unknown. Verified (coverage only).
8. **Retirees Welfare Trust (WA, 91-6065367).**
   - Seattle; same address as Northwest Administrators (2323 Eastlake Ave E).
   - The NWA site is behind a Cloudflare challenge, and no public SPD was found.
   - unknown.
9. **Sidney Hillman Health Center (NY, 16-0864443).**
   - ProPublica name: "Sidney Hillman Health Center of Rochester".
   - No fund site found (sidneyhillman.org is parked).
   - unknown.
10. **Heartland Health and Wellness Fund (OH, 31-6173363).** No site or document found. unknown.
11. **Carpenters & Joiners Welfare Fund (MN, 41-6024791).**
    - The NMW Regional Council page says "Wilson-McShane Corporation is the Plan Administrator for all fringe benefit funds… Carpenters & Joiners Welfare Fund".
    - The fund site (carpentersandjoinersbenefits.com) is login-only.
    - unknown.
12. **Teamsters & Employers Welfare Trust of Illinois (366441012).** No site found (tewt.com is parked). unknown.
13. **Operating Engineers Local 139 Health Benefit Fund – Medicare Preferred (PPO) with Senior Rx Plus (WI, 23-7166771).**
    - The 2026 SPD says Medicare retirees enroll in the "Medicare Advantage Preferred (PPO) with Senior RX Plus Plan".
    - On the HRA: "Retiree coverage Self-payment contributions (excluding reimbursement for Medicare Part B premium)" and "the HRA may not be used to pay for Medicare Part A or B coverage."
    - The 2026 HRA brochure lists as ineligible "Premiums for… Medicare Part B".
    - part_b = none. Verified.
14. **California Ironworkers Field Welfare Plan (95-6042868).** Pasadena; no document found. unknown.
15. **OE Local 324 Health Care Plan (MI, 38-1940673).**
    - Troy MI. The oe324.org "Fringe Links" page points to BCBSM transparency files and a BeneSys email address. The administrator appears to be BeneSys (inferred).
    - No retiree document found. unknown.
16. **Heavy & General Laborers' Locals 472 & 172 NJ Welfare Fund (22-1481564).**
    - Fund office: Newark NJ; hglfunds.org.
    - SPD (eff. 4/1/2016):
      - "You retire with a minimum of 15 years… credited service…"
      - "If you have 15 pension credit years… but less than 20… you will pay a premium equal to 20% of the COBRA… rate… If you have 20 or more pension credit years… you do not have to pay premiums."
      - "If you are a retiree… eligible for Medicare, this Plan supplements your Medicare benefits."
    - 2026 Medicare notice: "you must enroll and pay the Medicare premiums and deductibles."
    - part_b = none. Verified.
17. **Sheet Metal Workers Local 104 Health Care Plan (94-2541328).** Pleasanton CA; no document found. unknown.
18. **Minnesota Laborers H&W Fund (41-6187750).**
    - The laborersfunds.org contact page says: "contact Zenith American Solutions, the plan Administrator."
    - The benefit guide mentions "Active or Retiree members".
    - No Medicare detail. unknown.
19. **Joint Benefit Trust (CA, 94-6284253).**
    - The site says it was "established in 1972… Producers Alliance of California and the Teamsters Cannery Council".
    - No retiree or Medicare content on the site. unknown.
20. **Operating Engineers H&W Trust Fund (CA, 94-2784001).**
    - ProPublica lists this EIN in Bothell, WA, so the identity is unconfirmed.
    - OE Local 3's retirees are covered by the *Pensioned* Operating Engineers H&W Trust Fund, EIN 94-6096327, which is a different EIN. Its 2023 SPD says: "You will not have to pay a premium for Part A, but you will have to pay a monthly premium for Part B."
    - Recorded as unknown (likely none) for this EIN. Inferred.
21. **Heartland Healthcare Fund (MN, 02-0656066).** Bloomington MN; 0 actives; no document found. unknown.
22. **Teamsters Miscellaneous Security Fund (95-6060502).** Pasadena CA; tmsfund.com is parked. unknown.
23. **American Maritime Officers Medical Plan (FL, 13-5600786).**
    - amoplans.com, Dania Beach FL.
    - The 2026 Active vs Pensioner guide, for the Medicare-eligible column, says: "This plan will include reimbursement of any Medicare Part A and Medicare Part B deductible… Medicare Pays 80% / AMO Medical Plan will reimburse 20%… All Pensioners/Retirees and their dependent spouses must enroll in both Medicare Part A and Part B."
    - No Part B premium reimbursement listed. part_b = none (inferred from a full benefit grid).
24. **Excavators Union Local 731 Welfare Fund (NY, 13-1615440).** Astoria NY; the union funds page has no documents. unknown.
25. **Northern New England Benefit Trust / Allegiant Care (NH, 02-6015031).** Manchester NH; the benefits portal is login-only. unknown.
26. **Southern California IBEW-NECA Health Trust Fund (95-6140101).**
    - Retiree Health SPD (as of 1/1/2026) lists the Anthem Medicare Preferred Plan and Kaiser.
    - §5.1: "When you retire and begin Retiree Health Plan coverage, you will continue to have access to the funds in your HRA account… Eligible expenses are defined under Section 213… include: Retiree Health Plan self-pay premiums; COBRA premiums…"
    - The HRA is administered by Coast Benefits.
    - Part B is not named. part_b = hra (weak). Verified.
27. **Indiana Laborers Welfare Fund (35-0923209).** Terre Haute IN; no site found (ilwf.org is parked). unknown.
28. **Northern Nevada OE H&W (88-6031750).** Reno NV; 0 actives; no document found. unknown.
29. **Sheet Metal Workers Health Fund of Local 19 (PA, 23-1324693).** Philadelphia; no site found. unknown.
30. **The Bledsoe Health Trust (WA, 93-0478837).**
    - Administration: Northwest Administrators (Seattle).
    - Retiree SPD (Jan 2018):
      - "you may elect to self-pay either under the Retiree Plans 1 or 2… the Medicare-eligible enrollee will be allowed to pay the over-65-rate-per-person monthly."
      - "an enrollee receiving supplemental dialysis is eligible to have Medicare Part B premiums reimbursed by the Plan as an eligible Plan expense for the duration of the enrollee's dialysis treatment… Proof of payment of the Medicare Part B premium will be required."
    - part_b = none generally (dialysis-only exception). Verified.

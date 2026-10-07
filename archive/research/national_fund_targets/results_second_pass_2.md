# National fund targets: second pass 2 (20 multiemployer health plans)

Accessed 2026-10-07. Source list: `second_pass_2.csv` (DOL Form 5500; `non_active` is a rough proxy for retirees). This pass re-ran plans left `unknown` by batches 1-5. About 38 web searches were used across the 20 plans, plus direct fetches of fund sites, SPDs and ProPublica pages.

## Summary

- **Fund pays or reimburses Part B: 0 of 20 confirmed.** No document in this pass shows a fund paying Part B premiums.
- **Explicitly no Part B payment: 1, verified.** **Pipe Trades Services MN Welfare Fund** (EIN 41-0761972). Medicare retirees buy the fund's insured HealthPartners Medicare Advantage or Medigap coverage. The sister Retiree Health Trust's allowance ($14.073 per Service Credit per month) only reduces that premium. The 2024 SPD has no Part B reimbursement.
- **Covers retirees only up to 65: 1.** **Heartland Health & Wellness Fund** (OH). The MI Retiree Plan covers ages 55 to 65 and "bridges the gap between active benefits and Medicare coverage". It covers no one past 65, so it has no Part B premium to save (inferred).
- **Post-65 coverage confirmed, Part B handling unknown: 3.**
  - **GMP-Employers Retiree Trust**: Medicare-eligible members move to the Indemnity Plan.
  - **Steelworkers Health & Welfare Fund**: a "Steelworker's Medicare Supplement Plan", seen in one employer group's SPD.
  - **Teamsters Benefit Trust**: retirees "must enroll in Medicare Parts A and B"; its retiree booklets are still "PDF coming soon".
- **Unknown: 15.** Fund sites were down (cmrccbenefits.org and chilpwf.com returned 503), login-only (carpentersandjoinersbenefits.com), or not found. ProPublica pages identify the entity and its administrator or trustees, but nothing on Part B.
- **Nothing found that mentions MSP, Extra Help or Medicaid help** in any document read.

## Leads worth a phone call

- **Sheet Metal Workers Local 105 Health Reimbursement Plan** (San Jose CA, 7,227 non-active). The plan is an HRA by name. If the HRA reimburses Part B, MSP would only free up account balances, as with the JIB and HPAE HRAs in batch 5.
- **Chicago & Vicinity Laborers' DC Retiree H&W Plan** (Westchester IL, administrator Catherine Wenskus per Form 990). It is a retiree-only plan with 5,976 non-active participants. The fund site, chilpwf.com, returned 503 on every try.
- **GMP-Employers Retiree Trust** (Fort Myers FL, 239-936-6242). The retiree-only trust has 13,971 non-active participants. Ask whether its Medicare-era Indemnity Plan reimburses any premium.
- **Steelworkers H&W Fund** (Five Gateway Center, Pittsburgh). Ask whether its Medicare Supplement Plan, or any participating group, reimburses Part B.

## Table

| plan_name | state | ein | non_active | retiree_health | part_b | detail | label | url |
|---|---|---|---|---|---|---|---|---|
| IN/KY/OH Rgnl Council of Carpenters Welfare Fund | MI | 356042362 | 15706 | unknown | unknown | Fund site redirects to cmrccbenefits.org (503); council update names two H&W funds (IN/KY and Ohio), nothing on retirees | secondary | https://www.cmwcarpenters.com/?p=8737 |
| G.M.P.-Employers Retiree Trust | FL | 236411794 | 13971 | post65 | unknown | On Medicare eligibility the PPO ends and the member moves to the Indemnity Plan; retiree indemnity free, spouse $35/mo; no Part B text | verified | https://gmptrust.com/q-a/ |
| Steelworkers Health and Welfare Fund | PA | 231317409 | 8570 | post65 | unknown | Fund SPD (Kenyon group, 4/2022): retirees at 65 "transferred to the Steelworker's Medicare Supplement Plan"; no Part B premium text | verified (one group's SPD) | https://www.kenyon.edu/files/resources/kenyon-college-spd-4-2022.pdf |
| Sheet Metal Workers Local 105 Health Reimbursement Plan | CA | 330490874 | 7227 | unknown | unknown | San Jose; HRA by name (may cover premiums, inferred); no document found | secondary | https://projects.propublica.org/nonprofits/organizations/330490874 |
| Teamsters Benefit Trust | CA | 942848389 | 7012 | post65 | unknown | Retiree plans BRP/CRP/RSP/SRP; "you must enroll in Medicare Parts A and B immediately"; Guides/Summaries "PDF coming soon" | verified | https://www.tbtfund.org/plans/rsp/ |
| Chicago & Vicinity Laborers' DC Retiree H&W Plan | IL | 465243652 | 5976 | unknown | unknown | Retiree-only plan, Westchester IL; administrator Catherine Wenskus (990); fund site 503 | secondary | https://projects.propublica.org/nonprofits/organizations/465243652 |
| U.F.C.W. Local 1529 & Contrib Employers H&W | TN | 620978539 | 5372 | unknown | unknown | No fund document; ProPublica 404 for this EIN; a separate "UFCW Local 1529 Retiree Fund" appears in search (EIN unconfirmed) | secondary | https://projects.propublica.org/nonprofits/organizations/461465087 |
| Sidney Hillman Health Center (of Rochester) | NY | 160864443 | 4965 | unknown | unknown | 501(c)(4), Rochester; key employees are pharmacists/opticians, so likely a pharmacy/optical center, not an insurer (inferred) | secondary | https://projects.propublica.org/nonprofits/organizations/160864443 |
| Heartland Health and Wellness Fund | OH | 316173363 | 4471 | to65 | none (inferred) | MI Retiree Plan, ages 55-65, Kroger/UFCW Local 876; "bridges the gap between active benefits and Medicare coverage" | verified | https://www.heartlandwellnessfund.com/mi-retiree-plan/ |
| Carpenters & Joiners Welfare Fund | MN | 416024791 | 4078 | unknown | unknown | Site is login-only; no retiree text | verified (site) | https://www.carpentersandjoinersbenefits.com |
| Teamsters and Employers Welfare Trust of Illinois | MO | 366441012 | 3777 | unknown | unknown | No fund site found; ProPublica 404 for this EIN | n/a | n/a |
| NYSA-ILA Welfare Fund and Plan | NJ | 135638505 | 3728 | unknown | unknown | Jersey City; Director Thomas Omiatek (990); no plan document found | secondary | https://projects.propublica.org/nonprofits/organizations/135638505 |
| FELRA and UFCW VEBA Fund | MD | 521036978 | 3372 | unknown | unknown | 990 name "FELRA and UFCW Health and Welfare Fund", Sparks MD; no retiree text | secondary | https://projects.propublica.org/nonprofits/organizations/521036978 |
| IUOE and Pipeline Employers H&W Fund | IL | 237134462 | 3203 | unknown | unknown | 990 lists Columbia MD; trustees only; no site found | secondary | https://projects.propublica.org/nonprofits/organizations/237134462 |
| Operating Engineers' Local 324 Health Care Plan | MI | 381940673 | 2977 | unknown | unknown | Troy MI; BeneSys client (Cause IQ); oe324.org links only to BCBSM transparency files | secondary | https://www.oe324.org/fringe-links/ |
| Republic Retiree VEBA Medical Plan | PA | 020642820 | 2881 | unknown | unknown | 2007 article: retirees paid 25% of cost of coverage; no Medicare/Part B text | secondary | https://www.aist.org/republic-veba-participants-get-second-cost-reduction-in-two-years |
| Oregon Teamster Employers Trust | OR | 936021475 | 2666 | unknown | unknown | Opinion piece: 2026 retiree medical $792/$1,072/$1,242/mo by age group; page 403, search summary only | secondary | https://znetwork.org/znetarticle/mark-davison-slaps-retired-oregon-teamsters-with-31-out-of-pocket-medical-hikes-2-years-after-historic-ups-contract-so-what-went-wrong |
| Pipe Trades Services MN Welfare Fund | MN | 410761972 | 2527 | post65 | none | Medicare retirees buy insured HealthPartners MA/Medigap; must enroll in A and B; RHT allowance $14.073/Service Credit/mo reduces that premium; no Part B reimbursement | verified | https://www.ptsmn.org/pdf/PTSMN%20Welfare%20SPD%202024-131574095-v2.pdf |
| The Steamfitters Industry Welfare Fund | NY | 131545680 | 2385 | unknown | unknown | Long Island City (Local 638); no document found; NYC contract retiree fund is a different (municipal) fund | secondary | https://www.charitynavigator.org/ein/131545680 |
| Southeastern Carpenters and Millwrights Health Plan | TN | 586066597 | 2154 | unknown | unknown | Goodlettsville TN; trustees only (FY2024 990); no site found | secondary | https://projects.propublica.org/nonprofits/organizations/586066597 |

## Findings

1. **IN/KY/OH Regional Council of Carpenters Welfare Fund (MI, 35-6042362).**
   - The old administrator URL (ourbenefitoffice.com/IndianaKentuckyCarpenters) now 302-redirects to http://www.cmrccbenefits.org/. That site returned HTTP 503 on two tries.
   - A council post dated January 11, 2022 mentions "two Health & Welfare Funds, one for Indiana/Kentucky and another for Ohio". It says nothing about retirees or Medicare. https://www.cmwcarpenters.com/?p=8737
   - Administrator: BeneSys, Troy MI, per the batch 1 secondary source (not re-verified).
   - retiree_health=unknown, part_b=unknown.
2. **G.M.P.-Employers Retiree Trust (Fort Myers FL, 23-6411794).** retiree_health=post65, part_b=unknown. Label: verified.
   - The trust's Q&A says: "When you become eligible for Medicare (either by reaching age 65 or becoming medically eligible)" the PPO option ends and the member moves to the Indemnity Plan. It also says: "To be eligible for the PPO option, you must be a Trust participant and not yet eligible for Medicare." https://gmptrust.com/q-a/
   - The homepage says retirees are enrolled in the Indemnity Plan at no charge, spouses pay $35/month, and the Trust "is for medical and prescription coverage only". https://www.gmptrust.com
   - No Part B text on the home, Benefits or Q&A pages. The Benefits page requires a Local # lookup.
   - Contact: 239-936-6242, info@gmptrust.com.
3. **Steelworkers Health and Welfare Fund (PA, 23-1317409).** retiree_health=post65, part_b=unknown. Label: verified, but for one group only.
   - The fund's own SPD booklet for the Kenyon College group (April 2022) says: "Employees who retire at the age of 65 or older or employees who retired early under the terms described above and reach age 65 will be transferred to the Steelworker's Medicare Supplement Plan." https://www.kenyon.edu/files/resources/kenyon-college-spd-4-2022.pdf
   - Plan Administrator: "the Board of Trustees of the Steelworkers Health and Welfare Fund". The Fund Office is at Five Gateway Center (Pittsburgh).
   - The fund's brochure describes "plan options for Steelworker members, retirees, and their families". https://usw.org/wp-content/uploads/2024/10/hw-fund-brochure.pdf
   - Benefits vary by participating group. No Part B premium text was found.
4. **Sheet Metal Workers Local 105 Health Reimbursement Plan (San Jose CA, 33-0490874).** retiree_health=unknown, part_b=unknown. Label: secondary.
   - ProPublica shows a 501(c)(9) with FY ending June 2025, filed April 1, 2026, and lists trustees only.
   - The guessed fund domains (smw105benefits.org, smw105.org) do not resolve.
   - It is an HRA by name. Whether it reimburses Part B is unknown, which would make it an hra plan if so (inferred).
5. **Teamsters Benefit Trust (CA, 94-2848389).** retiree_health=post65, part_b=unknown. Label: verified.
   - Every retiree plan page (BRP, CRP, RSP, SRP) says: "you must enroll in Medicare Parts A and B immediately". https://www.tbtfund.org/plans/rsp/
   - The Guide to Your Benefits and Summary of Coverage are listed as "PDF coming soon". No premium or reimbursement text appears.
   - Contact: TBT Plan Administration Office, (800) 533-0119.
6. **Chicago & Vicinity Laborers' District Council Retiree Health & Welfare Plan (Westchester IL, 46-5243652).** retiree_health=unknown (retiree-only plan, ages not confirmed), part_b=unknown. Label: secondary.
   - The Form 990 for FY ending May 2025 lists "Catherine Wenskus (Administrator)" and 12 trustees. https://projects.propublica.org/nonprofits/organizations/465243652
   - The fund site chilpwf.com returned 503 on three fetches.
   - Search hits concerned the separate City of Chicago Laborers' annuity fund, which is not this plan.
7. **UFCW Local 1529 & Contributing Employers H&W (TN, 62-0978539).** retiree_health=unknown, part_b=unknown. Label: secondary.
   - ProPublica returned 404 for this EIN.
   - Search shows a separate "Ufcw Local 1529 Retiree Fund" (2024 revenue $166k, assets $2.75M). I did not confirm its EIN or that it is related. https://projects.propublica.org/nonprofits/organizations/461465087
   - No plan document was found.
8. **Sidney Hillman Health Center of Rochester (NY, 16-0864443).** retiree_health=unknown, part_b=unknown. Label: secondary.
   - The 990 lists a 501(c)(4) whose officers are Gary J Bonadonna Jr (President) and others. Its key employees have pharmacist and optician titles. https://projects.propublica.org/nonprofits/organizations/160864443
   - This looks like a union pharmacy and optical center rather than an insurer (inferred). It is a poor MSP target unless it turns out to pay premiums.
9. **Heartland Health and Wellness Fund (Dayton OH, 31-6173363).** retiree_health=to65, part_b=none (inferred: no post-65 coverage). Label: verified.
   - The MI Retiree Plan page says it "is only applicable to Michigan Kroger Local 876, Hollywood Markets and UFCW Local 876 employees". It is "designed to meet the healthcare needs of participants who retire before the age of 65", requires that the member has "reached age 55 but not age 65", and "essentially bridges the gap between active benefits and Medicare coverage". https://www.heartlandwellnessfund.com/mi-retiree-plan/
   - Administrator: Heartland Benefit Plan Administrators, LLC, 7250 Poe Ave, Dayton; 937-665-1900.
10. **Carpenters & Joiners Welfare Fund (MN, 41-6024791).** retiree_health=unknown, part_b=unknown.
    - carpentersandjoinersbenefits.com is a participant login page with no public SPD.
    - Search found only directory listings.
    - Administrator: Wilson-McShane, per the batch 2 secondary source (not re-verified).
11. **Teamsters and Employers Welfare Trust of Illinois (MO, 36-6441012).** retiree_health=unknown, part_b=unknown.
    - ProPublica returned 404 for this EIN.
    - Two searches found only look-alikes: Teamsters Retiree Trust (Stockton CA) and Teamsters Medicare Trust for Retired Employees.
12. **NYSA-ILA Welfare Fund (Jersey City NJ, 13-5638505).** retiree_health=unknown, part_b=unknown. Label: secondary.
    - The 990 lists Thomas Omiatek (Director), Jennifer Freedberg-Berkoff (Director) and Dominick Gaudioso (Treasurer). https://projects.propublica.org/nonprofits/organizations/135638505
    - No fund website was found (nysaila.com and nysa-ila.com do not resolve).
13. **FELRA and UFCW VEBA Fund (MD, 52-1036978).** retiree_health=unknown, part_b=unknown. Label: secondary.
    - The FY2024 Form 990 is filed under the name "Felra And Ufcw Health And Welfare Fund", Sparks MD, with union and employer trustees. https://projects.propublica.org/nonprofits/organizations/521036978
    - A GuideStar profile describes the trust in the past tense. It may be winding down; this is inferred and unconfirmed.
14. **International Union of Operating Engineers and Pipeline Employers H&W Fund (IL, 23-7134462).** retiree_health=unknown, part_b=unknown. Label: secondary.
    - The 990 lists Columbia MD and trustees (James Callahan, Paul McCormick and others). https://projects.propublica.org/nonprofits/organizations/237134462
    - The search hits were other funds: OE Trust Funds in Pasadena, and the Pipeline Industry Benefit Fund in Tulsa, which is UA, not IUOE.
15. **Operating Engineers' Local 324 Health Care Plan (Troy MI, 38-1940673).** retiree_health=unknown, part_b=unknown. Label: secondary.
    - oe324.org/fringe-links links the plan only to a BCBSM machine-readable-file page. That suggests BCBSM is the carrier or network (inferred).
    - Cause IQ lists the plan as a BeneSys client. No retiree document was found.
16. **Republic Retiree VEBA Medical Plan (PA, 02-0642820).** retiree_health=unknown, part_b=unknown. Label: secondary.
    - AIST, 12/21/2007: "Established in 2002, the Republic Retiree VEBA Benefit Trust" covers "USW-represented retirees and surviving spouses". "The contribution now stands at 25% of the total cost of coverage." https://www.aist.org/republic-veba-participants-get-second-cost-reduction-in-two-years
    - The article does not mention Medicare or Part B. It is 19 years old.
17. **Oregon Teamster Employers Trust (OR, 93-6021475).** retiree_health=unknown (retiree medical exists, ages unclear), part_b=unknown. Label: secondary.
    - A ZNetwork opinion piece reports that 2026 retiree medical self-pay rises "$292 per month", to "$792, $1,072 and $1,242 per month" across three age groups.
    - The article returned 403, so this comes from a search summary only. No trust website was found.
18. **Pipe Trades Services MN Welfare Fund (White Bear Lake MN, 41-0761972).** retiree_health=post65, part_b=none. Label: verified. Source for all quotes: https://www.ptsmn.org/pdf/PTSMN%20Welfare%20SPD%202024-131574095-v2.pdf (EIN and plan number 501 confirmed in the SPD).
    - The 2024 SPD says: "Health Benefits for Medicare-Eligible Retirees are provided through insured Medicare Advantage and Medicare Supplement (Medigap) plans. These policies are purchased by the Welfare Fund from a third-party insurance carrier—HealthPartners."
    - It also says: "You and your Dependent Spouse must enroll in both Medicare Parts A and B to enroll in this insured coverage". Retirees must "pay your first monthly Premium".
    - RHT: "If you are a Medicare-Eligible Retiree, the amount of your Contribution Allowance is equal to $14.073 per Service Credit per month." The allowance "reduces your monthly Premiums".
    - No Part B premium reimbursement appears anywhere in the 7,975-line SPD.
    - Plan Sponsor and Administrator: Board of Trustees, 4461 White Bear Parkway, Suite 1.
19. **The Steamfitters Industry Welfare Fund (Long Island City NY, 13-1545680, pn 502).** retiree_health=unknown, part_b=unknown. Label: secondary.
    - NY notes (`ny_fund_targets/funds_trades.md`, finding 28) already flagged the Steamfitters 638 site as members-only.
    - Charity Navigator gives only "provides health coverage and other benefits to eligible participants".
    - The NYC–Local 638 municipal contract (2022–2027) raises a "retiree Welfare Fund contribution" to $1,775 per year (8/1/2025) and $1,846.42 (8/1/2026). Those payments go to "the New York City Municipal Steamfitters and Steamfitters Helpers Retiree Health and Welfare Fund", a different fund, so they do not apply here. https://www.nyc.gov/assets/olr/downloads/pdf/collectivebargaining/2021-2026/Steamfitter_2022-08-01--2027-08-31.pdf
20. **Southeastern Carpenters and Millwrights Health Plan (Goodlettsville TN, 58-6066597).** retiree_health=unknown, part_b=unknown. Label: secondary.
    - The FY2024 990 (filed 5/14/2025) lists trustees J. Kirk Malone (Chairman) and Thomas H. Jenkins (Secretary), among others. https://projects.propublica.org/nonprofits/organizations/586066597
    - No website or retiree document was found.

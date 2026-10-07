# National fund targets: batch 5 results (30 multiemployer health plans)

Accessed 2026-10-07. Source list: `batch_5.csv` (DOL Form 5500; `non_active` is a rough proxy for retirees).

## Summary

- **Plans that pay toward Part B directly: 1 of 30.** The **Seafarers Health and Benefits Plan** (MD) pays Medicare-eligible pensioners a **flat $50/month toward their Medicare premium, plus another $50/month for a Medicare-enrolled spouse**. Source: the plan's own 2021 pensioner booklet section, so the amount may have changed since.
- **General HRA or VEBA accounts that name Part B as reimbursable: 2.** This is a weaker benefit.
  - **JIB Health Reimbursement Account Plan of the Electrical Industry** (NY, IBEW Local 3). It reimburses retirees' "Medicare premiums" once a year against an SSA-1099, from an individual account (typically capped at $5,000).
  - **HPAE Retiree Medical Trust** (NJ). It reimburses "Medicare Part B and D premiums" up to a monthly lifetime benefit, about $156/month after 25 years in the trust's own example.
  - For both, MSP enrollment would only free the account for other expenses. The fund itself saves nothing.
- **Not Part B, but a similar subsidy: 2.**
  - **NFL Former Player Life Improvement Plan**: a $200/month Medicare Supplement HRA, for **Medigap/Medicare Advantage premiums**, not Part B.
  - **Pipe Trades Services MN Retiree Health Fund**: an allowance of $14.073 per service credit per month toward the premium of the fund's own Medicare Advantage/Medigap coverage.
- **Explicitly no Part B payment: 3.**
  - **Central States (TeamCare)**: "Each eligible Participant and Spouse will be responsible for Medicare Part B payments."
  - **National Elevator Industry HBP**: Parts A and B required, plan is supplemental. No reimbursement is described, so this one is inferred.
  - **Operating Engineers Local 12 (OEFI)**: retirees "must be enrolled in Parts A and B and pay your Part B premium". This comes from a search-result summary of the fund's site; I could not fetch the page itself.
- **Post-65 retiree coverage confirmed in some form: 12.** JIB HRA, NEI, NFL, HPAE, Eastern Atlantic Carpenters, OE Local 12, Pipe Fitters 597, Central States (Retiree Plan), SoCal Pipe Trades Pensioners (secondary source), PTSMN, NBA and Seafarers. The North Atlantic Carpenters plan covers retirees **only to age 65** on its main page.
- **Unknown: 15 plans.** I found no fund document and the fund websites were not reachable: several returned 403 (scufcwfunds.com, wpas-inc.com) and others had no public retiree page. The web-search budget for this session ran out after about 75% of the planned queries. These plans were searched 1–3 times each and still need follow-up: Electrical Insurance Trustees (IL), FELRA & UFCW VEBA (MD), Ohio Operating Engineers, Cleveland Bakers & Teamsters, Locals 302/612 (WA), Southeastern Carpenters (TN), Milwaukee Drivers, Iron Workers 40/361/417 Health and Topping Out, Harrison Electrical (OR), Mid-Atlantic Carpenters, Suburban Teamsters N. IL, Local 443 (CT), UFCW SoCal, Sheet Metal 105 HRA and Tri-State Joint Fund.
- **MSP, Extra Help or Medicaid help:** none of the documents read mention help applying for MSP, Extra Help or Medicaid.

## Notable leads

- **Seafarers** is the only confirmed Part B payer, but at a small flat amount. On 1,200 non-active participants, MSP enrollment of eligible pensioners would save the plan $50 per person per month, plus $50 for each enrolled spouse.
- **Joint Industry Board of the Electrical Industry** also runs a separate plan for Medicare-eligible retirees, the Pension, Hospitalization and Benefit Plan (PHBP). Its 2024 notice adds a $375 deductible for Medicare-eligible retirees. That plan is not in this batch. Check it separately for Part B reimbursement.
- **Unknowns most worth a phone call** (large and retiree-heavy): Sheet Metal 105 HRA (all 7,227 participants non-active), Southeastern Carpenters & Millwrights (all non-active), Topping Out Fund ("unreimbursed medical expense benefits"), Tri-State Joint Fund and Mason Tenders.

## Table

| plan_name | state | ein | non_active | retiree_health | part_b | part_b_detail (short) | label | url |
|---|---|---|---|---|---|---|---|---|
| Health Reimbursement Account Plan of the Electrical Industry (JIB, IBEW L3) | NY | 562489386 | 17822 | post65 (HRA only) | hra | Medicare premiums reimbursed annually on SSA-1099, up to individual account balance (cap typ. $5,000) | verified | https://www.jibei.org/wp-content/uploads/2022-hra-spd-1.pdf |
| UFCW Unions and Food Employers Benefit Fund (SoCal) | CA | 952301788 | 15688 | unknown | unknown | Fund site 403; no document found | unknown | https://www.scufcwfunds.com |
| National Elevator Industry Health Benefit Plan | PA | 232790911 | 12525 | post65 | none | Parts A and B required; plan becomes supplemental; retiree contribution reduced; no Part B reimbursement stated | verified (coverage) / inferred (part_b) | https://www.neibenefits.org/health/eligibility/ |
| NFL Former Player Life Improvement Plan | NY | 133077470 | 10820 | post65 (subsidy) | none | $200/mo Medicare Supplement HRA for Medigap/MA premiums, not Part B | secondary | https://overthecap.com/collective-bargaining-agreement/article/63/section/8 |
| HPAE/AFT Retiree Medical Trust | NJ | 686254830 | 8739 | post65 (reimbursement) | hra | Part B and D premiums reimbursable up to monthly lifetime benefit (ASU x $0.075; ~$156/mo at 25 yrs); 5 yrs, age 55; survivor 50% | verified | https://www.hpae.org/wp-content/uploads/2026/02/RMT-FAQ.pdf |
| Sheet Metal Workers Local 105 Health Reimbursement Plan | CA | 330490874 | 7227 | unknown | unknown | HRA plan, all participants non-active; no document found | unknown | n/a |
| Eastern Atlantic States Carpenters Health Fund | PA | 226032181 | 6071 | post65 | unknown | Blue Medicare Advantage + Part D; retiree premium varies by Medicare status; Part B not mentioned | verified (coverage) | https://members.carpenters.fund/benefit-coverage/retiree-health-coverage/ |
| Tri State Joint Fund (Teamsters) | CT | 060850110 | 5085 | unknown (retirees covered) | unknown | Self-insured benefits for "active and retired members"; Medicare terms not found | secondary | https://www.guidestar.org/Profile/06-0850110 |
| N. Atlantic States Carpenters Health Benefits Fund | MA | 046374357 | 4539 | to65 | unknown | Retiree plan "under age 65 and not otherwise eligible for Medicare"; NY Hours-Based fund offers Blue MA to Medicare retirees | verified | https://www.carpentersfund.org/health-fund/ |
| Operating Engineers Health and Welfare Fund (Local 12, OEFI) | CA | 956034886 | 4379 | post65 | none | Retiree pays fund premium (e.g., $218/mo FFS with Medicare); "pay your Part B premium" | verified (rates) / secondary (part_b) | https://www.oefi.org/retiree-health-and-welfare/benefit-summaries/monthly-rates/ |
| Pipe Fitters Welfare Fund, Local 597 | IL | 362141703 | 3869 | post65 | unknown | Humana MAPD via Retiree First; Part B not mentioned | verified (coverage) | https://www.pf597.org/welfare-fund/humana-mapd-and-retiree-first/ |
| Electrical Insurance Trustees (IBEW L134) | IL | 361033970 | 3652 | unknown | unknown | No document found | unknown | n/a |
| FELRA and UFCW VEBA Fund | MD | 521036978 | 3372 | unknown | unknown | No document found | unknown | n/a |
| Ohio Operating Engineers Health and Welfare Plan | OH | 314446857 | 3075 | unknown | unknown | No document found | unknown | n/a |
| Cleveland Bakers and Teamsters H&W Fund | OH | 340753693 | 2824 | unknown | unknown | No document found | unknown | n/a |
| Locals 302 & 612 IUOE Health and Security Plan | WA | 916028570 | 2528 | unknown | unknown | Admin site (WPAS) 403 | unknown | https://www.wpas-inc.com/IUOE302and612/ |
| Central States SE & SW Areas H&W Plan (Active Plan) | IL | 362154936 | 2335 | post65 (via separate Retiree Plan) | none | TeamCare Advantage (Humana MA); "responsible for Medicare Part B payments" | verified | https://myTeamCare.org/-/media/TeamCare/Files/Plan-Documents/TeamCare-Plan-Document-Retiree-R4.pdf |
| Southeastern Carpenters and Millwrights Health Plan | TN | 586066597 | 2154 | unknown | unknown | All participants non-active; no document found | unknown | n/a |
| SoCal Pipe Trades Pensioners & Surviving Spouses Health Fund | CA | 274271742 | 1995 | post65 (likely) | unknown | Retiree-only fund: medical/hospital/Rx for ~1,957 retirees | secondary | https://www.guidestar.org/Profile/27-4271742 |
| Mason Tenders' District Council Welfare Fund | NY | 135537605 | 1928 | unknown (retirees covered) | unknown | Covers "eligible active and retired participants"; Medicare terms behind member portal | verified (retirees) | https://member.mtdctrustfunds.org/welfare/ |
| Pipe Trades Services MN Retiree Health Fund | MN | 161657260 | 1820 | post65 | none | Allowance $14.073/service credit/mo toward fund's MA/Medigap premium (not Part B) | verified | https://www.ptsmn.org/pdf/PTSMN%20Welfare%20SPD%202024-131574095-v2.pdf |
| Milwaukee Drivers Health & Welfare Fund | WI | 396048358 | 1734 | unknown | unknown | No document found | unknown | n/a |
| NBA Players' Health and Welfare Benefit Plan | VA | 201260597 | 1607 | post65 | unknown | UHC retiree coverage at no premium cost, 3+ yrs service | verified (coverage) | https://cdn.cosmicjs.com/dd3865a0-b349-11ef-bee4-3bb1d3c55332-2024-NBA-Players-BAAG---Global-Plan42.pdf |
| Iron Workers Locals 40, 361 & 417 Health Fund | NY | 135622663 | 1573 | unknown | unknown | No document found | unknown | n/a |
| Topping Out Fund of Iron Workers Locals 40, 361 & 417 | NY | 133156507 | 1499 | unknown | unknown (possible hra) | Mission includes "unreimbursed medical expense benefits" | secondary | https://www.charitynavigator.org/ein/133156507 |
| Harrison Electrical Workers Trust Fund | OR | 936023048 | 1382 | unknown | unknown | A "Retiree Medical Plan" is referenced by a low-quality source; no document | unknown | n/a |
| Mid-Atlantic Regional Council of Carpenters Health Fund | MD | 526051383 | 1326 | unknown | unknown | No document found | unknown | n/a |
| Suburban Teamsters of Northern Illinois Welfare Fund | IL | 366158494 | 1271 | unknown | unknown | No document found | unknown | n/a |
| Local 443 Transportation Health Service & Insurance Plan | CT | 060942913 | 1242 | unknown | unknown | No document found | unknown | n/a |
| Seafarers Health and Benefits Plan | MD | 135557534 | 1200 | post65 | flat | $50/mo toward pensioner's Medicare premium + $50/mo for Medicare-enrolled spouse; Parts A and B required | verified (2021 doc) | https://www.seafarers.org/wp-content/uploads/2022/03/6.-Health-Benefits-for-Pensioners-10-2021.pdf |

## Findings, one per plan

1. **Health Reimbursement Account Plan of the Electrical Industry** (NY, EIN 562489386, PN 513).
   - **Administrator:** Joint Industry Board of the Electrical Industry, Flushing NY, (718) 591-2000.
   - **Coverage:** the plan reimburses retirees' Medicare premiums from an individual employer-funded account.
   - **SPD quote:** "Retirees who pay Medicare premiums will be eligible for reimbursement of the premiums upon the submission of Form SSA-1099, which is the annual benefit statement furnished by the Social Security Administration. Reimbursements will be distributed on an annual basis and may be made to the extent funds are available from your Account."
   - **Website quote:** the plan's web page lists "premiums paid for COBRA, Medicare Part B and long-term care" as reimbursable, and says the account balance "is typically $5,000."
   - **Classification:** part_b = hra (account-limited). verified.
   - **Sources:** https://www.jibei.org/wp-content/uploads/2022-hra-spd-1.pdf; https://jibei.org/health/health-reimbursement-account-hra-plan/ (accessed 2026-10-07).
   - **Related lead:** JIB's separate PHBP covers Medicare-eligible retirees; its 2024 notice adds a $375 deductible. It is not in this batch.

2. **UFCW Unions and Food Employers Benefit Fund** (CA, EIN 952301788).
   - **Fund office:** Southern California UFCW Unions & Food Employers Joint Benefit Fund, 6425 Katella Ave, Cypress CA 90630. This address comes from a secondary source and was not verified.
   - **What was tried:** scufcwfunds.com returned 403 to WebFetch and curl, and the web.archive.org fetch was blocked.
   - **Lead:** a 2021 Anthem provider notice about a UFCW Medicare Preferred PPO for retirees with Medicare Parts A and B surfaced in search. I could not read it, and it may not be this fund.
   - **Classification:** retiree_health unknown, part_b unknown.

3. **National Elevator Industry Health Benefit Plan** (PA, EIN 232790911).
   - **Administrator:** NEI Benefit Plans, 19 Campus Blvd., Suite 200, Newtown Square PA.
   - **Eligibility page quote:** "At that time, you must enroll in Medicare Parts A and B." "Your coverage under this Plan will then become supplemental." "The amount you pay for coverage under the Plan will be reduced once you enroll in Medicare Parts A and B."
   - **Other terms:** retiree eligibility requires 1,700 hours in the 60 months before retirement.
   - **SPD check:** the SPD (2020) mentions Part B only in the enrollment and coordination sections. It has no premium-reimbursement provision.
   - **Classification:** retiree_health post65 (verified). part_b none (inferred from silence plus the supplemental design).
   - **Sources:** https://www.neibenefits.org/health/eligibility/; https://www.neibenefits.org/wp-content/uploads/2020/04/NEI-Health-Benefit-Plan-Summary-Plan-Descripton.pdf

4. **NFL Former Player Life Improvement Plan** (NY, EIN 133077470).
   - **CBA Art. 63 §8:** the Medicare Supplement benefit was replaced effective 9/1/2020 with "an individual Medicare Supplement HRA account."
   - **Credit amount:** "a monthly nominal credit of $160 (increasing to $200 effective September 1, 2026)."
   - **Covered expense:** monthly premiums for a Medicare Supplement or Advantage Plan, not Part B.
   - **Forfeiture:** "Any account balance remaining upon the player's death shall be forfeited."
   - **Classification:** part_b none (Medigap/MA premium subsidy only), so MSP enrollment does not reduce this cost. Label secondary: the CBA text is hosted by overthecap.com. An NFL pamphlet in search results gives January 1, 2026 as the $200 start date, which conflicts with the CBA.
   - **Source:** https://overthecap.com/collective-bargaining-agreement/article/63/section/8

5. **HPAE Retiree Medical Trust** (NJ, EIN 686254830).
   - **Administrator:** Zenith American Solutions.
   - **FAQ (2026) on reimbursable expenses:** "Medicare Part B and D premiums or Medicare supplement plans."
   - **Benefit level:** "For every $5 contributed, you earn one Active Service Unit (ASU)… multiplies your ASUs by a Unit Multiplier (currently $0.075) to determine your monthly lifetime benefit." The FAQ's own example comes to "about $156/month."
   - **Regular Monthly Benefit:** "five or more years of participation… age 55 or older, and no longer working for a participating employer."
   - **Survivors:** a surviving spouse or partner gets "50% of your benefit."
   - **Classification:** part_b = hra (retiree-only VEBA; any 213(d) expense qualifies). verified.
   - **Sources:** https://www.hpae.org/wp-content/uploads/2026/02/RMT-FAQ.pdf; SPD at https://hpae.org/wp-content/uploads/2024/08/Summary-Plan-Description-eff-12-1-23-1.pdf, whose COBRA section says "the Plan reimburses premiums for Medicare Part A, B and D."

6. **Sheet Metal Workers Local 105 Health Reimbursement Plan** (CA, EIN 330490874).
   - **What was found:** no plan document. Searches returned only SMART Local 10 (MN) and unrelated HRAs, which are look-alikes and were excluded.
   - **Classification:** unknown. All 7,227 participants are non-active, which suggests a retiree HRA (inferred). Part B usability is unknown.

7. **Eastern Atlantic States Carpenters Health Fund** (PA, EIN 226032181). Offices in Philadelphia and Edison NJ (secondary source).
   - **Fund page quotes:** "Your Medicare Advantage Plan and Medicare D Prescription Plan are administered by Blue Medicare Advantage." "The required premium is set by the Trustees and will vary based on whether you are Medicare-eligible."
   - **Not mentioned:** Part B reimbursement.
   - **Classification:** retiree_health post65 (verified). part_b unknown, probably none.
   - **Source:** https://members.carpenters.fund/benefit-coverage/retiree-health-coverage/

8. **Tri State Joint Fund** (CT, EIN 060850110). Cheshire CT, Teamster locals.
   - **Secondary source (GuideStar summary):** the fund provides self-insured "hospital, surgical, prescription drug, home health care and death benefits for 11,238 active and retired members plus their dependents."
   - **What was tried:** the GuideStar page returned 403 on direct fetch, and no fund website was found.
   - **Classification:** retiree_health unknown (retirees covered, Medicare terms not found), part_b unknown.

9. **North Atlantic States Carpenters Health Benefits Fund** (MA, EIN 046374357). Fund office phone 800-344-1515 (New England).
   - **Fund page quotes:** "The Retiree Health Benefits Plan provides comprehensive medical, prescription drug and vision benefits to eligible retirees and their dependents." "Coverage is available to eligible retirees and dependents who are under age 65 and not otherwise eligible for Medicare."
   - **Look-alike, excluded:** the fund's separate NY Hours-Based Health Fund says it "sponsors comprehensive medical, prescription drug and vision benefits to Medicare eligible retirees through the Blue Medicare Advantage Plan". It appears to be a different benefit fund (https://www.carpentersfund.org/ny-hours-based-health-fund/).
   - **Classification:** retiree_health to65 for this plan (verified). part_b unknown.
   - **Source:** https://www.carpentersfund.org/health-fund/

10. **Operating Engineers Health and Welfare Fund** (CA, EIN 956034886). IUOE Local 12, administered by Operating Engineers Funds Inc., 100 Corson St, Pasadena CA.
   - **Monthly-rates page:** retiree premiums include "If you have Medicare" single coverage at $218 (Fee-for-Service), $114 (Limited) and $68 ("M" Plan) (verified).
   - **Part B (secondary):** the search-engine summary of the fund's retiree pages said retirees in the Medicare Advantage and other full plans "must be enrolled in Medicare Parts A and B and pay your Part B premium". I could not reach the exact page to confirm the wording.
   - **Classification:** retiree_health post65. part_b none (secondary).
   - **Source:** https://www.oefi.org/retiree-health-and-welfare/benefit-summaries/monthly-rates/

11. **Pipe Fitters Welfare Fund, Local 597** (IL, EIN 362141703). 45 N Ogden Ave, Chicago, 312-633-0597.
   - **Fund page quote:** "The Trustees have retained Retiree First… to assist you with the Humana® Medicare Advantage Prescription Drug Plan (MAPD)."
   - **Not mentioned:** Part B. The 2026 Humana MAPD FAQ PDF was not read.
   - **Classification:** retiree_health post65 (verified), part_b unknown.
   - **Source:** https://www.pf597.org/welfare-fund/humana-mapd-and-retiree-first/

12. **Electrical Insurance Trustees** (IL, EIN 361033970).
   - **What was found:** no fund document. Search results were look-alikes: SoCal IBEW-NECA, NYPA and JIB.
   - **Classification:** unknown/unknown.

13. **FELRA and UFCW VEBA Fund** (MD, EIN 521036978).
   - **What was found:** no fund document.
   - **Classification:** unknown/unknown.

14. **Ohio Operating Engineers Health and Welfare Plan** (OH, EIN 314446857).
   - **What was found:** no fund document. Results were OPERS and OEFI (Local 12, CA), which are look-alikes and were excluded.
   - **Classification:** unknown/unknown.

15. **Cleveland Bakers and Teamsters Health and Welfare Fund** (OH, EIN 340753693). Fund office reportedly at 9665 Rockside Rd, Valley View OH (secondary).
   - **Lead (secondary, about the pension fund):** a RetireeFirst webinar recap names Carl Pecoraro as Fund Chairman of the Cleveland Bakers and Teamsters Pension Fund and mentions "enhanced retiree benefits", which suggests a retiree MA/Medigap exchange arrangement.
   - **Classification:** unknown/unknown.

16. **Locals 302 & 612 IUOE Construction Industry Health and Security Plan** (WA, EIN 916028570).
   - **Administrator:** Welfare & Pension Administration Service (WPAS), Mercer Island WA. The site returned 403.
   - **Classification:** unknown/unknown.

17. **Central States, Southeast & Southwest Areas H&W Plan, Active Plan** (IL, EIN 362154936). TeamCare, 8647 W. Higgins Rd, Chicago IL 60631.
   - **Where retirees are covered:** retiree coverage sits in the fund's separate Retiree Plan.
   - **Retiree Plan Document §10.19 (as amended through 1/1/2026):** "TeamCare Advantage, administered by Humana, combines Medicare Part A (hospital), Part B … and Part D … Each eligible Participant and Spouse will be responsible for Medicare Part B payments and for benefit-related co-insurance and co-payments."
   - **Classification:** retiree_health post65 via the Retiree Plan. part_b none (verified).
   - **Source:** https://myTeamCare.org/-/media/TeamCare/Files/Plan-Documents/TeamCare-Plan-Document-Retiree-R4.pdf

18. **Southeastern Carpenters and Millwrights Health Plan** (TN, EIN 586066597).
   - **What was found:** no document. All participants are non-active, suggesting a retiree-only plan (inferred).
   - **Classification:** unknown/unknown.

19. **Southern California Pipe Trades Pensioners & Surviving Spouses Health Fund** (CA, EIN 274271742).
   - **Secondary source (GuideStar summary):** the fund "provided benefit payments for medical, hospitalization, and prescription drug benefits to approximately 1,957 retired participants and their beneficiaries."
   - **Classification:** retiree_health post65 likely (secondary). part_b unknown.
   - **Look-alike, excluded:** LAFPP's Part B reimbursement program is a public-sector plan.

20. **Mason Tenders' District Council Welfare Fund** (NY, EIN 135537605).
   - **Fund page:** the Welfare Fund provides benefits for "eligible active and retired participants and their eligible dependents."
   - **Not found:** Medicare and Part B terms. The SPD is only on the member portal.
   - **Classification:** retiree_health unknown (retirees covered), part_b unknown.
   - **Source:** https://member.mtdctrustfunds.org/welfare/

21. **Pipe Trades Services MN Retiree Health Fund (RHT)** (MN, EIN 161657260). White Bear Lake MN.
   - **PTSMN Welfare Fund SPD (2024):** "If you are a Medicare-Eligible Retiree, the amount of your Contribution Allowance is equal to $14.073 per Service Credit per month… a Retiree who is age 66 and has 20 Service Credits will be $281.46 per month."
   - **What the allowance pays for:** it reduces the premium for the Welfare Fund's own coverage. Medicare-eligible retiree benefits "are provided through insured Medicare Advantage and Medicare Supplement (Medigap) plans", and retirees "must enroll in both Medicare Parts A and B."
   - **Classification:** part_b none. The allowance pays for fund coverage, not Part B. verified.
   - **Source:** https://www.ptsmn.org/pdf/PTSMN%20Welfare%20SPD%202024-131574095-v2.pdf

22. **Milwaukee Drivers Health & Welfare Fund** (WI, EIN 396048358).
   - **What was found:** no document.
   - **Classification:** unknown/unknown.

23. **NBA Players' Health and Welfare Benefit Plan** (VA, EIN 201260597).
   - **2024 benefits guide quote:** "Once you are credited with three years of NBA service… Eligible retired players may elect retiree healthcare coverage through UnitedHealthcare® for themselves and, in some cases, their families at no charge to the player for the cost of premiums for such coverage."
   - **Secondary (2016 press):** Medicare-eligible tiers exist.
   - **Classification:** retiree_health post65. part_b unknown.
   - **Source:** https://cdn.cosmicjs.com/dd3865a0-b349-11ef-bee4-3bb1d3c55332-2024-NBA-Players-BAAG---Global-Plan42.pdf

24. **Iron Workers Locals 40, 361 & 417 Health Fund** (NY, EIN 135622663).
   - **What was found:** no document.
   - **Classification:** unknown/unknown.

25. **Topping Out Fund of the Iron Workers Locals 40, 361 & 417** (NY, EIN 133156507).
   - **Secondary source (Charity Navigator summary):** the mission is to "provide death, disability, unemployment and unreimbursed medical expense benefits to eligible participants."
   - **Classification:** possibly an HRA-like benefit (inferred); part_b unknown.
   - **Source:** https://www.charitynavigator.org/ein/133156507

26. **Harrison Electrical Workers Trust Fund** (OR, EIN 936023048).
   - **What was found:** only a low-quality aggregator page referring to a "Harrison Electrical Workers Trust Fund Retiree Medical Plan". No fund document.
   - **Classification:** unknown/unknown.

27. **Mid-Atlantic Regional Council of Carpenters Health Fund** (MD, EIN 526051383).
   - **What was found:** no document.
   - **Classification:** unknown/unknown.

28. **Suburban Teamsters of Northern Illinois Welfare Fund** (IL, EIN 366158494).
   - **What was found:** no document.
   - **Classification:** unknown/unknown.

29. **Local 443 Transportation Health Service & Insurance Plan** (CT, EIN 060942913).
   - **What was found:** no document. The Teamsters Local 404 and 25 plans in results are look-alikes and were excluded.
   - **Classification:** unknown/unknown.

30. **Seafarers Health and Benefits Plan** (MD, EIN 135557534). Pensioner line (800) 252-4674.
   - **Pensioner health benefits section (10/2021) quote:** "If you are eligible for pensioner health benefits, and you are Medicare-eligible, you must enroll in Medicare Parts A and B when your eligibility as an active employee ends. Once you do so, the Plan will pay you an additional benefit of $50 a month to help pay your Medicare premium. Your spouse must also enroll in Medicare Parts A and B when he or she becomes Medicare-eligible. If you are enrolled in Medicare, the Plan will pay another $50 benefit to help with your spouse's Medicare premium."
   - **Part D:** the plan pays for Part D through Retiree RxCare.
   - **Classification:** part_b flat (verified; the document is dated 2021).
   - **Not read:** a November 2024 notice to Medicare pensioners exists but returned 403: https://www.seafarers.org/seafarerslogs/2024/11/notice-to-medicare-pensioners-eligible-for-health-benefits-from-shbp/
   - **Source:** https://www.seafarers.org/wp-content/uploads/2022/03/6.-Health-Benefits-for-Pensioners-10-2021.pdf

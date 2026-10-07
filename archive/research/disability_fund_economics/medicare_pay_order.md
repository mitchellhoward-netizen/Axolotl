# Medicare vs. the fund: who pays first for a disabled member (SSDI → Medicare)

Researched 2026-10-07. Labels: **verified** = read in the primary source at the URL;
**secondary** = reputable non-primary source; **inferred** = our reasoning from verified text.
eCFR HTML pages redirect to a bot-check, so CFR text was pulled from the eCFR versioner API
(point-in-time 2026-10-01). The U.S. Code was read on law.cornell.edu.

## Summary: what this means for whether SSDI saves a fund money

1. Medicare is secondary to a fund's plan for a disabled under-65 member only if **both** are true: the plan is a "large group health plan" **and** the member (or a family member) is covered "by virtue of current employment status" (CES).
2. For a Taft-Hartley fund the size test is almost always met. If any one contributing employer had 100+ employees, the 100-employee rule applies to every member, including those working for small shops. For the disabled there is no small-employer exception election (that election exists only for the working aged).
3. So everything turns on CES. A member who has stopped working loses CES once **any** of these is true: he gets SSDI; he has had employer disability benefits for more than 6 months; or his coverage is COBRA.
4. By the time Medicare starts (the 25th month of SSDI entitlement), the member is by definition getting SSDI. If he is not actively working, he cannot meet the hour-bank / retained-employment-rights test, so **Medicare is primary from the first month of Medicare entitlement.** That holds even if an hour bank or a fund disability extension is still carrying his eligibility.
5. Medicare is also primary over COBRA continuation coverage and over retiree coverage for disability-based Medicare.
6. Once Medicare is primary, the MSP "taking into account" bans (42 CFR 411.108) no longer bind the plan for that person. They protect only people covered by virtue of CES. On a plain reading of the regulations, the fund can pay secondary, carve out, or coordinate as if Part B paid. Its plan document controls, and other laws not reviewed here may limit it.
7. Exceptions: **ESRD** (dialysis or transplant) puts the plan primary for a 30-month coordination period whatever the employment status, including COBRA and retiree coverage. **ALS** removes the 24-month Medicare wait and the 5-month SSDI wait, so Medicare starts with the first month of SSDI.
8. Retroactive SSDI awards (up to 12 months before the application) can make Medicare entitlement start in the past. Medicare's 1-year claim-filing limit is extended to the end of the 6th month after the retroactive-entitlement notice. CMS gives no mechanism for the fund to bill Medicare directly. Getting the money back depends on the fund recouping from providers, who then rebill Medicare. That is an operational risk.
9. Bottom line (inferred): for members who are **not** returning to work, getting SSDI and then Medicare legally moves the fund to secondary payer. The fund's savings run from Medicare month 1, about 29 months after disability onset (5-month waiting period plus 24 months; ALS has no wait).
10. The savings only come through if the member enrolls in Part B (or the plan coordinates as if he had), and if the fund (a) updates eligibility promptly and (b) chases retroactive months before provider and Medicare filing windows close.

## Findings

### 1. "Current employment status" (CES): definition, the 6-month rule, hour banks

**1a. verified.** 42 CFR 411.104(a): "An individual has current employment status if— (1) The individual is actively working as an employee ... or (2) The individual is not actively working and— (i) Is receiving disability benefits from an employer for up to 6 months (the first 6 months of employer disability benefits are subject to FICA taxes); or (ii) Retains employment rights in the industry and has not had his employment terminated by the employer ... (or has not had his membership in the employee organization terminated, if the employee organization provides the coverage), is not receiving disability benefits from an employer for more than 6 months, **is not receiving disability benefits from Social Security**, and has GHP coverage that is not pursuant to COBRA continuation coverage ... Whether or not the individual is receiving pay during the period of nonwork is not a factor."
URL: https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-B/part-411/subpart-E/section-411.104 (text via eCFR API, 2026-10-01 version). Accessed 2026-10-07.

**1b. verified.** 42 CFR 411.104(b): persons who retain employment rights include "(1) Persons who are furloughed, temporarily laid off, or who are on sick leave; ... (3) Persons who have health coverage that extends beyond or between active employment periods; for example, based on an hours bank arrangement. (Active union members often have hours bank coverage.)" Same URL, accessed 2026-10-07.

**1c. verified.** The MSP Manual (Pub. 100-05) Ch. 2 §10.5.B adds to that list: "Those who take an employer-approved temporary leave of absence for any reason. Temporary leaves of absence include, but are not limited to, periods when an individual qualifies for short-term or long-term medical disability." On the 6-month rule, §10.5.A says: "Employer disability payments are subject to FICA tax for the first six months of disability after the last calendar month in which the employee worked for that employer." Its example: a worker stopped in Dec 2021 and got employer disability pay from Jan 2022. "Medicare is the secondary payer through June 2022. Beginning with July 2022, Medicare becomes the primary payer."
URL: https://www.cms.gov/regulations-and-guidance/guidance/manuals/downloads/msp105c02.pdf (Rev. 12436, 12-28-23). Accessed 2026-10-07.

**1d. verified.** Statute: 42 U.S.C. 1395y(b)(1)(E)(ii): "An individual has 'current employment status' with an employer if the individual is an employee, is the employer, or is associated with the employer in a business relationship."
URL: https://www.law.cornell.edu/uscode/text/42/1395y. Accessed 2026-10-07.

**1e. inferred (applies 1a–1c to a fund member).** Take a member who stopped working and is kept eligible by an hour bank or a fund disability extension. Before SSDI, he may still have CES under (a)(2)(ii): he retains employment rights and is not on employer disability benefits for more than 6 months. Once he is "receiving disability benefits from Social Security", (a)(2)(ii) fails. (a)(2)(i) also fails once employer disability benefits pass 6 months. Medicare-by-disability starts only in the 25th month of SSDI entitlement, so a non-working member who reaches Medicare has, by construction, lost CES. The manual's "temporary leave ... short- or long-term disability" wording describes *retaining employment rights*. It does not override the separate SSDI and 6-month conditions in the regulation.

### 2. "Large group health plan" (LGHP) and multiemployer aggregation

**2a. verified.** 42 CFR 411.101: "Large group health plan (LGHP) means a GHP that covers employees of either— (1) A single employer or employee organization that employed at least 100 full-time or part-time employees on 50 percent or more of its regular business days during the previous calendar year; or (2) Two or more employers, or employee organizations, at least one of which employed at least 100 full-time or part-time employees on 50 percent or more of its regular business days during the previous calendar year." The GHP definition expressly includes "union plans, employee health and welfare funds", and "Multi-employer plan means a plan that is sponsored jointly ... by employers and unions (sometimes under the Taft-Hartley law)."
URL: https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-B/part-411/subpart-E/section-411.101. Accessed 2026-10-07.

**2b. verified.** Statute: LGHP is defined by reference to IRC 5000(b)(2) (42 U.S.C. 1395y(b)(1)(B)(iii)). 26 U.S.C. 5000(b)(2): "...that covers employees of at least one employer that normally employed at least 100 employees on a typical business day during the previous calendar year."
URLs: https://www.law.cornell.edu/uscode/text/42/1395y ; https://www.law.cornell.edu/uscode/text/26/5000. Accessed 2026-10-07.

**2c. verified. No small-employer election for the disabled.** MSP Manual Ch. 2 §30.2: "Medicare is secondary for all employees enrolled in the plan if a plan is a multi- employer plan, such as a union plan which covers employees of some small employers and also employees of at least one employer that meets the 100-or- more employee requirement, including those that work for small employers. The exception discussed in this chapter, with respect to the working aged provision, does not apply to the Medicare as secondary for the disabled provision." Ch. 2 §10.4 adds: "The MSP contractor shall not make an exception for beneficiaries entitled to Medicare based on permanent kidney failure (End-Stage Renal Disease) or Disability."
URL: https://www.cms.gov/regulations-and-guidance/guidance/manuals/downloads/msp105c02.pdf. Accessed 2026-10-07.

**2d. verified.** The working-aged small-employer exception exists by statute only for the aged (1395y(b)(1)(A)(iii): "...shall only apply if the plan elects treatment under this clause") and in 42 CFR 411.172(b) (aged subpart G). The disabled provision, 1395y(b)(1)(B), has no parallel clause. URL: https://www.law.cornell.edu/uscode/text/42/1395y. Accessed 2026-10-07.

**2e. verified.** Section 111 GHP User Guide v7.9 (July 13, 2026) §8.5.1: "If an employer participates in a multi-employer GHP and at least one participating employer has at least 100 full and/or part-time employees, the MSP rules apply to all individuals entitled to Medicare based on disability, including those associated with the employer having fewer than 100 full and/or part-time employees."
URL: https://www.cms.gov/files/document/mmsea-section-111-ghp-user-guide-version-7-9-july-13-2026.pdf. Accessed 2026-10-07.

### 3. Medicare primary when the member lacks CES, for COBRA, and for retiree coverage

**3a. verified.** The rule that makes Medicare secondary for the disabled requires CES. 42 CFR 411.204(a): "Medicare benefits are secondary to benefits payable by an LGHP for services furnished during any month in which the individual— (1) Is entitled to Medicare Part A benefits under § 406.12 ...; (2) Is covered under an LGHP; and (3) Has LGHP coverage by virtue of his or her own or a family member's current employment status." 42 CFR 411.102(c): an LGHP "may not take into account the disability-based Medicare entitlement of any individual who is covered ... under the plan by virtue of current employment status."
URL: https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-B/part-411 (subparts E, H). Accessed 2026-10-07.

**3b. verified.** MSP Manual Ch. 2 §30.1, "Medicare is not secondary under the MSP provision for disabled individuals: ... Covered by an LGHP as a result of past employment (e.g., as a retired former employee or as the spouse of a retired former employee) and whose coverage is not also based on current employment status..."
URL: https://www.cms.gov/regulations-and-guidance/guidance/manuals/downloads/msp105c02.pdf. Accessed 2026-10-07.

**3c. verified (COBRA).** 42 CFR 411.108(b)(2): "Medicare is primary payer for this beneficiary because, although he or she has current employment status, the GHP coverage is by virtue of the COBRA law rather than by virtue of the current employment status." MSP Manual Ch. 1 §10 (COBRA): "For aged or disabled Medicare beneficiaries, COBRA continuation coverage is secondary to Medicare ... For an ESRD related Medicare beneficiary, COBRA continuation coverage, if elected, is primary to Medicare during the 30-month ESRD coordination period."
URLs: eCFR 411.108 (as above); https://www.cms.gov/regulations-and-guidance/guidance/manuals/downloads/msp105c01.pdf (Rev. 11755, 12-21-22). Accessed 2026-10-07.

**3d. verified (COBRA may end at Medicare).** 29 U.S.C. 1162(2)(D)(ii): COBRA may end on "The date on which the qualified beneficiary first becomes, after the date of the election— ... entitled to benefits under title XVIII". The SSDI-disabled 29-month extension: "any reference in clause (i) or (ii) to 18 months is deemed a reference to 29 months".
URL: https://www.law.cornell.edu/uscode/text/29/1162. Accessed 2026-10-07.

**3e. verified (CMS consumer chart).** "If you have retiree health coverage ... Medicare pays first." "If you're under 65 and have a disability, have group health plan coverage based on your or a family member's current employment, and the employer has 100 or more employees... Your group health plan pays first." (The publication notes it "isn't a legal document".)
URL: https://www.medicare.gov/media/5226 (CMS Product No. 11546, January 2026). Accessed 2026-10-07.

### 4. Carve-outs, Medicare-eligible exclusions, required Part B: what 411.108 bans, and for whom

**4a. verified.** 42 CFR 411.108(a) lists acts that "constitute taking into account", including: "(2) Offering coverage that is secondary to Medicare to individuals entitled to Medicare. (3) Terminating coverage because the individual has become entitled to Medicare, except as permitted under COBRA ... (4) In the case of a LGHP, denying or terminating coverage because an individual is entitled to Medicare on the basis of disability without denying or terminating coverage for similarly situated individuals ... (5) Imposing limitations on benefits for a Medicare entitled individual ... (9) Providing misleading or incomplete information that would have the effect of inducing a Medicare entitled individual to reject the employer plan, thereby making Medicare the primary payer. ... (10) ... instructions to bill Medicare first ... without stipulating that such action may be taken only when Medicare is the primary payer."
URL: https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-B/part-411/subpart-E/section-411.108. Accessed 2026-10-07.

**4b. verified (scope).** The disability ban reaches only CES-based coverage: 411.102(c) and 411.200(b) ("may not take into account the Medicare entitlement of a disabled individual who is covered ... by virtue of his or her own current employment status or that of a member of his or her family"). For ESRD, by contrast, the ban covers a "group health plan of any size" (411.102(a)). Same eCFR URL. Accessed 2026-10-07.

**4c. inferred.** For a disabled member *without* CES, the MSP rules do not stop the fund from paying secondary, carving out, or reducing benefits by an assumed Part B payment. That rests on the plan document, not on MSP. Caveats: (i) 411.108(a)(9) still bars misleading communications that push someone to drop coverage that *would be* primary; (ii) ESRD members in their 30-month period are protected whatever their status; (iii) other laws (ERISA plan terms, HIPAA/ACA nondiscrimination, ADA) were **not** reviewed here.

**4d. verified (incentives ban).** 42 U.S.C. 1395y(b)(3)(C): "It is unlawful for an employer or other entity to offer any financial or other incentive for an individual entitled to benefits under this subchapter not to enroll (or to terminate enrollment) under a group health plan or a large group health plan which would (in the case of such enrollment) be a primary plan ... civil money penalty of not to exceed $5,000 for each such violation." 42 CFR 411.103(a) uses the same wording.
URL: https://www.law.cornell.edu/uscode/text/42/1395y ; eCFR 411.103. Accessed 2026-10-07.
**inferred:** This ban is aimed at members for whom the plan "would be" primary, meaning those still working with CES. Helping a non-working member obtain SSDI, where the plan is already secondary by law once Medicare starts, does not on its face fall within it. Any Mycelium outreach to members who are *still working* (CES) must not encourage them to drop the plan.

**4e. verified (penalties for getting it wrong).** IRC 5000(a): a tax "equal to 25 percent of the employer's or employee organization's expenses incurred during the calendar year for each group health plan to which the employer or employee organization contributes" if the plan is nonconforming. 1395y(b)(3)(A): a private cause of action for "double the amount otherwise provided" against a primary plan that fails to pay primary.
URLs: https://www.law.cornell.edu/uscode/text/26/5000 ; https://www.law.cornell.edu/uscode/text/42/1395y. Accessed 2026-10-07.

### 5. Retroactive entitlement, claim re-coordination and recovery

**5a. verified (SSDI retroactivity).** 42 U.S.C. 423(b): "An individual who would have been entitled to a disability insurance benefit for any month had he filed application therefor before the end of such month shall be entitled to such benefit for such month if such application is filed before the end of the 12th month immediately succeeding such month." 42 U.S.C. 426(b): Part A is due "for each month beginning with ... the twenty-fifth month of his entitlement". The waiting period is "the earliest period of five consecutive calendar months" (423(c)(2)).
URLs: https://www.law.cornell.edu/uscode/text/42/423 ; https://www.law.cornell.edu/uscode/text/42/426. Accessed 2026-10-07.
**inferred:** Long SSA adjudication and appeals plus up to 12 months of retroactivity can make the 25th month fall *before* the award notice. Medicare-primary months then occur while the fund was still paying primary.

**5b. verified (Medicare filing limit and retro exception).** 42 CFR 424.44(a)(1): "the claim must be filed no later than the close of the period ending 1 calendar year after the date of service." (b)(2) extends the limit where "At the time the service was furnished the beneficiary was not entitled to Medicare" and "The beneficiary subsequently received notification of Medicare entitlement effective retroactively". (b)(5)(ii): the time is "extended through the last day of the sixth calendar month following the month in which either the beneficiary or the provider or supplier received notification of Medicare entitlement effective retroactively".
URL: https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-B/part-424/subpart-C/section-424.44 (eCFR API 2026-10-01). Accessed 2026-10-07.

**5c. verified.** Medicare Claims Processing Manual Ch. 1 §70.7.2: "More than a year later, the individual receives notification from SSA that he or she is entitled to Medicare benefits retroactive to or before the date he or she received services ... the provider or supplier may submit a request for a filing extension". It requires "an official Social Security Administration (SSA) letter notifying the beneficiary of Medicare entitlement and the effective date".
URL: https://www.cms.gov/regulations-and-guidance/guidance/manuals/downloads/clm104c01.pdf (Rev. 13725, 04-10-26). Accessed 2026-10-07.

**5d. verified (reverse direction: CMS recovering from the fund).** 42 U.S.C. 1395y(b)(2)(B)(vi): "Notwithstanding any other time limits that may exist for filing a claim under an employer group health plan, the United States may seek to recover conditional payments ... within the 3-year period beginning on the date on which the item or service was furnished." CMS also has a direct cause of action, with "double damages" available, against an "employer that sponsors or contributes to a group health plan". GHP User Guide v7.9 §5: CMS uses its Commercial Repayment Center "to recover the mistaken Medicare payment".
URLs: https://www.law.cornell.edu/uscode/text/42/1395y ; GHP User Guide URL above. Accessed 2026-10-07.

**5e. inferred / not found.** No CMS source was found that lets a GHP that overpaid as primary bill Medicare directly. The path we infer: the fund recoups its payment from the provider (under its plan terms or provider contract and any state recoupment limits), and the provider files with Medicare inside the 424.44(b)(5)(ii) window. Notably, 424.44(b)(3)–(4) give a separate extension keyed to the date of recoupment for **Medicaid** and **MA/PACE** recoupments only. There is no equivalent for a GHP recoupment. So if the fund recoups more than about 6 months after the retroactive-entitlement notice, the provider may be unable to bill Medicare. The fund then faces pushback or a write-off. (Recorded as an open question.)

### 6. ESRD and ALS

**6a. verified (ESRD 30 months, statute).** 1395y(b)(1)(C): the plan "may not take into account that an individual is entitled to or eligible for benefits ... under section 426–1 ... during the 12-month period ...". It continues: "Effective for items and services furnished on or after August 5, 1997, ... clauses (i) and (ii) shall be applied by substituting '30-month' for '12-month' each place it appears." Under 1395y(b)(1)(B)(ii), ESRD rules "shall apply instead of" the disability rule.
URL: https://www.law.cornell.edu/uscode/text/42/1395y. Accessed 2026-10-07.

**6b. verified.** 42 CFR 411.162(a)(2): "The size of employer and employment status requirements of the MSP provisions for the aged and disabled do not apply with respect to ESRD beneficiaries." 411.162(a)(1) makes Medicare secondary "to any GHP (including a retirement plan)". 411.163(b)(4) gives the exception: if the member was already disability-entitled and the plan was "justifiably" secondary (no CES), "Medicare remains the primary payer when an individual becomes eligible for Medicare based on ESRD".
URL: eCFR Part 411 subpart F. Accessed 2026-10-07.

**6c. verified (CMS consumer chart).** "If you have group health plan coverage based on your or a family member's employment or former employment, and you're eligible for Medicare because of End-Stage Renal Disease ... Your group health plan will pay first for the first 30 months". URL: https://www.medicare.gov/media/5226. Accessed 2026-10-07.

**6d. verified (ALS).** 42 U.S.C. 426(h): for ALS, "The entitlement under such subsection shall begin with the first month (rather than twenty-fifth month) of entitlement or status." 42 U.S.C. 423(a)(1)(ii) (Pub. L. 116-250, 2020): SSDI is paid for ALS "for each month beginning with the first month during all of which the individual is under a disability", which removes the 5-month waiting period.
URLs: https://www.law.cornell.edu/uscode/text/42/426 ; https://www.law.cornell.edu/uscode/text/42/423. Accessed 2026-10-07.
**inferred:** An ALS member is still subject to the CES test. If he is not working, Medicare is primary from the first month of SSDI.

### 7. Part B for disabled beneficiaries

**7a. verified (automatic enrollment).** 42 CFR 407.17(a): automatic SMI enrollment if the person "Becomes entitled to hospital insurance under any of the provisions set forth in §§ 406.10 through 406.15" and "Does not decline SMI enrollment"; (b)(1) SSA gives "at least 2 months after the month the notice is mailed" to decline. 407.18(b)(2): those entitled "on entitlement to disability benefits as a social security ... beneficiary" are "automatically enrolled in the third month of the initial enrollment period".
URL: https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-B/part-407 (eCFR API 2026-10-01). Accessed 2026-10-07.

**7b. verified (2026 premium).** Federal Register notice: "The Part B standard monthly premium rate for all enrollees for 2026 is $202.90." "The Part B annual deductible for 2026 is $283.00". "The monthly actuarial rates for 2026 are $405.40 for aged enrollees and $548.60 for disabled enrollees."
URL: https://www.govinfo.gov/content/pkg/FR-2025-11-19/html/2025-20251.htm (90 FR, Nov. 19, 2025). Accessed 2026-10-07.

**7c. verified (late penalty).** 42 CFR 408.22: "the standard monthly premium ... is increased by ten percent for each full twelve months" of late enrollment.
URL: https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-B/part-408/subpart-B/section-408.22 (eCFR API). Accessed 2026-10-07.

**7d. verified (decline Part B → secondary may not pay).** CMS consumer guidance: "If Medicare is the primary payer and your employer is the secondary payer, you may need to sign up for Medicare Part B (Medical Insurance) before your employer insurance will pay for Part B services." URL: https://www.medicare.gov/media/5226. Accessed 2026-10-07.
**inferred:** If a non-CES disabled member declines Part B, the MSP rules do not force the fund to fill the gap. Whether the fund pays as if Part B had paid depends on its plan document (see 4c). A member who declines Part B and whose plan coordinates that way is exposed to the Part B share. A fund without such a clause would end up paying primary for Part B services in practice.

**7e. verified (delayed / retroactive Part B awards, partial).** SSA POMS HI 00805.195, which covers government-delayed processing: "Award Part B prospectively beginning the month we process the award ... if the beneficiary owes six or more months of retroactive premiums", and the beneficiary may choose "The earliest possible entitlement date" if they pay the retroactive premiums.
URL: https://secure.ssa.gov/POMS.NSF/lnx/0600805195 (TN 121, 04-25). Accessed 2026-10-07.
**inferred:** In retroactive SSDI awards, Part A can be retroactive while Part B may begin only prospectively. For the retro months the fund may then be secondary to Part A but effectively primary for Part B services.

### 8. Section 111 (MMSEA) reporting by the fund

**8a. verified.** 42 U.S.C. 1395y(b)(7): insurers, TPAs, or (if self-insured and self-administered) the "plan administrator or fiduciary" must "secure from the plan sponsor and plan participants such information as the Secretary shall specify for the purpose of identifying situations where the group health plan is or has been— (I) a primary plan". Penalty: "$1,000 for each day of noncompliance for each individual". URL: https://www.law.cornell.edu/uscode/text/42/1395y. Accessed 2026-10-07.

**8b. verified.** GHP User Guide v7.9 §7.3.1: report as Active Covered Individuals "All individuals covered in a GHP age 45 through 64 who have coverage based on their own or a family member's current employment status", all ESRD individuals "regardless of ... employment status", and under-45s "known to be entitled to Medicare" with CES coverage. "An individual covered by a COBRA plan is not considered an Active Covered Individual" except for ESRD. §7.3.3: "Inactive Covered Individuals are people who are currently not employed ... Do NOT submit Inactive Covered Individuals on your MSP Input File." URL: GHP User Guide v7.9 (above). Accessed 2026-10-07.
**inferred:** A disabled member who moves from hour-bank CES to SSDI and non-CES status should be moved from the MSP Input File to inactive status. Leaving him reported as active would keep Medicare denying claims as secondary, which would block the savings.

## Open questions / conflicts

1. **CFR text vs. statute on the ESRD period.** 42 CFR 411.162(c)(2)(iii) still says the coordination period ends with "the 12th month" for entitlement "after September 1997". 411.100(a)(1)(ii) and 411.102(a)(2) still say "18 months". The statute (1395y(b)(1)(C)) and the MSP Manual (Ch. 1 and Ch. 2 §20.1) say **30 months**. The statute controls; the regulation was never updated.
2. **MSP Manual wording vs. regulation on CES.** Ch. 2 §10.5.A lists "His or her employment terminated by the employer" (missing "has not had"), a drafting error; Ch. 1's version reads correctly. Ch. 2 §10.5.B treats a "short-term or long-term medical disability" leave as retaining employment rights. The regulation still separately excludes anyone getting SSDI or employer disability benefits for more than 6 months. We read the manual as consistent with the regulation, not as an expansion.
3. **Fund-paid weekly disability (loss-of-time) benefits.** Do these count as "disability benefits from an employer" for the 6-month clock in 411.104(a)(2)? This was not resolved for multiemployer trusts. It only matters before SSDI begins, so it does not change the Medicare-month outcome.
4. **Members who go back to work.** A disabled Medicare beneficiary who returns to covered work (for example, during an SSDI trial work period) regains CES, and the fund is primary again (MSP Manual Ch. 2 §30.3). We did not research how often this happens or Medicare's extended-coverage rules.
5. **Recovering retroactive months.** We found no CMS process for a GHP to be reimbursed directly. The provider's Medicare filing extension runs 6 months from notice of retroactive entitlement, not from the GHP recoupment date (unlike the Medicaid and MA cases). State laws limiting payer recoupment from providers were not reviewed.
6. **Part B for retroactive months.** Whether SSA makes Part B retroactive by default in a retroactive SSDI award (rather than in a delayed-processing case) was not confirmed. POMS HI 00805.090 and .165 should be read next.
7. **Laws outside MSP.** ERISA, HIPAA/ACA nondiscrimination, and ADA limits on a "Medicare-eligible" carve-out for non-CES disabled members were not reviewed. Counsel should confirm before any plan amendment.
8. **The 2026 Section 111 guide** (v7.9) shows an OMB control-number expiration that one search snippet suggested had passed. This was not material and not verified.

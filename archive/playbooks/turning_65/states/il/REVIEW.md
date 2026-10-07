# Review notes: Turning 65 (Medicare enrollment, penalties, coordination, Medigap), Illinois

For a reviewer who knows Medicare and Illinois Medigap law. Built 2026-10-07.
Almost everything is federal (`../../federal/`); the Illinois part adds the
Medigap "Birthday Law", under-65 Medigap rights, SHIP and the Benefit Access
Program. Rules are in `playbook.yaml`, numbers in `parameters/t65_il.yaml`,
snapshots in `../../snapshots/`.

## What is solid

- **Federal windows, penalties, IRMAA and coordination** (see the federal part).
- **Birthday Law, from the statute** (second pass, ilga.gov): 215 ILCS
  5/363(8): ages "at least 65 ... but no more than 75" with an existing Medigap
  policy, 45 days "commencing with the individual's birthday", equal or lesser
  benefits, no health-based denial or pricing. Public Act 102-0142 added it
  effective January 1, 2022 (same issuer only); Public Act 103-0747 added "or
  any affiliate authorized to transact business in this State" effective
  January 1, 2026 (Section 99 of each Act). The Department on Aging guide
  agrees. T65-IL-CONFLICT-01 is resolved; the archive switches the affiliate
  wording on at 2026-01-01 (parameter il.idoi.medigap_birthday_affiliate_allowed).
- **Notice**: the insurer must give notice of the right when the Medigap
  application is made, not before each birthday (corrects the first build,
  which took a 30-60-day pre-birthday notice from secondary summaries).
- **Under-65 rights**: disabled Medicare beneficiaries have the same Medigap
  open enrollment rights as 65+, plus a new 6-month window at 65 (same guide).
- **SHIP** (Senior HelpLine 1-800-252-8966) and **Benefit Access** income limits
  ($33,562 / $44,533 / $55,500).

## Assumptions made

1. The birthday window runs from the birthday through the 44th day after it.
2. Ages 65 to 75 are inclusive at both ends (a 75-year-old qualifies, a
   76-year-old does not).
3. Who counts as an "affiliate" is not defined in Sec. 363(8); the archive
   reports the affiliate right as a flag (`medigap_birthday_affiliate_allowed`)
   and does not model insurer corporate structure.
4. Benefit Access income is approximated from monthly income x 12; it is a link
   only.

## Weakest parts

- **The 2024 enactment date of P.A. 103-0747** was not captured (the bill
  status page renders by script); only its January 1, 2026 effective date
  matters for eligibility.
- **"Reported effective 2025"** from the earlier research is refuted by the
  Public Acts: 2022 for the rule, 2026 for the affiliate wording.
- **Proof of a birthday-window switch** (T65-IL-OQ-03) is not established.
- **No Illinois drug-cost program** was found (Illinois Cares Rx ended); open
  question T65-IL-OQ-02.

## Questions for an Illinois benefits expert

1. Has the Department of Insurance prescribed the notice form Sec. 363(8)
   allows, and how do insurers document a birthday-window issue?
2. Which companies count as "affiliates" for the 2026 expansion in practice?
3. Is Blue Cross Blue Shield of Illinois still the year-round guaranteed-issue
   Medigap company (the 2026 guide says so)?

## Cross-checks

`crosscheck/results/turning_65.md`: 10 Illinois households agree with
PolicyEngine US 2.29.14 on Part A premium, Part B premium with IRMAA and Part D
IRMAA. PolicyEngine does not model enrollment periods, penalties, coordination
of benefits or Medigap rules.

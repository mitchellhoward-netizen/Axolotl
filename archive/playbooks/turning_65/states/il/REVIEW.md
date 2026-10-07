# Review notes: Turning 65 (Medicare enrollment, penalties, coordination, Medigap), Illinois

For a reviewer who knows Medicare and Illinois Medigap law. Built 2026-10-07.
Almost everything is federal (`../../federal/`); the Illinois part adds the
Medigap "Birthday Law", under-65 Medigap rights, SHIP and the Benefit Access
Program. Rules are in `playbook.yaml`, numbers in `parameters/t65_il.yaml`,
snapshots in `../../snapshots/`.

## What is solid

- **Federal windows, penalties, IRMAA and coordination** (see the federal part).
- **Birthday Law** as the Illinois Department on Aging states it (2026 Medicare
  Choices, p. 11): ages 65-75 with an existing Medigap policy, 45 days from the
  birthday, equal or lesser benefits, same issuer or an Illinois-authorized
  affiliate, no health-based denial or pricing.
- **Under-65 rights**: disabled Medicare beneficiaries have the same Medigap
  open enrollment rights as 65+, plus a new 6-month window at 65 (same guide).
- **SHIP** (Senior HelpLine 1-800-252-8966) and **Benefit Access** income limits
  ($33,562 / $44,533 / $55,500).

## Assumptions made

1. The birthday window runs from the birthday through the 44th day after it.
2. Ages 65 to 75 are inclusive at both ends (a 75-year-old qualifies, a
   76-year-old does not).
3. The "affiliate" expansion is applied for 2026 without deciding when it began
   (T65-IL-CONFLICT-01).
4. Benefit Access income is approximated from monthly income x 12; it is a link
   only.

## Weakest parts

- **The statute (215 ILCS 5/363) and Public Acts 102-0142 / 103-0747 were not
  retrieved**: ilga.gov failed TLS from scripts and returned HTTP 503 to
  WebFetch. The rule rests on the Department on Aging's guide (primary, state
  agency) and the NAIC chart (secondary) (T65-IL-OQ-01).
- **Start date (January 1, 2022)** comes only from the NAIC chart.
- **"Reported effective 2025"** from the earlier research is not supported:
  2022 for the rule, 2026 for the affiliate wording per the state guide.
- **No Illinois drug-cost program** was found (Illinois Cares Rx ended); open
  question T65-IL-OQ-02.

## Questions for an Illinois benefits expert

1. Exact text of 215 ILCS 5/363 on the annual open enrollment: 45 days from the
   birthday? ages "at least 65 but no more than 75"? notice timing?
2. When did the affiliate wording take effect (2024 enactment, 2025 or 2026)?
3. Is Blue Cross Blue Shield of Illinois still the year-round guaranteed-issue
   Medigap company (the 2026 guide says so)?

## Cross-checks

`crosscheck/results/turning_65.md`: 10 Illinois households agree with
PolicyEngine US 2.29.14 on Part A premium, Part B premium with IRMAA and Part D
IRMAA. PolicyEngine does not model enrollment periods, penalties, coordination
of benefits or Medigap rules.

# Review notes: Turning 65 (Medicare enrollment, penalties, coordination, Medigap), California

For a reviewer who knows Medicare and California Medigap law. Built
2026-10-07. Almost everything is federal (`../../federal/`); the California part
adds the Medigap birthday rule, California's extra Medigap guaranteed-issue
events, and HICAP. Rules are in `playbook.yaml`, numbers in
`parameters/t65_ca.yaml`, snapshots in `../../snapshots/`.

## What is solid

- **Federal windows, penalties, IRMAA and coordination** (see the NY review and
  the federal part).
- **Birthday rule length: 60 days** from the birthday, to a policy with the same
  or lesser benefits, without medical screening or a new waiting period
  (CDI Senior Alert SA-01-10B, primary; NAIC chart agrees).
- **Extra California rights**: guaranteed issue when an employer stops covering
  all of the 20% coinsurance; open enrollment rights when COBRA/Cal-COBRA ends
  or a person becomes eligible only for share-of-cost Medi-Cal (CDI).
- **HICAP**: 1-800-434-0222 (California Department of Aging).

## Assumptions made

1. The birthday window is modelled as the birthday through the 59th day after
   it (60 days counting the birthday). The NAIC chart says "60 days or more";
   the statute was not read.
2. The birthday rule is applied only to people who already have a Medigap
   policy (CDI: "If you already have Medigap insurance").
3. The archive uses the 60-day length only from 2026 (the earliest date of a
   primary copy); earlier years are not evaluated (T65-CA-CONFLICT-01).

## Weakest parts

- **The statute (Insurance Code 10192.11 / Health and Safety Code 1358.11) is
  not snapshotted**: leginfo.legislature.ca.gov refused both scripts and
  WebFetch (HTTP 403). The rule rests on CDI's consumer advisory, which is dated
  2010 but states the 60-day length adopted (per secondary sources) in 2020
  (T65-CA-OQ-01).
- **Deadlines for the extra California rights** (days after COBRA ends, etc.)
  were not found (T65-CA-OQ-02).
- **No California drug-cost program** comparable to New York's EPIC was found;
  not established either way (T65-CA-OQ-03).

## Questions for a California benefits expert

1. Is the birthday window exactly 60 days starting on the birthday, and does it
   apply to under-65 and ESRD Medigap holders?
2. How long after COBRA/Cal-COBRA ends does the open enrollment right last?
3. Is there any state pharmaceutical assistance (or Medi-Cal Rx discount) that a
   new 65-year-old Californian should be checked for?

## Cross-checks

`crosscheck/results/turning_65.md`: 10 California households (same premium set
as New York) agree with PolicyEngine US 2.29.14 on Part A premium, Part B
premium with IRMAA and Part D IRMAA. PolicyEngine does not model enrollment
periods, penalties, coordination of benefits or Medigap, so the birthday rule
and SEP cases were not cross-checked.

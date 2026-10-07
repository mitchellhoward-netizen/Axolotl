# Review notes: Turning 65 (Medicare enrollment, penalties, coordination, Medigap), California

For a reviewer who knows Medicare and California Medigap law. Built
2026-10-07. Almost everything is federal (`../../federal/`); the California part
adds the Medigap birthday rule, California's extra Medigap guaranteed-issue
events, and HICAP. Rules are in `playbook.yaml`, numbers in
`parameters/t65_ca.yaml`, snapshots in `../../snapshots/`.

## What is solid

- **Federal windows, penalties, IRMAA and coordination** (see the NY review and
  the federal part).
- **Birthday rule, from the statute** (second pass): Insurance Code
  10192.11(h)(1) gives anyone covered by a Medigap policy "an annual open
  enrollment period lasting 60 days or more, commencing with the individual's
  birthday", for any policy with equal or lesser benefits, with no age limit;
  the insurer must send notice 30-60 days before the window. SB 407 (Stats.
  2019, Ch. 549) set 60 days effective January 1, 2020; its Digest says prior
  law was "a minimum of 30 days". leginfo.legislature.ca.gov still answers
  every route (scripts, WebFetch, headless Chromium, reader proxy) with a
  Cloudflare challenge, so the text was taken from the Legislative Counsel's
  official bulk dataset (downloads.leginfo.legislature.ca.gov) and imported.
- **Extra California rights**: guaranteed issue when an employer stops covering
  all of the 20% coinsurance; open enrollment rights when COBRA/Cal-COBRA ends
  or a person becomes eligible only for share-of-cost Medi-Cal (CDI). For loss
  of employer, retiree, COBRA or Cal-COBRA coverage, 10192.11(e) gives six
  months after the termination notice.
- **HICAP**: 1-800-434-0222 (California Department of Aging).

## Assumptions made

1. The birthday window is modelled as the birthday through the 59th day after
   it (60 days counting the birthday). The statute says "60 days or more", so
   60 is a floor; an insurer may allow longer.
2. The birthday rule is applied only to people who already have a Medigap
   policy (CDI: "If you already have Medigap insurance").
3. The 30-day window before 2020 is carried only from 2019-10-07 (the date of
   the SB 407 Digest that describes it); when the 30-day rule began was not
   researched. T65-CA-CONFLICT-01 is resolved.
4. Health and Safety Code 1358.11 (health-plan Medigap contracts) was amended
   by the same bill and is assumed to match 10192.11(h); it was not separately
   snapshotted.

## Weakest parts

- **The statute copy comes from bulk data, not the leginfo page** (Cloudflare
  blocks it). It is the Legislative Counsel's own dataset, so it is treated as
  primary; the snapshot's header line records which table row it came from.
- **Deadlines for the employer-coinsurance and share-of-cost Medi-Cal rights**
  were not found (T65-CA-OQ-02); the COBRA/Cal-COBRA deadline is answered
  (six months, 10192.11(e)) but not coded in rules.py.
- **No California drug-cost program** comparable to New York's EPIC was found;
  not established either way (T65-CA-OQ-03).

## Questions for a California benefits expert

1. 10192.11(h) has no age limit: do insurers in practice honour the birthday
   window for under-65 (disabled) and ESRD Medigap holders?
2. How long does the right last when an employer stops covering the 20%
   coinsurance, and for share-of-cost Medi-Cal?
3. Is there any state pharmaceutical assistance (or Medi-Cal Rx discount) that a
   new 65-year-old Californian should be checked for?

## Cross-checks

`crosscheck/results/turning_65.md`: 10 California households (same premium set
as New York) agree with PolicyEngine US 2.29.14 on Part A premium, Part B
premium with IRMAA and Part D IRMAA. PolicyEngine does not model enrollment
periods, penalties, coordination of benefits or Medigap, so the birthday rule
and SEP cases were not cross-checked.

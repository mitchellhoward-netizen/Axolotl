# Review notes: CalFresh, California

For a reviewer who knows CalFresh. Built 2026-10-07 from CDSS ACINs/ACLs and
CDSS pages (all retrieved directly from cdss.ca.gov).

## What is solid

- **COLA figures** for FFY 2026 (ACIN I-46-25) and FFY 2027 (ACIN I-40-26):
  SUA $663 / $686, LUA $170 / $176, TUA $20 / $21, MCE/BBCE 200% limits
  ($2,610 / $2,660 for one person), federal allotments and deductions.
- **SMD**: $150 for verified medical costs $35.01-$185; actual costs over $35
  above $185; demonstration extended to September 30, 2029 (ACL 26-04).
- **SUAS** limited to elderly/disabled households under Public Law 119-21
  (ACL 25-68), ongoing cases protected until recertification.
- **ESAP** renewed October 2026 - September 2031, age 65 from March 1, 2027
  (ACL 26-58); CF 285 / CF 37 / CF 485, BenefitsCal.
- **SSI recipients eligible** since June 1, 2019; ABAWD changes from June 1,
  2026 (ACL 25-93); noncitizen changes from April 1, 2026 (ACL 25-92).

## Assumptions made

1. Every elderly/disabled household without its own heating bill gets the
   SUA through SUAS (ACL 25-68 criteria; the "not already at maximum
   allotment" condition does not change any benefit).
2. MCE excludes households with a sanctioned/IPV member (federal rule, not a
   CDSS text).
3. Child support paid is excluded from gross income (federal default).

## Weakest parts

- **CalSAWS date for the SUAS limit**: households without an elderly or
  disabled member and without heating costs come back undetermined
  (SNAP-CA-OQ-01).
- **Net income test under MCE**: unknown; one- and two-person MCE households
  with net income over 100% are undetermined (SNAP-CA-OQ-02).
- CFAP for noncitizens who lost federal eligibility not researched.

## Questions for a California benefits expert

1. When did CalSAWS automation of the SUAS limit go live?
2. Do MCE households have to meet the 100% net income test?
3. Child support paid: exclusion or deduction?
4. Does CFAP cover people who lost CalFresh under Public Law 119-21?

## Cross-checks

20 California rows run through PolicyEngine US 2.29.14; 16 agree. Three
at-limit MCE households differ because PolicyEngine computes 200% of the
poverty guideline unrounded ($2,608.33) while CDSS publishes $2,610; one FY
2027 household differs because PolicyEngine lacks the $686 FY 2027 SUA.
Explained in `crosscheck/explanations/snap.yaml`.

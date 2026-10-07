# Schema changelog

## Version 2 (2026-10-07), after the New York Medicare Savings Program build

The New York MSP playbook was built first, alone, on version 1. Reviewing it
turned up gaps that would have let errors through quietly. Version 2 fixes them;
every playbook is built or migrated to version 2.

| Change | Why |
|---|---|
| `sources[].jurisdiction` (federal, ny, ca, il, multi) is required. The validator rejects a state part citing another state's source, and a federal item "confirmed" only by a state source. | The brief forbids carrying a rule from one state to another. Version 1 could not detect it, and the v1 federal MSP base did cite a New York directive (GIS 22 MA/10) for the retroactive rule. |
| `parameters[].compare_to` is required for every `*income_limit*` / `*resource_limit*` parameter. | New York publishes MSP limits *before* the $20 disregard ($1,836), the federal tables publish them *including* it ($1,350 = 100% FPL + $20). The difference decides threshold cases, and the earlier research mixed the two ($1,856 vs $1,836). The comparison basis now has to be written down. |
| `life_events[].code` from a shared vocabulary (`common.schema.yaml#/$defs/life_event_code`). | The agent has to trigger every playbook that cares about one event ("my husband died" means MSP, SNAP, Medicaid, SSI), so events need the same names everywhere. |
| `open_questions[].priority` (high, medium, low) is required. | Reviewers need to know which gaps could produce a wrong eligibility answer. |
| `rules[].county_varies` (optional). | Some rules, not only procedure items, vary by county (CA and NY county administration). |
| `households` `also[].function`. | Cross-playbook tests call entry points other than `evaluate`, e.g. Extra Help by application. |
| Evaluators report a missing parameter for a date as `undetermined` with the parameter and date named. | Version 1 returned "open question None" for dates before the archive's data. |

Rules carried over unchanged: three-valued confidence (confirmed, secondary,
unresolved), unresolved items must name an open question, every parameter value
is effective-dated and cited, global IDs, snapshots for every source.

## Version 1 (2026-10-07)

First version, used only for the New York MSP build.

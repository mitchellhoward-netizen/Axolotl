# Domain Ontology — School / Family Liaison Agent

The data model IS the ontology: a typed relational schema (Postgres/Prisma) with
**controlled-vocabulary enums** so the agent, the DB, and the school dashboard all
speak one language. This doc maps what we already built onto it and explains the
vocabulary the LLM should emit (so its output is machine-consumable).

## The shape (the "family-side graph")

```
Guardian ──< ChildLink >── Student ──> School ──> District
   │           │    │                       │         │
   │           │    │                       │         ├── Staff (role)
   │           │    └── Case ──< Task >── Action        ├── Policy (law wiki)
   │           │                                    └── KnowledgePage (district wiki)
   │           └── Activity (longitudinal timeline)
   └── FamilyProfile (needs, challenges, notes)
```

Longitudinal isn't a graph store — it's rows with timestamps (`Case`, `Task`,
`Action`, `Activity`) that you query and embed. As it grows, the agent retrieves
the history for context → "smarter over time."

## Mapping the existing (in-memory) types → schema

| Current TypeScript (in-memory)            | Persisted as                                             |
|--------------------------------------------|-----------------------------------------------------------|
| `FamilyProfile` (children, needs, challenges, notes) | `Guardian` + `ChildLink` + `Student` + `FamilyProfile` |
| `CaseRecord` (kind, status, summary, child, contact, reminder) | `Case` (+ its `Task`s and `Action`s)            |
| `Barrier.category` (transportation/meals/bullying/health/attendance) | `Case.rootCause` (enum)              |
| `Barrier.law` / `Right.law` (statute citation)      | `Policy` (jurisdiction, domain, statute)              |
| `Barrier.contact` (name/phone/email)        | `Staff` (role = ContactRole) + `Case.contactName/contactRole` |
| `Barrier.draft` (outreach template)         | `Task` of kind `DRAFT_EMAIL` / `SEND_EMAIL` / `PLACE_CALL` |
| `Barrier.reminder` (follow-up)              | `Case.reminder` + a `Task` of kind `FOLLOW_UP`         |

## The vocabulary the LLM should emit (this is the whole point)

The agent returns **structured** values (via tool calls → the same fields), not
prose. That consistent vocabulary is what makes the MTSS analytics + dashboard
clean and queryable:

- `rootCause`: `TRANSPORTATION | HOMELESSNESS | MEALS | BULLYING | HEALTH | ACADEMIC | ATTENDANCE | LANGUAGE | BEHAVIOR`
- `tier`: `TIER_1 | TIER_2 | TIER_3`
- `intervention`: free string, but from a stable set (e.g. "mckinney-vento-transport", "free-reduced-meals", "bullying-safety-plan", "504-plan", "evaluation")
- `caseStatus`: `OPEN | AWAITING | RESOLVED`
- `task`: `{ kind, status, dueAt }` — kind is `DRAFT_EMAIL | SEND_EMAIL | PLACE_CALL | FILL_FORM | SCHEDULE_MEETING | FOLLOW_UP | REQUEST_DOCUMENT`
- `contact.role`: `PRINCIPAL | ATTENDANCE | HOMELESS_LIAISON | BUS_PASSES | COUNSELOR | SPED_COORDINATOR | NURSE | DISTRICT`

Why this matters:
- The **dashboard / school MTSS view** is just `GROUP BY root_cause, tier, case.status` over `Case` + `Task` completion stats.
- **RAG / the "wiki"** is `Policy` + `KnowledgePage` (each with a `vector` embedding) — the agent retrieves exact, per-district context instead of guessing.
- **Multi-tenant privacy** (FERPA/COPPA) is Postgres **row-level security** keyed on `guardianId` / `districtId`.

## Implementation notes

- Provider: **Postgres** (add `DATABASE_URL`). Use `pgvector` for the `embedding`
  columns and `tsvector` for full-text search.
- Swapping the in-memory store: keep the `InMemoryStore` interface, add a
  `PrismaStore` behind it so the agent code doesn't change — only the storage
  adapter. (The agent stays the brain; this is just where it writes.)
- Generate + migrate once `DATABASE_URL` is set:
  ```bash
  npx prisma migrate dev --name init
  npx prisma generate
  ```

# chuy

A [Spectrum](https://photon.codes/docs/spectrum-ts) project. Wired with: imessage.

## Environment

Before running, open `.env` and fill in the values:

From your project Settings on the [Photon dashboard](https://app.photon.codes):

- `PROJECT_ID`
- `PROJECT_SECRET`

## Run

```sh
npm install
npm run start
```

## What's wired in

`src/index.ts` runs a parent↔school agent that works for **ANY parent in ANY
school/district** — there is no hardcoded district. A parent texts a need; the
agent researches **that** school/district, finds the right program/form/deadline/
contact, fills + submits **with explicit consent**, or hands off where it hits a
hard limit (SSO/CAPTCHA).

Core behaviors:

- **Research-driven district data is authoritative.** For whatever district a
  parent names, the agent researches it (`src/knowledge/research.ts`,
  `districts.ts`) and answers school-info + contacts (homeless liaison,
  bus-pass contact, schools list) **from the researched profile** — never a
  hardcoded/hand-verified district. When a district isn't researched yet, it says
  so honestly and offers to look it up (or points to the school office). The old
  Soquel knowledge base (`knowledge/suesd.ts`) was removed.
- **Any student, parent-provided or via a real SIS.** There is no seeded
  school/teacher. A family's students + school come from **parent-supplied
  children** during onboarding (`seed.ts::provisionFamily`, `profile.children`),
  resolved to a stable school record for their district. The `Sis` interface
  (`integrations/sis.ts::createSis`) is the drop-in point to wire a real
  OneRoster / Edlink / PowerSchool client — no agent-code change needed.
- **McKinney-Vento school-bus help** — for families that are homeless or
  displaced. A guided conversation that explains the rights, gathers only what it
  needs, and gives the **researched district's** homeless-liaison + bus-pass
  contacts. v1 explains the process (no auto-action).
- **Parent-teacher conferences**, **absences**, and **free/reduced meals** —
  multi-turn slot filling + a **YES/NO confirmation gate** before anything executes.
- **Intelligence layer** (`src/agent/intention.ts`) — for fuzzy/ambiguous
  messages, treats intent as a belief state over a hypothesis space and chooses
  *ask* vs *research* vs *commit* vs *handoff* by information gain, committing
  only on grounded evidence and never acting without an explicit parent `YES`.
  Design + annotated rationale: `INTELLIGENCE-LAYER.md`.
- **Consent is a hard gate.** Anything consequential (send/call/submit/fill) is
  proposed, gated behind the parent's whole-message YES, and sent once. Grounding
  is per-kind; credentials are redacted from logs.
- Conversation state keyed on `space.id`; the parent is resolved from
  `message.sender` (unknown numbers get a provisional parent and are onboarded).

## Design principles (kind, helpful, constrained)

Short iMessage-friendly turns, one question at a time, no probing of sensitive
details, plain language, and honesty about limits — the agent only states facts
from **researched** district data, says "I don't have that researched yet"
otherwise, and always offers a concrete next step (never a passive handoff).

## Where to go next

- [Spectrum docs](https://photon.codes/docs/spectrum-ts)
- **Wire a real SIS** for production: implement `Sis` (OneRoster / Edlink /
  PowerSchool) and return it from `integrations/sis.ts::createSis` — the agent
  already consumes the `Sis` interface. Verify the sender against SIS contact
  records before going live.
- Wire real action for the McKinney-Vento flow (e.g. submit an intake to the
  liaison / SIS) once the process is confirmed with the district.
- Swap the mocks in `src/integrations/` for real PowerSchool / Calendly /
  district-meals adapters.
- Add more providers from `spectrum-ts/providers/*` (WhatsApp Business, terminal, …).
- Tests: `npm run test:school-info`, `test:intention`, `test:consent`,
  `test:graph`, `test:skills`, `test:evidence`.

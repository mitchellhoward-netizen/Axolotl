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

`src/index.ts` runs a parent↔school agent for **Soquel Elementary School / Soquel Union Elementary School District** instead of the echo loop:

- **McKinney-Vento school-bus help** — for families that are homeless or displaced. A guided, empathetic conversation that explains the rights, gathers only what it needs (which child, which school), and gives the exact contacts (district homeless liaison **Carissa Lemos**, bus passes **Erika Cortes**). **v1 takes no action** — it explains the process so we can test real action next.
- **School info** — answers about the principal, address, phone, and the district's five schools from a sourced knowledge base (`src/knowledge/suesd.ts`).
- **Parent-teacher conferences**, **absences**, and **free/reduced meals** — multi-turn slot filling + a **YES/NO confirmation gate** before anything executes.
- Conversation state keyed on `space.id`; the parent is resolved from `message.sender` (falls back to the seeded demo family in `src/seed.ts`).

### Design principles (kind, helpful, constrained)

Short iMessage-friendly turns, one question at a time, no probing of sensitive details, plain language, and honesty about limits — the agent only states facts from `src/knowledge/suesd.ts`, says "I'm not sure" otherwise, and always hands off to a human phone number.

## Where to go next

- [Spectrum docs](https://photon.codes/docs/spectrum-ts)
- Verify the sender against SIS contact records before going live (the demo fallback is not production-safe).
- Wire real action for the McKinney-Vento flow (e.g. submit an intake to the liaison / SIS) once the process is confirmed with the district.
- Swap the mocks in `src/integrations/` for real PowerSchool / Calendly / district-meals adapters.
- Add more providers from `spectrum-ts/providers/*` (WhatsApp Business, terminal, …).

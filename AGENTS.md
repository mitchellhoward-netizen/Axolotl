# chuy — agent instructions

This is a [Spectrum](https://photon.codes/docs/spectrum-ts) app, pinned to `spectrum-ts@^12.8.0`. The entry point is `src/index.ts`, which configures the imessage provider(s) and runs the echo loop.

## Agent codebase (the parent↔school agent)

This app is an **Axolotl** parent-facing agent: a parent texts a need and the agent navigates to the
right form, fills it, and submits **with explicit consent**, or guides the parent where it hits
limits (SSO/CAPTCHA). The agent core is `src/agent/agent.ts`; channel hands are in
`src/agent/steps/` + `src/integrations/`.

For fuzzy/ambiguous parent messages ("we moved, how do I enroll?", "my kid needs speech services"),
there is an **intelligence layer** (`src/agent/intention.ts`) that treats intent as a **belief state
over a hypothesis space** — not a single label to classify — and chooses *ask* vs *research* vs
*commit* vs *handoff* by **information gain**, committing only on **grounded evidence** and never
executing a consequential action without an explicit parent `YES`.

- Design + rationale (verified research, annotated `verified`/`inferred`): **`INTELLIGENCE-LAYER.md`**.
- Run the tests: `npm run test:intention`.
- The existing single-label `IntentEngine` (`src/agent/intent/`) is a coarse classifier; the
  intelligence layer runs on top of it for the cases it can't confidently resolve.

## Working in this project

- Run the app with `npm run start`.
- Add providers by importing them in `src/index.ts` and listing them in the `Spectrum({ providers: [...] })` config.
- Outgoing message content uses the builders documented in the skill (text, attachment, voice, contact, richlink, poll, group, custom).

### The website is generated — do not hand-edit the HTML

`public/index.html`, `public/schools.html`, `public/es.html` and
`public/es/schools.html` are **built**, not written. All copy lives in
`tools/site/strings.en.mjs` and `tools/site/strings.es.mjs`; the structure lives
in `tools/site/build.mjs`. Edit the strings, then run:

```sh
npm run build:site     # regenerate the four pages
npm run check:site     # fail if the committed HTML is not what the strings say
npm run check          # secrets, phone-mockup fit, site drift, typecheck
```

The build writes plain static HTML, so nothing changes about how the site is
served: Vercel serves `public/` as-is, with `cleanUrls`, so `/es` is
`public/es.html` and `/schools` is `public/schools.html`. The orb's preview
server (`node scripts/serve-site.mjs`, declared in `.amp/services.yaml`)
reproduces those clean URLs; it serves files only, so forms on the preview show
their error state rather than pretending to store a signup.

The phone mockup in "How your yes works" is a **rendered device image**, not
markup: `scripts/build-phone.mjs` draws the staged conversation at the iPhone's
own logical size in SF Pro, screenshots it at 3x, and composites it into Apple's
official bezel (downloaded on demand into the gitignored `.cache/`; the raw bezel
and font are never committed, only the finished `public/phone-<lang>.webp`).

```sh
npm run build:phone     # re-render after changing the conversation copy
npm run check:phone     # fail when the committed art is stale
```

The build fails if the conversation no longer fits the screen, so a clipped
screenshot cannot ship. The raw screen template is
`tools/site/phone-screen.html`; it is a stand-in for a screenshot taken on a real
iPhone, and swapping in a real one means replacing the image and deleting that
file.

Social cards are generated too: `node scripts/build-share.mjs` renders
`public/share.png` and `public/share-es.png` from `tools/site/share.html`, which
reads the same strings. Re-run it after changing the hero copy.

Website signups (family pilot, parent circle, school request) go through one
endpoint, `/api/waitlist`, with a `kind` field. Validation and storage are shared
between the Vercel function (`api/waitlist.ts`) and the long-lived host
(`src/integrations/web.ts`) via `src/integrations/waitlist.ts`. The table needs
`db/signups.sql` applied before the new forms can save anything.

## Environment

This project reads secrets from `.env` (gitignored). **Do not read, write, or echo `.env`** — it contains credentials.

If startup fails with an authentication error, tell the user to verify their `PROJECT_ID` / `PROJECT_SECRET` at the [Photon dashboard](https://app.photon.codes).

## Spectrum SDK reference

This project includes the `spectrum` skill from [`photon-hq/skills`](https://github.com/photon-hq/skills). Your agent should auto-discover it. If it doesn't, or if you switch agents, install for your agent with:

```sh
npx skills add photon-hq/skills --skill spectrum --agent <your-agent>
```

(Use `--agent '*'` to install for all supported agents.)

## Managing the Spectrum Cloud project (CLI)

If this app uses a platform provider, the `PROJECT_ID` / `PROJECT_SECRET` in `.env` belong to a **Spectrum Cloud** project. To manage that project from the terminal — authenticate, rotate the secret, list the line(s) you send from, manage platforms/users, or create more projects — use the `photon-cli` skill (the `photon` CLI) from [`photon-hq/skills`](https://github.com/photon-hq/skills):

```sh
npx skills add photon-hq/skills --skill photon-cli --agent <your-agent>
```

(Use `--agent '*'` to install for all supported agents.)

Common tasks once it's installed:

- `photon whoami` — confirm you're authenticated (run `photon login` if not).
- `photon projects regenerate-secret` — rotate the Spectrum API secret (then update `PROJECT_SECRET` in `.env`).
- `photon spectrum lines list` — see the line(s) your app sends from.
- `photon projects show` — inspect the active project (set `PHOTON_PROJECT_ID`, or pass `--project <id>`).

## See also

- [Spectrum docs](https://photon.codes/docs/spectrum-ts)
- [`spectrum-ts` on GitHub](https://github.com/photon-hq/spectrum-ts)

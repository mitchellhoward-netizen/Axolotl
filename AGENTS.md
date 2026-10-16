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

### The website: the homepage is hand-written, the rest is generated

`public/index.html` (`/`) and `public/es.html` (`/es`) are the homepage, written
by hand and kept in step with each other by hand: edit both when you change
copy. The two are one self-contained file each (styles and script inline), with
the photographs in `public/assets/` and their licences in
`public/assets/CREDITS.md` (Wikimedia Commons, CC BY / BY-SA; keep the credit
line in the footer). The homepage was built with the taste-skill process
(headlines two lines at every width, no eyebrow labels, no hairlines, one accent
on the action) — keep to that when editing. `public/assets/og.jpg` is the
sharing image for both languages.

`public/schools.html` (for school districts), `public/funds.html` (for funds
that reimburse Medicare Part B premiums), `public/members.html` (for the
retirees a fund sends to us) and their Spanish copies under `public/es/` are
**built**, not written, and all six render through `buyerDocument()` with
`public/buyer.css`, which is the homepage's inline stylesheet extracted (plus
the buyer-page pieces at the end: picker, calculators, forms, tables): change
the homepage's styles first, then re-copy the shared part. `public/site.css`
and the phone art are the older design and now serve only /privacy and
/security; the old `fundSections`/`membersPageSections` templates in
`build.mjs` are unused. The school copy lives under `schools` in the strings
files; the fund copy is everything else. All copy lives in
`tools/site/strings.en.mjs` and `tools/site/strings.es.mjs`; the structure lives
in `tools/site/build.mjs`. Edit the strings, then run:

```sh
npm run build:site     # regenerate the six generated pages
npm run check:site     # fail if the committed HTML is not what the strings say
npm run check          # secrets, phone-mockup fit, site drift, typecheck
```

The build writes plain static HTML, so nothing changes about how the site is
served: Vercel serves `public/` as-is, with `cleanUrls`, so `/es` is
`public/es.html`, `/members` is `public/members.html`, `/schools` is `public/schools.html` and `/funds` is `public/funds.html` (`/employers` redirects to `/`). The orb's preview
server (`node scripts/serve-site.mjs`, declared in `.amp/services.yaml`)
reproduces those clean URLs; it serves files only, so forms on the preview show
their error state rather than pretending to store a signup.

The phones on /schools (six threads of a family's helper through one
school day, `home.phones`) and the two on /funds (a retiree's yes on her
Part B premium, then her approval and yearly renewal) are **rendered device
images**, not markup: `scripts/build-phone.mjs` draws the staged conversation at the iPhone's
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

The two Part B calculators (the fund estimate at `/#estimate` and the member
check at `/members#check`) take their New York numbers from the rules archive,
never from the strings files: `cd archive && python -m tools.export_site_data`
writes `tools/site/msp-ny.json`, and the arithmetic lives in
`public/msp-calc.js`, which the build also runs to print each calculator's
default result. `python -m tools.export_site_data --check` and
`archive/tests/test_site_calculator.py` fail if the site and the archive drift.
Re-export after the archive's MSP numbers change (each January), then rebuild.

Social cards for the generated pages are generated too: `node scripts/build-share.mjs` renders
`public/share-schools*.png` (/schools) and `public/share-funds*.png` (/funds) from
`tools/site/share.html`, which reads the same strings. Re-run it after changing their hero copy. The homepage uses `public/assets/og.jpg`.

The homepage is written for investors and routes buyers on its first screen
(two doors: /schools and /funds); "Schools first" is the stated wedge, the fund
is the proof the mechanism generalizes, the thesis and the founders come last.

The district picker on /schools (`#district`, `schools.district` in the
strings, markup in `build.mjs`, styles in `buyer.css`, behaviour in `site.js`)
searches `public/scan-data.json`, one compact row per California district and
charter school built from the state's own chronic-absenteeism and LCFF files by
`tools/site/scan/build.py` (`npm run build:scan`; sources and model in
`tools/site/scan/README.md`). The page recomputes the arithmetic from the three
assumptions in that JSON, so the numbers in the strings' default lines and the
assumptions paragraph must change together. Basic-aid districts show $0 on
purpose, and each row carries a funded-ADA trend so the page can say whether a
district is likely paid on this year's attendance or on last year's. The headline is the total of the low-income count and attendance lines, with the price ($5.60 a student a year, $2.40 more on certified results; `priceBase`/`priceTop` in the strings) beside it; `scanDefault()` in `build.mjs` works the static default the same way `site.js` does. The homepage quotes one figure from it ($947K, Pajaro Valley) by hand.

Website signups (a member's phone number from /members, and the contact form on the homepage, /schools and /funds, all posted as `kind: "school"` with a message that starts with `[home]`, `[schools]` or `[funds]`) go through one
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

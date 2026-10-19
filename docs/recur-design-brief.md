# Brief: rebuild the recursoftware.com design system

Copy the *visual system* of https://www.recursoftware.com — type, color, spacing,
components, motion — exactly as specified below. Do **not** copy their content: no Recur
copy, logos, name, testimonials, or their watercolor wave image (`/images/watercolor/hero-wave.png`
is their asset). Use our own copy and imagery. Every value below was extracted from their
live CSS/JS (Next.js 16 + Tailwind v4 + Framer Motion) and verified with computed styles
in a browser; treat them as exact.

## 0. One decision before you start: fonts

Their CSS *intends* Work Sans (headings) + Inter (body) + EB Garamond (accent), but a bug
means the live site renders headings and body in **system-ui** (SF Pro on Mac, Segoe UI on
Windows). Only EB Garamond actually renders. Cause: `--font-heading: var(--font-work-sans)`
is declared on `:root`, while `--font-work-sans` is only set on `<body>`, so the reference
resolves to nothing.

- **Default: use the intended fonts** (Work Sans + Inter + EB Garamond), declared so they
  actually resolve (define the font variables on `:root`, or put the literal family names in
  the tokens).
- If asked for pixel-identical to the live site, use `ui-sans-serif, system-ui, sans-serif`
  for headings and body instead.

All three are Google Fonts. Load only the Latin subset:
- Work Sans, variable 100–900
- Inter, variable 100–900
- EB Garamond, normal + italic, 400/500/600

Metric-matched fallbacks (stop layout shift):
```css
@font-face{font-family:"Work Sans Fallback";src:local(Arial);ascent-override:83.09%;descent-override:21.71%;line-gap-override:0%;size-adjust:111.93%}
@font-face{font-family:"Inter Fallback";src:local(Arial);ascent-override:90.44%;descent-override:22.52%;line-gap-override:0%;size-adjust:107.12%}
```

## 1. Tokens

```css
:root{
  --color-navy:#08142f;        /* primary text, button hover */
  --color-navy-theme:#173057;  /* buttons, dark sections, footer, ::selection */
  --color-offwhite:#fafaf9;    /* page background, alternate sections */
  --color-white:#ffffff;       /* alternate sections */
  --color-gray:#6b6d71;        /* body copy, eyebrows, inactive nav */
  --color-gray-light:#d9d9d9;  /* borders, nav rule, scrollbar thumb */
  --color-cream:#f1ecdd;       /* defined, unused on the homepage */
  --pool-deep:#1a5f7a; --pool-base:#3a8aab; --pool-light:#8ec9e0; --pool-bright:#b8e2f2;

  --font-heading:"Work Sans","Work Sans Fallback",system-ui,sans-serif;
  --font-body:"Inter","Inter Fallback",system-ui,sans-serif;
  --font-accent:"EB Garamond",Georgia,serif;
}
```

The palette has no other colors. On navy sections, text is white at these opacities only:
90% (quote), 70% (lead), 60% (footer links/tagline), 50% (eyebrows, stat labels, 50% hover
borders), 40% (footer headings, legal), 30% (inactive dots), 20% (borders), 10%.
Underline accents are navy at 20% (`decoration-navy/20`) and 30% (`border-navy/30`).

Base:
```css
html{scroll-behavior:smooth}
body{background:var(--color-offwhite);color:var(--color-navy);font-family:var(--font-body);
  -webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
::selection{background:var(--color-navy-theme);color:#fff}
::-webkit-scrollbar{width:8px}
::-webkit-scrollbar-track{background:var(--color-offwhite)}
::-webkit-scrollbar-thumb{background:var(--color-gray-light);border-radius:4px}
::-webkit-scrollbar-thumb:hover{background:var(--color-gray)}
```

## 2. Type scale

Breakpoints are Tailwind defaults: md = 768px, lg = 1024px. Sizes are mobile / md / lg.

| Element | Font | Size | Weight | Line-height | Tracking | Color |
|---|---|---|---|---|---|---|
| Wordmark (all caps, text only) | heading | 22px | 300 | 1.5 | 0.15em | navy |
| Nav link | heading | 15px | 400 | — | — | gray, active/hover navy |
| h1 | heading | 40 / 44 / 60px | 300 | 1.1 | — | navy |
| h1 accent line | accent | 110% of h1 | inherits (300) | — | — | pool gradient (§4) |
| Eyebrow label | body | 14px uppercase | 500 | 20px | 0.1em | gray (white/50 on navy) |
| h2 | heading | 28 / 36px | 400 | 1.25 | — | navy |
| h2 (contact, "Let's talk") | heading | 36 / 44px | 400 | 1.25 | — | navy |
| Lead paragraph | body | 18 / 20px | 400 | 1.625 | — | gray |
| Body paragraph | body | 18px (sections), 16px (cards), 15px (service cards) | 400 | 1.625 | — | gray |
| h3 | heading | 18px | 500 | 28px | — | navy |
| h3 (contact) | heading | 20px, underlined, offset 4px, navy/20 | 500 | — | — | navy |
| Checklist item | heading | 17px | 400 | 1.625 | — | navy |
| Stat number | heading | 44 / 56px | 300 | — | — | white |
| Stat label | body | 14px | 400 | — | — | white/50 |
| Quote | accent | 22 / 28px | 500 | 1.375 | — | white/90 |
| Big email link | heading | 32 / 40px, 1px bottom border navy/30, pb 2px | 400 | — | — | navy, hover opacity 70% |
| Logo caption | body | 12px | 500 | — | — | gray |
| Footer tagline | accent | 20px | 400 | 1.625 | — | white/60 |

The look: large, light (300) sans headlines; one serif-italic-feeling Garamond phrase as
the emotional accent; quiet gray body copy; small uppercase tracked eyebrows over every h2.

## 3. Layout

- Container: `max-width:1280px; margin:0 auto; padding-inline:20px / 32px / 48px`.
- Section vertical padding: 56px / 80px / 96px (`py-14 md:py-20 lg:py-24`).
- Section backgrounds alternate: offwhite (hero) → white → offwhite → **navy-theme**
  (testimonial) → white → offwhite → **navy-theme** (stats) → white → offwhite → white
  (contact) → navy-theme footer.
- Hero: 2-column grid at md+, `gap:32px / 48px`, `padding-top:96 / 128 / 160px`,
  `padding-bottom:80 / 112 / 144px`. Text left (lead `max-width:36rem`, `margin-top:24px`),
  image right (`object-fit:contain`, fades into the background).
- Eyebrow → h2 gap 16px; h2 → paragraph 24px; paragraph → paragraph 16px; h3 → text 12px
  (8px in service cards); before a sub-eyebrow 48px.
- Three-column card rows sit under a 1px gray-light top rule (hairline), ~32px column gap.
- Content widths in use: 36rem, 42rem, 48rem.
- Corners: square everywhere (`border-radius:0`) except circular arrow buttons and dots.
- No shadows anywhere.

## 4. Components

**Nav.** `position:fixed; top:0; z-index:50; width:100%`, transparent background, 1px
gray-light bottom border, `transition: all .3s`. Inner row: flex, space-between, padding 20px
vertical. Wordmark left; links (15px) and a CTA right. Mobile: hamburger of three 24×2px navy
bars with a 5px gap, hidden at md+.

**Primary button.** `display:inline-flex; align-items:center; justify-content:center;
padding:12px 28px; font:500 15px var(--font-heading); letter-spacing:.025em;
background:var(--color-navy-theme); color:#fff; border-radius:0; transition:all .2s`;
hover background `--color-navy`.
Nav CTA variant: `padding:10px 24px; font-size:14px`, 16px trailing arrow icon, gap 8px.

**Secondary button.** Same metrics, `border:1px solid var(--color-navy-theme);
color:var(--color-navy-theme); background:transparent`; hover fills navy-theme with
white text.

**Hero accent text (animated "pool" gradient).** Exact CSS:
```css
.hero-accent{
  position:relative; z-index:1; display:inline-block; margin-top:8px;
  font-family:var(--font-accent); font-size:110%; padding-bottom:.15em;
  background:
    radial-gradient(ellipse 65% 55% at 25% 35%, var(--pool-bright) 0%, transparent 55%),
    radial-gradient(ellipse 55% 65% at 75% 65%, var(--pool-light) 0%, transparent 55%),
    radial-gradient(ellipse 50% 50% at 55% 30%, var(--pool-bright) 0%, transparent 45%),
    linear-gradient(135deg, var(--pool-deep), var(--pool-base), var(--pool-deep));
  background-size:250% 250%,250% 250%,250% 250%,100% 100%;
  -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent;
  animation:pool-drift-1 4s ease-in-out infinite, pool-drift-2 6s ease-in-out infinite,
            pool-drift-3 8s ease-in-out infinite;
}
@keyframes pool-drift-1{0%{background-position:0 0}50%{background-position:100% 100%}100%{background-position:0 0}}
@keyframes pool-drift-2{0%{background-position:100% 0}50%{background-position:0 100%}100%{background-position:100% 0}}
@keyframes pool-drift-3{0%{background-position:50% 100%}33%{background-position:0 0}66%{background-position:100% 50%}100%{background-position:50% 100%}}
```
Add a `prefers-reduced-motion: reduce` rule that sets `animation:none`. They don't have one;
we should.

**Checklist ("who we partner with").** Rows of a 32px thin-line icon plus a 17px heading-font
line in navy, then a closing 18px gray paragraph at margin-top 40px.

**Testimonial slider (navy-theme section).** Eyebrow (white/50) plus an 18px white/70 subline;
Garamond quote with curly quotes; author row with a round photo, name 16px/500 white, role
14px white/50, company logo. Controls: 40×40px circular buttons, `border:1px solid` white/20,
icon white/60; hover border white/50, icon white. Dots: 8px tall, fully rounded, `transition:all .3s`;
inactive 8px wide white/30 (hover white/50), active 32px wide solid white.

**Stats band (navy-theme).** Four columns: number (44/56px, weight 300, white), then a
14px white/50 label at margin-top 8px.

**Logo walls.** Logos rendered as solid black with `filter:brightness(0)`, `object-fit:contain`,
each with a 12px/500 gray caption underneath.

**Icons.** Custom thin-line SVGs, stroke widths 0.4–1.5 (most 0.5–0.8), navy stroke, no fill.
Sizes 16px (inline), 32px (checklist), 48px (service cards). No icon library, so draw your own
in that hairline style.

**Contact.** "Let's talk" h2; two columns of underlined h3 + 18px gray text; a huge email link
(32/40px) with a trailing 32px arrow, gap 16px.

**Footer (navy-theme, white text).** Container `padding:64px / 80px` vertical. Wordmark
(22px/300/0.15em) plus a Garamond 20px white/60 tagline at margin-top 16px. Column headings:
14px/500 uppercase 0.1em white/40, margin-bottom 16px. Links: 16px white/60, hover white.
Bottom row: 14px white/40 legal text, links hover white/60.

## 5. Motion

Use Framer Motion (or the equivalent CSS/IntersectionObserver):
- **Section reveal:** every section `initial={{opacity:0, y:30}}`,
  `whileInView={{opacity:1, y:0}}`, `viewport={{once:true, margin:"-100px"}}`,
  `transition={{duration:0.8, ease:[0.25,0.1,0.35,1]}}`.
- **Hero lead paragraph:** `y:20`, `duration:0.6`. Stagger children with `delay:0.1`
  (`duration:0.5`).
- **Other easing in use:** `[0.4,0,0.1,1]`, durations 0.2–1.2s.
- **Hover transitions:** colors 200ms, nav and dots 300ms, `cubic-bezier(.4,0,.2,1)`.
- **Hero accent:** the 4s/6s/8s gradient drift above.
- Respect `prefers-reduced-motion` (skip the y-offset and the gradient drift).

## 6. Done means

- Every color in the build is one of the tokens in §1 (white/navy alpha steps allowed).
- Headings and body render in the chosen fonts: check `getComputedStyle(h1).fontFamily`
  in a browser, which is exactly the bug they shipped.
- No border-radius except the circles; no shadows.
- At 375px the page has no horizontal scroll and the h1 is 40px.
- Screenshot at 1440px and 375px and compare against recursoftware.com side by side.

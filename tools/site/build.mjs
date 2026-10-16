/**
 * Renders the static site from the per-language strings files.
 *
 *     npm run build:site      # write public/schools.html and
 *                             # public/es/schools.html (school districts),
 *                             # public/funds.html and
 *                             # public/es/funds.html (union funds), and
 *                             # public/members.html, public/es/members.html
 *     npm run check:site      # fail if the committed HTML is not what the
 *                             # strings would produce (drift check, used by CI)
 *
 * Why a build at all, when the site is static: the brief asks for one strings
 * file per language so /es cannot fall behind. Hand-editing two HTML files does
 * exactly that, so the copy lives in tools/site/strings.<lang>.mjs and the HTML
 * is generated from it. The output is committed, so Vercel keeps serving plain
 * static files with no build step and no client-side rendering: the pages are
 * complete HTML before any script runs, which is what the performance and
 * no-JavaScript requirements need.
 *
 * Structure lives here, copy lives in the strings files. If a language is
 * missing a key the build throws rather than shipping a blank spot.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const OUT = path.join(ROOT, 'public');
const SITE = 'https://www.try-mycelium.com';

// ── tiny helpers ─────────────────────────────────────────────────────────────

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Read a dotted path out of the strings object, failing loudly when absent. */
function at(obj, dotted) {
  const value = dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  if (value === undefined) throw new Error(`missing string: ${dotted}`);
  return value;
}

/** Interpolate {name} placeholders. Values are escaped; templates are copy. */
const fill = (template, vars) =>
  esc(template).replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined ? `{${k}}` : esc(vars[k])));

// ── shared pieces ────────────────────────────────────────────────────────────

/** This language's URL for a page: localized('/funds') is '/es/funds' in Spanish. */
const localized = (s, href) => (s.lang === 'es' ? (href === '/' ? '/es' : `/es${href}`) : href);

/** The nav links for each kind of page. The school pages are the homepage; the
 *  union fund page lives at /funds, and /members is for the retirees a fund
 *  sends to us, so its section links point back at /funds. */
function navFor(s, page) {
  if (page === 'home') {
    return [
      [at(s, 'home.nav.why'), '#why'],
      [at(s, 'home.nav.how'), '#how'],
      [at(s, 'home.nav.schools'), localized(s, '/schools')],
      [at(s, 'home.nav.funds'), localized(s, '/funds')],
    ];
  }
  if (page === 'schools') {
    return [
      [at(s, 'schools.nav.outcomes'), '#outcomes'],
      [at(s, 'schools.nav.how'), '#how'],
      [at(s, 'schools.nav.funds'), localized(s, '/funds')],
    ];
  }
  const base = page === 'funds' ? '' : localized(s, '/funds');
  return [
    [at(s, 'nav.money'), `${base}#money`],
    [at(s, 'nav.how'), `${base}#how`],
    [at(s, 'nav.members'), localized(s, '/members')],
  ];
}

/** The header. `ctaLabel` names the header button: a scan on the school and
 *  fund pages, a text on /members. */
function header(s, { page, cta, ctaLabel, langHref }) {
  const home = localized(s, '/');
  const nav = navFor(s, page)
    .map(([label, href]) => `<li><a href="${href}">${esc(label)}</a></li>`)
    .join('');
  return `
  <header class="site-header">
    <div class="wrap header-bar">
      <a class="brand" href="${home}" aria-label="${esc(at(s, 'a11y.home'))}">
        <img src="/mark.svg" alt="" width="44" height="44" />
        <span>Mycelium</span>
      </a>
      <div class="header-actions">
        <a class="button primary header-cta" href="${cta}">${esc(ctaLabel)}</a>
        <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="${esc(at(s, 'a11y.menu'))}">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
        </button>
      </div>
    </div>
    <nav class="site-nav" id="site-nav" aria-label="${esc(at(s, 'a11y.mainNav'))}">
      <div class="wrap">
        <ul>${nav}</ul>
        <a class="nav-lang" href="${langHref}" hreflang="${s.lang === 'en' ? 'es' : 'en'}" lang="${s.lang === 'en' ? 'es' : 'en'}">${esc(at(s, 'nav.langSwitch'))}</a>
      </div>
    </nav>
  </header>`;
}

function footer(s, { page, langHref }) {
  const home = localized(s, '/');
  const f = page === 'home' ? at(s, 'home.footer') : page === 'schools' ? at(s, 'schools.footer') : at(s, 'footer');
  const links = f.links
    .map((l) => `<li><a href="${l.href}">${esc(l.label)}</a></li>`)
    .join('');
  return `
  <footer class="site-footer">
    <div class="wrap footer-grid">
      <div>
        <a class="brand brand-footer" href="${home}">
          <img src="/mark.svg" alt="" width="44" height="44" />
          <span>Mycelium</span>
        </a>
        <p>${esc(f.tagline)}</p>
      </div>
      <nav aria-label="${esc(at(s, 'a11y.footerNav'))}">
        <ul>
          ${links}
          <li><a href="${langHref}" hreflang="${s.lang === 'en' ? 'es' : 'en'}" lang="${s.lang === 'en' ? 'es' : 'en'}">${esc(at(s, 'nav.langSwitch'))}</a></li>
        </ul>
      </nav>
    </div>
  </footer>`;
}

// ── shared page pieces ───────────────────────────────────────────────────────

/** A heading whose last words are the italic payoff: "Your fund pays bills <em>Medicare should pay.</em>" */
const payoff = (plain, em) => `${esc(plain)} <em>${esc(em)}</em>`;

/** A device render from scripts/build-phone.mjs. `alt` '' marks a decorative copy. */
function device(name, size, alt, extra = '') {
  return `<img class="device" src="${shot(name)}" width="${size.width}" height="${size.height}" alt="${esc(alt)}" decoding="async" ${extra}/>`;
}

/** A card of big numbers with a label and a source note each. `money` sizes the
 *  value column for dollar amounts rather than single digits. */
function briefCard(b, id) {
  const rows = b.rows
    .map(
      (r) => `<li><span class="brief-v">${esc(r.v)}</span><span class="brief-l">${esc(r.l)}<span class="brief-note">${esc(r.note)}</span></span></li>`,
    )
    .join('');
  return `<article class="brief-card" aria-labelledby="${id}">
            <p class="door-label"><span id="${id}">${esc(b.eyebrow)}</span><span>${esc(b.example)}</span></p>
            <ul class="brief-rows brief-rows-money">${rows}</ul>
            ${b.foot ? `<p class="brief-foot">${esc(b.foot)}</p>` : ''}
          </article>`;
}

/** Cards with a title and a line each, in the never grid. */
const cardGrid = (items) =>
  `<div class="never-grid">
          ${items.map((i) => `<article><h3>${esc(i.title)}</h3><p>${esc(i.body)}</p></article>`).join('\n          ')}
        </div>`;

/** A phone-number signup ("we'll text you"). `id` keeps two copies apart. */
function joinForm(s, id) {
  return `
          <form id="${id}-form" class="pill-form" novalidate data-error="${esc(at(s, 'join.generic'))}" data-error-phone="${esc(at(s, 'join.error'))}">
            <label class="sr-only" for="${id}-phone">${esc(at(s, 'join.phoneLabel'))}</label>
            <div class="pill-field">
              <input id="${id}-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="30" required placeholder="${esc(at(s, 'join.placeholder'))}" aria-describedby="${id}-error" />
              <button class="button primary" type="submit">${esc(at(s, 'join.submit'))}</button>
            </div>
            <p class="form-note">${esc(at(s, 'join.note'))}</p>
            <p class="form-error" id="${id}-error" role="alert" hidden></p>
          </form>
          <div class="form-success" id="${id}-sent" role="status" tabindex="-1" hidden>
            <p id="${id}-sent-text" data-template="${esc(at(s, 'join.success'))}"></p>
          </div>`;
}

function pathCard(c) {
  const stats = c.stats
    .map((st) => `<div><span class="path-stat-v">${esc(st.v)}</span><span class="path-stat-l">${esc(st.l)}</span></div>`)
    .join('');
  return `<article class="path-card" aria-labelledby="path-title">
            <p class="path-eyebrow"><span>${esc(c.eyebrow)}</span><span>${esc(c.version)}</span></p>
            <h3 id="path-title">${esc(c.title)}</h3>
            <div class="path-two">
              <div><p class="path-label">${esc(c.doLabel)}</p><p>${esc(c.doText)}</p></div>
              <div><p class="path-label">${esc(c.happensLabel)}</p><p>${esc(c.happensText)}</p></div>
            </div>
            <div class="path-stats">${stats}</div>
            <p class="path-never"><strong>${esc(c.neverLabel)}</strong> ${esc(c.neverText)}</p>
            <div class="path-stamp" role="img" aria-label="${esc(c.stampAlt)}">
              <span class="path-stamp-top" aria-hidden="true">${esc(c.stamp.top)}</span>
              <span class="path-stamp-name" aria-hidden="true">${esc(c.stamp.name[0])}<br />${esc(c.stamp.name[1])}</span>
              <span class="path-stamp-date" aria-hidden="true">${esc(c.stamp.date)}</span>
            </div>
          </article>`;
}

// ── the homepage: the idea ───────────────────────────────────────────────────
//
// One school day, dawn to night, carrying stranded alignment for people who are
// not AI-native: every empty seat is money (8:30), everyone wants the kid in
// school but it is nobody's job (10:15), a helper for every family does the
// work with them (12:10), the school sees outcomes, not lives (3:40), the
// helper belongs to the family (6:30), and the day ends handled (9:40). Each
// section carries its time and its own light. /schools and /funds carry the
// specifics.

function homeSections(s) {
  const k = at(s, 'home');
  const lang = s.lang;

  // A rendered phone from home.phones (scripts/build-phone.mjs). Until the art
  // has been rendered for the first time, size it like the other 328px renders.
  const phone = (i, extra = '') => {
    const t = k.phones[i];
    const size = art[lang]?.[`home${i}`] ?? { width: 328, height: 670 };
    const alt = `${k.phoneAltPrefix} ${t.turns.map((turn) => `${turn.out ? k.phoneYou : 'Mycelium'}: ${turn.out ?? turn.in}`).join(' ')}`;
    return device(`home-${i + 1}-${lang}.webp`, size, alt, extra);
  };
  const chip = (c) =>
    `<p class="time-chip"><span class="time-chip-time">${esc(c.time)}</span><span class="time-chip-label">${esc(c.label)}</span></p>`;
  const check = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12l5 5 9-10" /></svg>';

  // 7:15 AM. The school sends one message; a family says yes.
  const h = k.hero;
  const hero = `
    <section class="hero t-morning" id="top" aria-labelledby="hero-title">
      <div class="sun" aria-hidden="true"></div>
      <div class="clutter" aria-hidden="true">
        <span class="paper paper-slip"><i></i><i></i><i></i><b></b></span>
        <span class="paper paper-menu"><i></i><i></i><i></i><i></i></span>
        <span class="paper paper-note"></span>
        <span class="paper paper-card"><i></i><i></i></span>
      </div>
      <div class="wrap hero-copy">
        ${chip(h.chip)}
        <div class="agents" aria-hidden="true">
          <div class="agents-track">${h.agents.map((a) => `<span>${esc(a)}</span>`).join('')}<span class="agents-parents">${esc(h.agentsLast)} <s>${esc(h.agentsStrike)}</s></span><span>${esc(h.agents[0])}</span></div>
        </div>
        <h1 id="hero-title">${payoff(h.h1Plain, h.h1Em)}</h1>
        <p class="lead">${esc(h.sub)}</p>
        <div class="hero-actions">
          <a class="button primary" href="#school-contact">${esc(h.primary)}</a>
          <a class="text-link" href="#bell">${esc(h.secondary)}</a>
        </div>
        <p class="trust-line">${esc(h.trust)}</p>
      </div>
      <div class="hero-stage">
        ${phone(1, 'loading="lazy" ').replace(/alt="[^"]*"/, 'alt=""')}
        ${phone(5, 'loading="lazy" ').replace(/alt="[^"]*"/, 'alt=""')}
        <span aria-hidden="true" hidden></span>
        ${phone(0, 'fetchpriority="high" ')}
      </div>
    </section>`;

  // 8:30 AM. First bell: every empty seat is money.
  const d = k.depend;
  const bell = `
    <section class="section t-day" id="bell" aria-labelledby="bell-title">
      <div class="wrap">
        ${chip(d.chip)}
        <h2 id="bell-title">${payoff(d.h2Plain, d.h2Em)}</h2>
        <p class="lead">${esc(d.lead)}</p>
        <table class="year-table money-table">
          <caption class="sr-only">${esc(d.caption)}</caption>
          <thead>
            <tr>${d.head.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr>
          </thead>
          <tbody>
          ${d.rows
            .map(
              (r) => `<tr>
            <td data-label="${esc(d.head[0])}">${esc(r.life)}</td>
            <td data-label="${esc(d.head[1])}">${esc(r.money)}</td>
            <td data-label="${esc(d.head[2])}">${esc(r.stuck)}</td>
          </tr>`,
            )
            .join('\n          ')}
          </tbody>
        </table>
        <p class="network-note">${esc(d.note)}</p>
      </div>
    </section>`;

  // 10:15 AM. The front office: everyone wants it, nobody can afford to do it.
  const w = k.why;
  const office = `
    <section class="section t-noon" id="why" aria-labelledby="why-title">
      <div class="wrap">
        ${chip(w.chip)}
        <h2 id="why-title">${payoff(w.h2Plain, w.h2Em)}</h2>
        <p class="lead">${esc(w.lead)}</p>
        <div class="scan-cards">${cardGrid(w.cards)}</div>
        <p class="scan-estimate"><span class="highlight">${esc(w.changed)}</span></p>
        <p class="network-note">${esc(w.note)}</p>
      </div>
    </section>`;

  // 12:10 PM. The helper at work, four threads.
  const wk = k.week;
  const week = `
    <section class="section t-afternoon" id="week" aria-labelledby="week-title">
      <div class="wrap center-head">
        ${chip(wk.chip)}
        <h2 id="week-title">${payoff(wk.h2Plain, wk.h2Em)}</h2>
        <p class="lead">${esc(wk.lead)}</p>
      </div>
      <div class="wrap">
        <div class="carousel" data-carousel>
          <button class="carousel-arrow carousel-prev" type="button" aria-label="${esc(wk.prev)}" hidden>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14.5 5 8 12l6.5 7" /></svg>
          </button>
          <ul class="carousel-track" tabindex="0" aria-label="${esc(wk.trackLabel)}">
          ${wk.cards
            .map(
              (c, i) => `<li class="week-card">
            ${phone(i + 1, 'loading="lazy" ')}
            <p class="week-time">${esc(k.phones[i + 1].time)}</p>
            <h3>${esc(c.title)}</h3>
            <p>${esc(c.money)}</p>
          </li>`,
            )
            .join('\n          ')}
          </ul>
          <button class="carousel-arrow carousel-next" type="button" aria-label="${esc(wk.next)}" hidden>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9.5 5 16 12l-6.5 7" /></svg>
          </button>
        </div>
        <p class="caption">${esc(k.caption)}</p>
      </div>
    </section>`;

  // 3:40 PM. The school's side: names in, outcomes out.
  const sc = k.school;
  const school = `
    <section class="section t-golden" id="how" aria-labelledby="how-title">
      <div class="wrap split">
        <div class="split-copy">
          ${chip(sc.chip)}
          <h2 id="how-title">${payoff(sc.h2Plain, sc.h2Em)}</h2>
          <p class="lead">${esc(sc.lead)}</p>
          <ol class="step-grid">
            ${sc.steps.map((st) => `<li><span class="step-tag">${esc(st.tag)}</span>${esc(st.text)}</li>`).join('\n            ')}
          </ol>
        </div>
        ${briefCard(sc.ledger, 'ledger-title')}
      </div>
    </section>`;

  // 6:30 PM. Dinner: the helper belongs to the family.
  const hp = k.helper;
  const dinner = `
    <section class="section t-dusk t-dusk-long" id="helper" aria-labelledby="helper-title">
      <div class="wrap split circle-split">
        <figure class="fund-phone">
          ${phone(5, 'loading="lazy" ')}
          <figcaption class="caption">${esc(k.caption)}</figcaption>
        </figure>
        <div class="split-copy">
          ${chip(hp.chip)}
          <h2 id="helper-title">${payoff(hp.h2Plain, hp.h2Em)}</h2>
          <p class="lead">${esc(hp.lead)}</p>
          <ol class="step-grid">
            ${hp.items.map((it) => `<li><span class="step-tag">${esc(it.title)}</span>${esc(it.body)}</li>`).join('\n            ')}
          </ol>
          <p><span class="highlight">${esc(hp.closer)}</span></p>
        </div>
      </div>
    </section>`;

  // 9:40 PM. The day's summary, the rules, and where to start.
  const n = k.night;
  const night = `
    <section class="section t-night" id="night" aria-labelledby="night-title">
      <div class="stars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <div class="wrap split">
        <div class="split-copy">
          ${chip(n.chip)}
          <h2 id="night-title">${payoff(n.h2Plain, n.h2Em)}</h2>
          <p class="lead">${esc(n.lead)}</p>
        </div>
        <div>
          <p class="sum-label">${esc(n.sumLabel)}</p>
          <ul class="summary">
          ${n.summary
            .map(
              (it) => `<li class="${it.done ? 'is-done' : 'is-waiting'}">
              <span class="sum-mark">${it.done ? check : ''}</span>
              <span class="sum-text"><strong>${esc(it.title)}</strong><span>${esc(it.detail)}</span></span>
              <span class="sr-only">${esc(it.done ? n.doneLabel : n.waitingLabel)}</span>
            </li>`,
            )
            .join('\n          ')}
          </ul>
          <p class="caption">${esc(k.caption)}</p>
        </div>
      </div>
      <div class="wrap promises">
        ${k.rules.map((r) => `<article class="glass promise"><h3>${esc(r.title)}</h3><p>${esc(r.body)}</p></article>`).join('\n        ')}
      </div>
      <div class="wrap promise-links">
        <a class="text-link" href="/security">${esc(n.securityLink)}</a>
        <a class="text-link" href="/privacy">${esc(n.privacyLink)}</a>
      </div>
      <div class="wrap join" id="join" aria-labelledby="join-title">
        <h2 id="join-title">${payoff(n.joinPlain, n.joinEm)}</h2>
        <p class="lead">${esc(n.joinLead)}</p>
        <a class="button primary" href="#school-contact">${esc(h.primary)}</a>
      </div>
    </section>`;

  // Where it works today, then the form, under the night sky.
  const wh = k.where;
  const where = `
    <section class="section t-night-deep section-band" aria-labelledby="where-title">
      <div class="wrap band">
        <h2 id="where-title">${esc(wh.h2)}</h2>
        <p class="lead">${esc(wh.lead)}</p>
      </div>
      <div class="wrap promises">
        ${wh.cards
          .map(
            (c) =>
              `<article class="glass promise"><h3>${esc(c.title)}</h3><p>${esc(c.body)}</p><p><a class="text-link" href="${c.href.startsWith('#') ? c.href : localized(s, c.href)}">${esc(c.link)}</a></p></article>`,
          )
          .join('\n        ')}
      </div>
    </section>`;

  return [hero, bell, office, week, school, dinner, night, where, contactForm(k.form, 'home', 't-night-deep')].join('');
}

// ── /schools: for school districts ───────────────────────────────────────────
//
// The buyer page behind the homepage's first door, in the homepage's design
// (public/buyer.css is the homepage's stylesheet, extracted). Attendance
// first: the fifth absence, Maya's thread, the district picker, how it works,
// what the school sees and never, the trial design, the evidence, the ask.
// Copy lives under `schools` in the strings files.

// Pajaro Valley's funded-ADA change since 2023-24, from public/scan-data.json (the
// static default line; the page recomputes it live).
const PVUSD_TREND = Math.abs(JSON.parse(readFileSync(path.join(OUT, 'scan-data.json'), 'utf8')).districts.find((r) => r[0] === '4469799')[11]);

const IMGS = {
  cycle: '<img src="/assets/myc-fan-lomas.jpg" width="1280" height="851" alt="" fetchpriority="high"><img src="/assets/dend-fan-single.jpg" width="1280" height="1763" alt="" style="object-position: 50% 40%"><img src="/assets/dend-field-solnhofen.jpg" width="1280" height="850" alt="" style="object-position: 50% 35%"><img src="/assets/dend-tree-pyrolusite.jpg" width="1075" height="1657" alt="" style="object-position: 50% 30%">',
};

function thread(t) {
  return `<div class="thread" data-ui aria-label="${esc(t.who)}">
      <div class="who">${esc(t.who)}</div>
      <div class="msgs">${t.msgs.map(([k, m]) => `<div class="m${k === 'me' ? ' me' : ''}">${esc(m)}</div>`).join('')}</div>
      <div class="note">${esc(t.note)}</div>
    </div>`;
}

function schoolSections(s) {
  const k = at(s, 'schools');
  const h = k.hero, t = k.thread, d = k.district;
  const dj = JSON.stringify(d).replace(/</g, '\\u003c');
  const hero = `
<section class="hero" id="top" aria-label="Mycelium">
  <div class="field-top"></div>
  <div class="field-bottom"></div>
  <div class="sentence-wrap"><h1 class="sentence" data-rise style="--i:0">
    <span class="l1">${esc(h.h1a)}</span>
    <span class="l2">${esc(h.h1b)}</span>
  </h1></div>
  <div class="photo" aria-hidden="true">${IMGS.cycle}</div>
  <p class="support" data-rise style="--i:1">${esc(h.sub)}</p>
  <div class="action" data-rise style="--i:2"><a class="button" href="#close">${esc(h.primary)}</a><a class="door" href="#district">${esc(h.secondary)}</a></div>
</section>`;
  const showcase = `
<section class="wedge" id="letter" aria-label="${esc(t.h2a)} ${esc(t.h2b)}">
  <h2>${esc(t.h2a)}<br>${esc(t.h2b)}</h2>
  <div class="text">
    <p>${esc(t.p1)}</p>
    <p>${esc(t.p2)}</p>
  </div>
  <div class="obj">${thread(t)}</div>
</section>`;
  const district = `
<section class="scan-section" id="district" aria-labelledby="district-title">
  <h2 id="district-title">${esc(d.h2Plain)}</h2>
  <p class="lede">${esc(d.lead)}</p>
  <form class="scan" onsubmit="return false">
    <div class="figure" id="scan-figure" aria-live="polite">$244K<small id="scan-sub">${esc(d.sub.replace('{name}', 'Pajaro Valley Unified'))}</small></div>
    <div class="pick">
      <label for="district-input" class="vh">${esc(d.label)}</label>
      <input id="district-input" type="search" placeholder="${esc(d.placeholder)}" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false" aria-controls="scan-matches" aria-autocomplete="list">
      <ul class="matches" id="scan-matches" role="listbox"></ul>
    </div>
    <p class="quick" id="scan-quick">${esc(d.quick)} <button type="button" data-pick="4469799">${esc(d.quickNames[0])}</button>, <button type="button" data-pick="0161259">${esc(d.quickNames[1])}</button>, <button type="button" data-pick="1062166">${esc(d.quickNames[2])}</button>.</p>
    <div class="lines" id="scan-lines">
      <div><span>${esc(d.line1.replace('{absent}', '3,865').replace('{days}', '3').replace('{perDay}', '84'))}</span><b>$244K</b></div>
      <div><span>${esc(d.line2.replace('{uncounted}', '77').replace('{perCounted}', '9,139'))}</span><b>$704K</b></div>
      <div><span>${esc(d.line3)}</span><b>$2.2M</b></div>
      <div><span>${esc(d.trendDown.replace('{pct}', String(PVUSD_TREND)))}</span><b></b></div>
    </div>
    <p class="assume">${esc(d.assume)}</p>
  </form>
  <script type="application/json" id="district-strings">${dj}</script>
</section>`;
  const how = `
<section class="how" id="how" aria-label="${esc(k.nav.how)}">
  ${k.how.steps.map(([line, p], i) => `<div class="stage">
    ${i === 0 ? `<h2>${esc(line)}</h2>` : `<div class="line">${esc(line)}</div>`}
    <p>${esc(p)}</p>
  </div>`).join('\n  ')}
</section>`;
  const sees = `
<section class="fields" id="sees" aria-label="${esc(k.nav.outcomes)}">
  <div class="field light">
    <p class="why">${esc(k.sees.a.p)}</p>
    <h2>${esc(k.sees.a.h2)}</h2>
  </div>
  <div class="field mid mirror">
    <p class="why">${esc(k.sees.b.p)}</p>
    <h2>${esc(k.sees.b.h2)}</h2>
  </div>
  <div class="field dark">
    <figure class="field-photo"><img src="/assets/dend-fan-single.jpg" width="1280" height="1763" alt="" loading="lazy" style="object-position: 50% 35%"></figure>
    <p class="why">${esc(k.sees.c.p)}</p>
    <h2>${esc(k.sees.c.h2)}</h2>
  </div>
</section>`;
  const trial = `
<section class="theirs" id="trial" aria-label="${esc(k.trial.h2a)} ${esc(k.trial.h2b)}">
  <h2>${esc(k.trial.h2a)}<br>${esc(k.trial.h2b)}</h2>
  <div class="grid body">
    <figure class="photo"><img src="/assets/dend-tree-pyrolusite.jpg" width="1075" height="1657" alt="" loading="lazy"></figure>
    <div class="list">
      <p class="item-lede">${esc(k.trial.lead)}</p>
      ${k.trial.items.map((i) => `<div class="item"><p>${esc(i)}</p></div>`).join('\n      ')}
    </div>
    <div class="why">
      <p>${esc(k.evidence.h2)}</p>
      <ul class="facts">
        ${k.evidence.facts.map(([f, src, url]) => `<li><a href="${url}">${esc(f)}<small>${esc(src)}</small></a></li>`).join('\n        ')}
      </ul>
      <p>${esc(k.evidence.bet)}</p>
    </div>
  </div>
</section>`;
  const more = `
<section class="where" id="more" aria-label="${esc(k.more.h2)}">
  <h2>${esc(k.more.h2)}</h2>
  <div class="body grid">
    <div class="table">
      ${k.more.rows.map(([a, b, c], i) => `<div class="row${i === 0 ? '' : ''}"><span class="k">${esc(a)}</span><span>${esc(b)}</span><span class="v">${esc(c)}</span></div>`).join('\n      ')}
    </div>
  </div>
  <p class="lede">${esc(k.more.note)}</p>
</section>`;
  const band = `
<figure class="band tint" aria-hidden="true"><img src="/assets/dend-field-solnhofen.jpg" width="1280" height="850" alt="" loading="lazy" style="object-position: 50% 40%"></figure>`;
  const close = `
<section class="close" id="close" aria-label="${esc(k.close.h2)}">
  <h2>${esc(k.close.h2)}</h2>
  <div class="foot">
    <p>${esc(k.close.p)}</p>
  </div>
  ${buyerForm(k.form, 'schools')}
</section>`;
  const bandLink = k.fundsBand;
  const funds = `
<section class="founders" aria-label="${esc(bandLink.h2)}">
  <h2>${esc(bandLink.h2)}</h2>
  <p>${esc(bandLink.body)} <a href="${localized(s, '/funds')}">${esc(bandLink.link)} →</a></p>
</section>`;
  return [hero, showcase, district, how, sees, trial, more, band, close, funds].join('\n');
}

/** The scan request form. Both the school and fund pages post it as kind
 *  "school" (see site.js); `source` prefixes the message so the two can be told
 *  apart in the signups table. */
function buyerForm(fm, source) {
  return `<form id="school-form" class="ask" novalidate data-source="${source}" data-error="${esc(fm.generic)}">
      <div class="field"><label for="school-name">${esc(fm.nameLabel)}</label><input id="school-name" name="name" type="text" autocomplete="name" maxlength="120" required aria-describedby="school-error"></div>
      <div class="field"><label for="school-role">${esc(fm.roleLabel)}</label><input id="school-role" name="role" type="text" autocomplete="organization-title" maxlength="120" required aria-describedby="school-error"></div>
      <div class="field"><label for="school-district">${esc(fm.fundLabel)}</label><input id="school-district" name="school" type="text" autocomplete="organization" maxlength="160" required aria-describedby="school-error"></div>
      <div class="field"><label for="school-email">${esc(fm.emailLabel)}</label><input id="school-email" name="email" type="email" autocomplete="email" maxlength="254" required aria-describedby="school-error"></div>
      <div class="field wide"><label for="school-message">${esc(fm.messageLabel)} <span class="hint">${esc(fm.messageHint)}</span></label><textarea id="school-message" name="message" maxlength="1980" rows="3" aria-describedby="school-error"></textarea></div>
      <div class="field wide"><button class="button" type="submit">${esc(fm.submit)}</button><p class="form-note">${esc(fm.note)}</p><p class="form-error" id="school-error" role="alert" hidden>${esc(fm.error)}</p></div>
    </form>
    <div class="form-success" id="school-sent" role="status" tabindex="-1" hidden><p>${esc(fm.success)}</p></div>`;
}

function contactForm(fm, source, tone = '') {
  return `
    <section class="section${tone ? ` ${tone}` : ''}" id="school-contact" aria-labelledby="school-contact-title">
      <div class="wrap contact-grid">
        <div>
          <h2 id="school-contact-title">${esc(fm.h2)}</h2>
          <p class="lead">${esc(fm.lead)}</p>
          <form id="school-form" novalidate data-source="${source}" data-error="${esc(fm.generic)}">
            <div class="field">
              <label for="school-name">${esc(fm.nameLabel)}</label>
              <input id="school-name" name="name" type="text" autocomplete="name" maxlength="120" required aria-describedby="school-error" />
            </div>
            <div class="field">
              <label for="school-role">${esc(fm.roleLabel)}</label>
              <input id="school-role" name="role" type="text" autocomplete="organization-title" maxlength="120" required aria-describedby="school-error" />
            </div>
            <div class="field">
              <label for="school-district">${esc(fm.fundLabel)}</label>
              <input id="school-district" name="school" type="text" autocomplete="organization" maxlength="160" required aria-describedby="school-error" />
            </div>
            <div class="field">
              <label for="school-email">${esc(fm.emailLabel)}</label>
              <input id="school-email" name="email" type="email" autocomplete="email" maxlength="254" required aria-describedby="school-error" />
            </div>
            <div class="field">
              <label for="school-message">${esc(fm.messageLabel)} <span class="hint">${esc(fm.messageHint)}</span></label>
              <textarea id="school-message" name="message" maxlength="1980" rows="4" aria-describedby="school-error"></textarea>
            </div>
            <button class="button primary" type="submit">${esc(fm.submit)}</button>
            <p class="form-note">${esc(fm.note)}</p>
            <p class="form-error" id="school-error" role="alert" hidden>${esc(fm.error)}</p>
          </form>
          <div class="form-success" id="school-sent" role="status" tabindex="-1" hidden>
            <p>${esc(fm.success)}</p>
          </div>
        </div>
      </div>
    </section>`;
}

// ── /funds: for union benefit funds ──────────────────────────────────────────
//
// One product: Part B premiums a fund reimburses that New York's Medicare
// Savings Program would pay. Two phones carry it: the retiree's yes in the
// hero, and the approval and yearly renewal further down.

function fundSections(s) {
  const size = art[s.lang];
  const h = at(s, 'hero');
  const hero = `
    <section class="hero hero-schools hero-fund" id="top" aria-labelledby="hero-title">
      <div class="wrap split hero-fund-split">
        <div class="split-copy">
          <p class="schools-eyebrow">${esc(h.eyebrow)}</p>
          <h1 id="hero-title">${payoff(h.h1Plain, h.h1Em)}</h1>
          <p class="lead">${esc(h.sub)}</p>
          <div class="hero-actions">
            <a class="button primary" href="#school-contact">${esc(h.primary)}</a>
            <a class="text-link" href="#money">${esc(h.secondary)}</a>
          </div>
          <p class="trust-line">${esc(h.trust)}</p>
        </div>
        <div class="fund-phone">
          ${device(`hero-phone-${s.lang}.webp`, size.week, h.phone.alt, 'fetchpriority="high" ')}
        </div>
      </div>
    </section>`;

  const m = at(s, 'money');
  const money = `
    <section class="section t-day" id="money" aria-labelledby="money-title">
      <div class="wrap">
        <div class="split money-split">
          <div class="split-copy">
            <h2 id="money-title">${payoff(m.h2Plain, m.h2Em)}</h2>
            <p class="lead">${esc(m.lead)}</p>
          </div>
          ${briefCard(m.stats, 'stats-title')}
        </div>
        <table class="year-table money-table">
          <caption class="sr-only">${esc(m.h2Plain)} ${esc(m.h2Em)}</caption>
          <thead>
            <tr>${m.head.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr>
          </thead>
          <tbody>
          ${m.rows
            .map(
              (r) => `<tr>
            <td data-label="${esc(m.head[0])}">${esc(r.when)}</td>
            <td data-label="${esc(m.head[1])}">${esc(r.now)}</td>
            <td data-label="${esc(m.head[2])}">${esc(r.should)}</td>
            <td data-label="${esc(m.head[3])}">${esc(r.member)}</td>
          </tr>`,
            )
            .join('\n          ')}
          </tbody>
        </table>
        <p class="network-note">${esc(m.note)}</p>
      </div>
    </section>`;

  const e = at(s, 'example');
  const example = `
    <section class="section t-noon" id="example" aria-labelledby="example-title">
      <div class="wrap split">
        <div class="split-copy">
          <h2 id="example-title">${payoff(e.h2Plain, e.h2Em)}</h2>
          <p class="lead">${esc(e.lead)}</p>
        </div>
        ${briefCard(e.brief, 'example-brief-title')}
      </div>
    </section>`;

  const d = at(s, 'after');
  const after = `
    <section class="section t-afternoon" id="after" aria-labelledby="after-title">
      <div class="wrap split">
        <figure class="fund-phone">
          ${device(`phone-${s.lang}.webp`, size.yes, at(s, 'how.phone.alt'), 'loading="lazy" ')}
          <figcaption class="caption">${esc(at(s, 'how.phone.caption'))}</figcaption>
        </figure>
        <div class="split-copy">
          <h2 id="after-title">${payoff(d.h2Plain, d.h2Em)}</h2>
          <p class="lead">${esc(d.lead)}</p>
          ${briefCard(d.brief, 'after-brief-title')}
        </div>
      </div>
    </section>`;

  const st = at(s, 'steps');
  const steps = `
    <section class="section t-night-deep" id="how" aria-labelledby="how-title">
      <div class="wrap">
        <h2 id="how-title">${payoff(st.h2Plain, st.h2Em)}</h2>
        <p class="lead">${esc(st.lead)}</p>
        <ol class="fly-steps">
          ${st.items.map((i) => `<li><strong>${esc(i.tag)}</strong><span>${esc(i.text)}</span></li>`).join('\n          ')}
        </ol>
      </div>
    </section>`;

  const df = at(s, 'different');
  const different = `
    <section class="section t-day" aria-labelledby="different-title">
      <div class="wrap">
        <h2 id="different-title">${payoff(df.h2Plain, df.h2Em)}</h2>
        ${cardGrid(df.items.map((i) => ({ title: i.h, body: i.p })))}
      </div>
    </section>`;

  const never = `
    <section class="section" aria-labelledby="never-title">
      <div class="wrap">
        <h2 id="never-title">${esc(at(s, 'never.h2'))}</h2>
        ${cardGrid(at(s, 'never.items'))}
      </div>
    </section>`;

  const sc = at(s, 'scan');
  const scan = `
    <section class="section t-golden" id="scan" aria-labelledby="scan-title">
      <div class="wrap">
        <h2 id="scan-title">${payoff(sc.h2Plain, sc.h2Em)}</h2>
        <p class="lead">${esc(sc.lead)}</p>
        <div class="scan-cards">${cardGrid(sc.cards)}</div>
        <div class="scan-lists">
          <div>
            <h3>${esc(sc.dataLabel)}</h3>
            <ul class="plain-list">${sc.data.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
          </div>
          <div>
            <h3>${esc(sc.neverLabel)}</h3>
            <ul class="plain-list">${sc.never.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
          </div>
        </div>
        <p class="scan-estimate"><span class="highlight">${esc(sc.estimate)}</span></p>
        <a class="button primary" href="#school-contact">${esc(at(s, 'hero.primary'))}</a>
      </div>
    </section>`;

  const p = at(s, 'pilot');
  const pilot = `
    <section class="section section-sheet" aria-labelledby="pilot-title">
      <div class="wrap">
        <h2 id="pilot-title">${esc(p.h2)}</h2>
        <p class="lead">${esc(p.lead)}</p>
        <table class="year-table connect-table">
          <caption class="sr-only">${esc(p.h2)}</caption>
          <thead>
            <tr><th scope="col">${esc(p.feesHead[0])}</th><th scope="col">${esc(p.feesHead[1])}</th></tr>
          </thead>
          <tbody>
          ${p.fees
            .map(([k, v]) => `<tr><td data-label="${esc(p.feesHead[0])}">${esc(k)}</td><td data-label="${esc(p.feesHead[1])}">${esc(v)}</td></tr>`)
            .join('\n          ')}
          </tbody>
        </table>
        <h3>${esc(p.measuresLabel)}</h3>
        <ul class="plain-list wide">
          ${p.measures.map((i) => `<li>${esc(i)}</li>`).join('\n          ')}
        </ul>
        <p><span class="highlight">${esc(p.guardrail)}</span></p>
      </div>
    </section>`;

  const form = contactForm(at(s, 'form'), 'funds');

  const mb = at(s, 'membersBand');
  const membersBand = `
    <section class="section t-night-deep section-band" aria-labelledby="members-band-title">
      <div class="wrap band">
        <h2 id="members-band-title">${esc(mb.h2)}</h2>
        <p class="lead">${esc(mb.body)}</p>
        <a class="text-link" href="${s.lang === 'es' ? '/es/members' : '/members'}">${esc(mb.link)}</a>
      </div>
    </section>`;

  return [hero, money, fundCalcSection(s), scan, example, after, steps, different, never, pilot, form, membersBand].join('');
}

// ── /members ──────────────────────────────────────────────────────────────────
//
// For the member holding the fund's letter, checking that we are real.

function membersPageSections(s) {
  const m = at(s, 'members');
  const hero = `
    <section class="hero hero-schools" aria-labelledby="members-hero-title">
      <div class="wrap">
        <p class="schools-eyebrow">${esc(m.hero.eyebrow)}</p>
        <h1 id="members-hero-title">${payoff(m.hero.h1Plain, m.hero.h1Em)}</h1>
        <p class="lead">${esc(m.hero.sub)}</p>
        <div class="hero-actions">
          <a class="button primary" href="#join">${esc(m.hero.primary)}</a>
        </div>
      </div>
    </section>`;
  const help = `
    <section class="section t-day" aria-labelledby="help-title">
      <div class="wrap">
        <h2 id="help-title">${esc(m.help.h2)}</h2>
        ${cardGrid(m.help.items)}
      </div>
    </section>`;
  const rules = `
    <section class="section" aria-labelledby="rules-title">
      <div class="wrap">
        <h2 id="rules-title">${esc(m.rules.h2)}</h2>
        ${cardGrid(m.rules.items)}
      </div>
    </section>`;
  const join = `
    <section class="section section-sheet" id="join" aria-labelledby="join-title">
      <div class="wrap">
        <h2 id="join-title">${esc(m.join.h2)}</h2>
        <p class="lead">${esc(m.join.lead)}</p>
${joinForm(s, 'join')}
      </div>
    </section>`;
  return [hero, memberCalcSection(s), help, rules, join].join('');
}


// ── calculators ──────────────────────────────────────────────────────────────

/** The New York MSP numbers (exported from the rules archive by
 *  archive/tools/export_site_data.py) and the shared arithmetic in
 *  public/msp-calc.js. Both are loaded in render(); the build prints each
 *  calculator's default result so the page reads correctly with no script. */
let mspRules = null;
let MSPCalc = null;

const options = (pairs, selected) =>
  pairs
    .map(([v, label]) => `<option value="${esc(v)}"${String(v) === String(selected) ? ' selected' : ''}>${esc(label)}</option>`)
    .join('');

/** The rules as JSON for the browser, safe inside a <script> element. */
const rulesScript = () =>
  `<script type="application/json" id="msp-rules">${JSON.stringify(mspRules).replace(/</g, '\\u003c')}</script>`;

/** One data-tpl attribute carrying the page's templates (as JSON) to site.js. */
const tplAttrs = (tpl, keys) => `data-tpl="${esc(JSON.stringify(Object.fromEntries(keys.map((k) => [k, tpl[k]]))))}"`;

const FUND_DEFAULTS = { retirees: 2000, reimbursed: 0.5, pension: 'with_pension', fee: 0.2 };

function fundCalcSection(s) {
  const c = at(s, 'fundCalc');
  const t = MSPCalc.fundText(mspRules, FUND_DEFAULTS, c, s.lang);
  const row = (k, rangeKey) =>
    `<li><span class="brief-v" data-out="${k}">${esc(t[k])}</span><span class="brief-l">${esc(c.out[k])}${
      rangeKey ? `<span class="brief-note" data-out="${rangeKey}">${esc(t[rangeKey])}</span>` : ''
    }</span></li>`;
  return `
    <section class="section t-noon" id="estimate" aria-labelledby="estimate-title">
      <div class="wrap">
        <h2 id="estimate-title">${payoff(c.h2Plain, c.h2Em)}</h2>
        <p class="lead">${esc(c.lead)}</p>
        <form class="calc" data-calc="fund" data-lang="${s.lang}" ${tplAttrs(c, ['range', 'ceiling', 'perRetiree', 'timing'])} novalidate>
          <div class="calc-inputs">
            <div class="field">
              <label for="fund-retirees">${esc(c.retireesLabel)}</label>
              <input id="fund-retirees" name="retirees" type="number" inputmode="numeric" min="0" step="1" value="${FUND_DEFAULTS.retirees}" />
            </div>
            <div class="field">
              <label for="fund-reimbursed">${esc(c.shareLabel)}</label>
              <select id="fund-reimbursed" name="reimbursed">${options(c.shareOptions, FUND_DEFAULTS.reimbursed)}</select>
            </div>
            <div class="field">
              <label for="fund-pension">${esc(c.pensionLabel)}</label>
              <select id="fund-pension" name="pension" aria-describedby="fund-pension-hint">${options(c.pensionOptions, FUND_DEFAULTS.pension)}</select>
              <span class="hint" id="fund-pension-hint">${esc(c.pensionHint)}</span>
            </div>
          </div>
          <div class="calc-results brief-card" aria-live="polite">
            <h3 class="brief-eyebrow">${esc(c.resultsTitle)}</h3>
            <ul class="brief-rows brief-rows-money">
              ${row('pool', 'poolRange')}
              ${row('enrolled', 'enrolledRange')}
              ${row('saved', 'savedRange')}
              ${row('fee')}
              ${row('net')}
              ${row('retirees')}
            </ul>
            <p class="calc-line" data-out="perRetiree">${esc(t.perRetiree)}</p>
            <p class="calc-line" data-out="ceiling">${esc(t.ceiling)}</p>
            <p class="brief-note" data-out="timing">${esc(t.timing)}</p>
          </div>
        </form>
        <noscript><p class="calc-noscript">${esc(c.noScript)}</p></noscript>
        <details class="calc-methods">
          <summary>${esc(c.methodsTitle)}</summary>
          <ul class="plain-list">${c.methods.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>
        </details>
        <div class="calc-scan">
          <h3>${esc(c.scanTitle)}</h3>
          <ul class="plain-list">${c.scanItems.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
          <a class="button primary" href="#school-contact">${esc(c.cta)}</a>
        </div>
        ${rulesScript()}
      </div>
    </section>`;
}

const MEMBER_DEFAULTS = { couple: false, onMedicare: 1, unearned: 2050, earned: 0, premiums: 0, reimbursed: 0.5, partA: true, medicaid: false };
const MEMBER_TPL = ['QMB', 'QI', 'over', 'needs_part_a', 'medicaid', 'gain', 'gainNone', 'extraHelp', 'premiumOne', 'premiumEach'];

function memberCalcSection(s) {
  const c = at(s, 'members.calc');
  const t = MSPCalc.memberText(mspRules, MEMBER_DEFAULTS, c, s.lang);
  const d = MEMBER_DEFAULTS;
  return `
    <section class="section t-noon" id="check" aria-labelledby="check-title">
      <div class="wrap">
        <h2 id="check-title">${esc(c.h2)}</h2>
        <p class="lead">${esc(c.lead)}</p>
        <form class="calc" data-calc="member" data-lang="${s.lang}" ${tplAttrs(c, MEMBER_TPL)} novalidate>
          <div class="calc-inputs">
            <div class="field">
              <label for="m-household">${esc(c.householdLabel)}</label>
              <select id="m-household" name="household">${options(c.householdOptions, d.couple ? '2' : '1')}</select>
            </div>
            <div class="field" data-when-couple>
              <label for="m-medicare">${esc(c.medicareLabel)}</label>
              <select id="m-medicare" name="onMedicare">${options(c.medicareOptions, d.onMedicare)}</select>
            </div>
            <div class="field">
              <label for="m-income">${esc(c.incomeLabel)}</label>
              <input id="m-income" name="unearned" type="number" inputmode="decimal" min="0" step="1" value="${d.unearned}" aria-describedby="m-income-hint" />
              <span class="hint" id="m-income-hint">${esc(c.incomeHint)}</span>
            </div>
            <div class="field">
              <label for="m-wages">${esc(c.wagesLabel)}</label>
              <input id="m-wages" name="earned" type="number" inputmode="decimal" min="0" step="1" value="${d.earned}" aria-describedby="m-wages-hint" />
              <span class="hint" id="m-wages-hint">${esc(c.wagesHint)}</span>
            </div>
            <div class="field">
              <label for="m-premiums">${esc(c.premiumsLabel)}</label>
              <input id="m-premiums" name="premiums" type="number" inputmode="decimal" min="0" step="1" value="${d.premiums}" aria-describedby="m-premiums-hint" />
              <span class="hint" id="m-premiums-hint">${esc(c.premiumsHint)}</span>
            </div>
            <div class="field">
              <label for="m-fund">${esc(c.fundLabel)}</label>
              <select id="m-fund" name="reimbursed">${options(c.fundOptions, d.reimbursed)}</select>
            </div>
            <div class="field">
              <label for="m-parta">${esc(c.partALabel)}</label>
              <select id="m-parta" name="partA">${options(c.yesNo, 'yes')}</select>
            </div>
            <div class="field">
              <label for="m-medicaid">${esc(c.medicaidLabel)}</label>
              <select id="m-medicaid" name="medicaid">${options(c.noYes, 'no')}</select>
            </div>
          </div>
          <div class="calc-results brief-card" aria-live="polite">
            <h3 class="brief-eyebrow">${esc(c.resultsTitle)}</h3>
            <p class="calc-headline" data-out="headline">${esc(t.headline)}</p>
            <p class="calc-line" data-out="gain"${t.gain ? '' : ' hidden'}>${esc(t.gain)}</p>
            <p class="calc-line" data-out="extra"${t.extra ? '' : ' hidden'}>${esc(t.extra)}</p>
            <p class="brief-note">${esc(c.note)}</p>
            <a class="button primary" href="#join">${esc(c.cta)}</a>
          </div>
        </form>
        <noscript><p class="calc-noscript">${esc(c.noScript)}</p></noscript>
        ${rulesScript()}
      </div>
    </section>`;
}



// ── /funds in the homepage's design ──────────────────────────────────────────

function fundCalcBuyer(s) {
  const c = at(s, 'fundCalc');
  const t = MSPCalc.fundText(mspRules, FUND_DEFAULTS, c, s.lang);
  const line = (k, rangeKey) => `<div><span>${esc(c.out[k])}${rangeKey ? ` <small data-out="${rangeKey}">${esc(t[rangeKey])}</small>` : ''}</span><b data-out="${k}">${esc(t[k])}</b></div>`;
  return `
<section class="scan-section calc-section" id="estimate" aria-labelledby="estimate-title">
  <h2 id="estimate-title">${esc(c.h2Plain)} ${esc(c.h2Em)}</h2>
  <p class="lede">${esc(c.lead)}</p>
  <form class="scan calc" data-calc="fund" data-lang="${s.lang}" ${tplAttrs(c, ['range', 'ceiling', 'perRetiree', 'timing'])} novalidate>
    <div class="inputs">
      <div class="field"><label for="fund-retirees">${esc(c.retireesLabel)}</label><input id="fund-retirees" name="retirees" type="number" inputmode="numeric" min="0" step="1" value="${FUND_DEFAULTS.retirees}"></div>
      <div class="field"><label for="fund-reimbursed">${esc(c.shareLabel)}</label><select id="fund-reimbursed" name="reimbursed">${options(c.shareOptions, FUND_DEFAULTS.reimbursed)}</select></div>
      <div class="field"><label for="fund-pension">${esc(c.pensionLabel)}</label><select id="fund-pension" name="pension" aria-describedby="fund-pension-hint">${options(c.pensionOptions, FUND_DEFAULTS.pension)}</select></div>
    </div>
    <p class="hint" id="fund-pension-hint">${esc(c.pensionHint)}</p>
    <div class="figure" aria-live="polite"><span data-out="net">${esc(t.net)}</span><small>${esc(c.out.net)}</small></div>
    <div class="lines">
      ${line('pool', 'poolRange')}
      ${line('enrolled', 'enrolledRange')}
      ${line('saved', 'savedRange')}
      ${line('fee')}
      ${line('retirees')}
    </div>
    <p class="assume"><span data-out="perRetiree">${esc(t.perRetiree)}</span> <span data-out="ceiling">${esc(t.ceiling)}</span> <span data-out="timing">${esc(t.timing)}</span></p>
  </form>
  <details class="methods"><summary>${esc(c.methodsTitle)}</summary><ul>${c.methods.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></details>
  ${rulesScript()}
</section>`;
}

function fundBuyerSections(s) {
  const h = at(s, 'hero'), money = at(s, 'money'), after = at(s, 'after'), never = at(s, 'never'), diff = at(s, 'different'), pilot = at(s, 'pilot'), scan = at(s, 'scan'), fm = at(s, 'form'), mb = at(s, 'membersBand');
  const ph = h.phone;
  const hero = `
<section class="hero" id="top" aria-label="Mycelium">
  <div class="field-top"></div>
  <div class="field-bottom"></div>
  <div class="sentence-wrap"><h1 class="sentence" data-rise style="--i:0">
    <span class="l1">${esc(h.h1a)}</span>
    <span class="l2">${esc(h.h1b)}</span>
  </h1></div>
  <div class="photo" aria-hidden="true">${IMGS.cycle}</div>
  <p class="support" data-rise style="--i:1">${esc(h.sub2)}</p>
  <div class="action" data-rise style="--i:2"><a class="button" href="#close">${esc(h.primary2)}</a><a class="door" href="#money">${esc(h.secondary)}</a></div>
</section>`;
  const thread = `<div class="thread" data-ui aria-label="${esc(ph.alt)}">
      <div class="who">${esc(ph.meta)} · ${esc(ph.metaTime)}</div>
      <div class="msgs">${ph.thread.map((m) => m.out ? `<div class="m me">${esc(m.out)}</div>` : `<div class="m">${esc(m.in)}</div>`).join('')}</div>
    </div>`;
  const wedge = `
<section class="wedge" id="money" aria-label="${esc(money.h2Plain)} ${esc(money.h2Em)}">
  <h2>${esc(money.h2Plain)}<br>${esc(money.h2Em)}</h2>
  <div class="text">
    <p>${esc(money.lead)}</p>
    <p>${esc(h.data)}</p>
  </div>
  <div class="obj">${thread}</div>
</section>`;
  const rule = `
<section class="scan-section" id="rule" aria-label="${esc(money.stats.eyebrow)}">
  <h2>${esc(money.stats.eyebrow)}.</h2>
  <p class="lede">${esc(money.stats.example)}</p>
  <div class="scan">
    <div class="lines">
      ${money.stats.rows.map((r) => `<div><span>${esc(r.l)} <small>${esc(r.note)}</small></span><b>${esc(r.v)}</b></div>`).join('\n      ')}
    </div>
  </div>
  <div class="who-table">
    <div class="row head">${money.head.map((c) => `<span>${esc(c)}</span>`).join('')}</div>
    ${money.rows.map((r) => `<div class="row"><span class="k">${esc(r.when)}</span><span>${esc(r.now)}</span><span>${esc(r.should)}</span><span class="v">${esc(r.member)}</span></div>`).join('\n    ')}
  </div>
  <p class="assume">${esc(money.note)}</p>
</section>`;
  const calc = fundCalcBuyer(s);
  const how = `
<section class="how" id="how" aria-label="${esc(after.h2Plain)} ${esc(after.h2Em)}">
  ${after.brief.rows.map((r, i) => `<div class="stage">
    ${i === 0 ? `<h2>${esc(after.h2Plain)} ${esc(after.h2Em)}</h2>` : ''}
    <div class="line">${esc(r.l)}</div>
    <p>${esc(r.v)}. ${esc(r.note)}</p>
  </div>`).join('\n  ')}
</section>`;
  const theirs = `
<section class="theirs" id="never" aria-label="${esc(never.h2)}">
  <h2>${esc(never.h2)}.</h2>
  <div class="grid body">
    <figure class="photo"><img src="/assets/dend-tree-pyrolusite.jpg" width="1075" height="1657" alt="" loading="lazy"></figure>
    <div class="list">
      ${never.items.map((i) => `<div class="item"><h3>${esc(i.title)}.</h3><p>${esc(i.body)}</p></div>`).join('\n      ')}
    </div>
    <div class="why">
      <p>${esc(diff.h2Plain)} ${esc(diff.h2Em)}</p>
      <ul class="facts">
        ${diff.items.map((i) => `<li>${esc(i.h)}. <small>${esc(i.p)}</small></li>`).join('\n        ')}
      </ul>
    </div>
  </div>
</section>`;
  const fees = `
<section class="where" id="fees" aria-label="${esc(pilot.h2)}">
  <h2>${esc(pilot.h2)}.</h2>
  <p class="lede">${esc(pilot.lead)}</p>
  <div class="body grid">
    <div class="table">
      ${pilot.fees.map(([a, c]) => `<div class="row"><span class="k">${esc(a)}</span><span class="v">${esc(c)}</span></div>`).join('\n      ')}
      <div class="row group"><span class="k">${esc(pilot.measuresLabel)}</span><span class="v">${pilot.measures.map(esc).join('; ')}</span></div>
    </div>
  </div>
  <p class="lede">${esc(pilot.guardrail)}</p>
</section>`;
  const band = `
<figure class="band tint" aria-hidden="true"><img src="/assets/dend-field-solnhofen.jpg" width="1280" height="850" alt="" loading="lazy" style="object-position: 50% 40%"></figure>`;
  const close = `
<section class="close" id="close" aria-label="${esc(scan.h2Plain)}">
  <h2>${esc(scan.h2Plain)}</h2>
  <div class="foot">
    <p>${esc(scan.lead)}</p>
  </div>
  ${buyerForm(fm, 'funds')}
</section>`;
  const members = `
<section class="founders" aria-label="${esc(mb.h2)}">
  <h2>${esc(mb.h2)}</h2>
  <p>${esc(mb.body)} <a href="${localized(s, '/members')}">${esc(mb.link)} →</a></p>
</section>`;
  return [hero, wedge, rule, calc, how, theirs, fees, band, close, members].join('\n');
}

// ── /members in the homepage's design ────────────────────────────────────────

function memberCalcBuyer(s) {
  const c = at(s, 'members.calc');
  const t = MSPCalc.memberText(mspRules, MEMBER_DEFAULTS, c, s.lang);
  const d = MEMBER_DEFAULTS;
  const field = (id, label, control, hint) => `<div class="field"${id === 'm-medicare' ? ' data-when-couple' : ''}><label for="${id}">${esc(label)}</label>${control}${hint ? `<span class="hint" id="${id}-hint">${esc(hint)}</span>` : ''}</div>`;
  return `
<section class="scan-section calc-section" id="check" aria-labelledby="check-title">
  <h2 id="check-title">${esc(c.h2)}</h2>
  <p class="lede">${esc(c.lead)}</p>
  <form class="scan calc" data-calc="member" data-lang="${s.lang}" ${tplAttrs(c, MEMBER_TPL)} novalidate>
    <div class="inputs two">
      ${field('m-household', c.householdLabel, `<select id="m-household" name="household">${options(c.householdOptions, d.couple ? '2' : '1')}</select>`)}
      ${field('m-medicare', c.medicareLabel, `<select id="m-medicare" name="onMedicare">${options(c.medicareOptions, d.onMedicare)}</select>`)}
      ${field('m-income', c.incomeLabel, `<input id="m-income" name="unearned" type="number" inputmode="decimal" min="0" step="1" value="${d.unearned}" aria-describedby="m-income-hint">`, c.incomeHint)}
      ${field('m-wages', c.wagesLabel, `<input id="m-wages" name="earned" type="number" inputmode="decimal" min="0" step="1" value="${d.earned}" aria-describedby="m-wages-hint">`, c.wagesHint)}
      ${field('m-premiums', c.premiumsLabel, `<input id="m-premiums" name="premiums" type="number" inputmode="decimal" min="0" step="1" value="${d.premiums}" aria-describedby="m-premiums-hint">`, c.premiumsHint)}
      ${field('m-fund', c.fundLabel, `<select id="m-fund" name="reimbursed">${options(c.fundOptions, d.reimbursed)}</select>`)}
      ${field('m-parta', c.partALabel, `<select id="m-parta" name="partA">${options(c.yesNo, 'yes')}</select>`)}
      ${field('m-medicaid', c.medicaidLabel, `<select id="m-medicaid" name="medicaid">${options(c.noYes, 'no')}</select>`)}
    </div>
    <div class="result" aria-live="polite">
      <p class="headline" data-out="headline">${esc(t.headline)}</p>
      <p data-out="gain"${t.gain ? '' : ' hidden'}>${esc(t.gain)}</p>
      <p data-out="extra"${t.extra ? '' : ' hidden'}>${esc(t.extra)}</p>
      <p class="assume">${esc(c.note)}</p>
      <a class="button" href="#close">${esc(c.cta)}</a>
    </div>
  </form>
  <noscript><p class="assume">${esc(c.noScript)}</p></noscript>
  ${rulesScript()}
</section>`;
}

function membersBuyerSections(s) {
  const m = at(s, 'members');
  const hero = `
<section class="hero" id="top" aria-label="Mycelium">
  <div class="field-top"></div>
  <div class="field-bottom"></div>
  <div class="sentence-wrap"><h1 class="sentence" data-rise style="--i:0">
    <span class="l1">${esc(m.hero.h1Plain)}</span>
    <span class="l2">${esc(m.hero.h1Em)}</span>
  </h1></div>
  <div class="photo" aria-hidden="true">${IMGS.cycle}</div>
  <p class="support" data-rise style="--i:1">${esc(m.hero.sub)}</p>
  <div class="action" data-rise style="--i:2"><a class="button" href="#close">${esc(m.hero.primary)}</a><a class="door" href="#check">${esc(m.calc.h2)}</a></div>
</section>`;
  const calc = memberCalcBuyer(s);
  const help = `
<section class="theirs" id="help" aria-label="${esc(m.help.h2)}">
  <h2>${esc(m.help.h2)}.</h2>
  <div class="grid body">
    <figure class="photo"><img src="/assets/dend-tree-pyrolusite.jpg" width="1075" height="1657" alt="" loading="lazy"></figure>
    <div class="list">
      ${m.help.items.map((i) => `<div class="item"><h3>${esc(i.title)}.</h3><p>${esc(i.body)}</p></div>`).join('\n      ')}
    </div>
    <div class="why">
      <p>${esc(m.rules.h2)}:</p>
      <ul class="facts">
        ${m.rules.items.map((i) => `<li>${esc(i.title)}. <small>${esc(i.body)}</small></li>`).join('\n        ')}
      </ul>
    </div>
  </div>
</section>`;
  const band = `
<figure class="band tint" aria-hidden="true"><img src="/assets/dend-field-solnhofen.jpg" width="1280" height="850" alt="" loading="lazy" style="object-position: 50% 40%"></figure>`;
  const close = `
<section class="close" id="close" aria-label="${esc(m.join.h2)}">
  <h2>${esc(m.join.h2)}</h2>
  <div class="foot">
    <p>${esc(m.join.lead)}</p>
  </div>
  <div class="ask join">${joinForm(s, 'join')}</div>
</section>`;
  return [hero, calc, help, band, close].join('\n');
}

// ── buyer document shell: the homepage's chrome ─────────────────────────────

function buyerDocument(s, { title, description, canonical, alts, body, langHref, share, shareAlt, nav, ctaLabel, ctaHref }) {
  const alt = alts.map(([hreflang, href]) => `<link rel="alternate" hreflang="${hreflang}" href="${SITE}${href}" />`).join('\n');
  const other = s.lang === 'en' ? 'es' : 'en';
  const legal = s.lang === 'en'
    ? 'Mycelium is built by Mitch Howard and Sarah Xu, formerly of Clay. © 2026 Mycelium · San Francisco and New York'
    : 'Mycelium lo construyen Mitch Howard y Sarah Xu, antes en Clay. © 2026 Mycelium · San Francisco y Nueva York';
  const photos = s.lang === 'en' ? 'Photographs from Wikimedia Commons' : 'Fotografías de Wikimedia Commons';
  const talk = s.lang === 'en' ? 'Talk to the founders.' : 'Hable con los fundadores.';
  const talkBtn = s.lang === 'en' ? 'Talk to the founders' : 'Hablar con los fundadores';
  return `<!doctype html>
<html lang="${s.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Mycelium">
<meta property="og:url" content="${SITE}${canonical}">
<meta property="og:image" content="${SITE}/${share}">
<meta property="og:image:alt" content="${esc(shareAlt)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="${SITE}${canonical}">
${alt}
<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#1a1512">
<script>document.documentElement.classList.add('js')</script>
<link rel="preconnect" href="https://api.fontshare.com">
<link rel="preconnect" href="https://cdn.fontshare.com" crossorigin>
<link href="https://api.fontshare.com/v2/css?f[]=gambarino@400&f[]=general-sans@400,500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/buyer.css?v=11">
<script src="/msp-calc.js?v=21" defer></script>
<script src="/site.js?v=24" defer></script>
</head>
<body>

<header class="nav" id="nav">
  <a class="mark" href="${localized(s, '/')}">Mycelium</a>
  <ul>
    ${nav.map(([label, href]) => `<li><a href="${href}">${esc(label)}</a></li>`).join('\n    ')}
    <li><a href="${langHref}" lang="${other}" hreflang="${other}">${esc(at(s, 'nav.langSwitch'))}</a></li>
  </ul>
  <a class="nav-action" href="${ctaHref}">${esc(ctaLabel)}</a>
</header>

<main id="top">
${body}
</main>

<footer class="footer">
  <div class="top">
    <div class="invite">
      <h2>${talk}</h2>
      <a class="button" href="mailto:hello@try-mycelium.com?subject=Mycelium">${talkBtn}</a>
    </div>
    <div class="links">
      <a href="mailto:hello@try-mycelium.com">hello@try-mycelium.com</a>
      <a href="https://try-mycelium.com">try-mycelium.com</a>
      <a href="${langHref}" lang="${other}" hreflang="${other}">${esc(at(s, 'nav.langSwitch'))}</a>
    </div>
  </div>
  <div class="legal">
    <span>${legal}</span>
    <span>${photos}: <a href="https://commons.wikimedia.org/wiki/File:Rhizomorph_(5211991289).jpg">Alex Lomas, CC BY 2.0</a> · <a href="https://commons.wikimedia.org/wiki/File:Dendrit.jpg">Ivtorov, CC BY-SA 4.0</a> · <a href="https://commons.wikimedia.org/wiki/File:Pyrolusite_(Solnhofen_Bavi%C3%A8re_-_Allemagne).jpg">Parent Géry, CC BY-SA 3.0</a> · <a href="https://commons.wikimedia.org/wiki/File:Pyrolusite_-_dendrites_de_mangan%C3%A8se_1.JPG">Parent Géry, CC BY-SA 3.0</a> · <a href="https://commons.wikimedia.org/wiki/File:Manganese_Dendrites_(6735677997).jpg">GorissM, CC BY-SA 2.0</a></span>
  </div>
  <div class="name" aria-hidden="true">Mycelium</div>
</footer>

<script>
(function(){
  var nav = document.getElementById('nav');
  var lights = document.querySelectorAll('.hero .field-top, .field.light, .close');
  function tick(){ var y = 36, on = false; lights.forEach(function(el){ var r = el.getBoundingClientRect(); if (r.top <= y && r.bottom > y) on = true; }); nav.classList.toggle('on-light', on); }
  tick(); window.addEventListener('scroll', tick, { passive: true }); window.addEventListener('resize', tick);
})();
</script>
</body>
</html>
`;
}

// ── document shell ───────────────────────────────────────────────────────────

function document(s, { page, title, description, canonical, alts, body, langHref, cta, ctaLabel = at(s, 'nav.join'), shareAlt, share }) {
  const alt = alts
    .map(([hreflang, href]) => `<link rel="alternate" hreflang="${hreflang}" href="${SITE}${href}" />`)
    .join('\n    ');
  return `<!doctype html>
<html lang="${s.lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <meta name="theme-color" content="#FAD6B6" />
    <link rel="canonical" href="${SITE}${canonical}" />
    ${alt}
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Mycelium" />
    <meta property="og:url" content="${SITE}${canonical}" />
    <meta property="og:locale" content="${s.locale}" />
    <meta property="og:locale:alternate" content="${s.lang === 'en' ? 'es_US' : 'en_US'}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:image" content="${SITE}/${share}" />
    <meta property="og:image:alt" content="${esc(shareAlt)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${SITE}/${share}" />
    <link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="/site.css?v=22" />
    <script src="/msp-calc.js?v=21" defer></script>
    <script src="/site.js?v=22" defer></script>
  </head>
  <body>
    <a class="skip-link" href="#main">${esc(at(s, 'a11y.skip'))}</a>
${header(s, { page, cta, ctaLabel, langHref })}
    <main id="main">
${body}
    </main>
${footer(s, { page, langHref })}
${cta === '#join' ? `    <a class="sticky-join" id="sticky-join" href="#join" hidden>${esc(ctaLabel)}</a>
` : ''}  </body>
</html>
`;
}

// ── render ───────────────────────────────────────────────────────────────────

/** The device art, and the URL to fetch it from. Set once render() has read the
 *  lock file: the art is regenerated in place under the same filenames, so the
 *  URL has to change when it does, or a browser that has seen an older render
 *  keeps showing it and a redraw looks like it did nothing. */
let art = {};
let shot = (name) => `/${name}`;

async function render() {
  // The device art is built by scripts/build-phone.mjs, which records the size to
  // render at. Missing or stale art is a build failure, not a broken image on the page.
  const lockPath = new URL('./phone.lock.json', import.meta.url);
  if (!existsSync(lockPath)) throw new Error('missing tools/site/phone.lock.json — run npm run build:phone');
  const lock = JSON.parse(await readFile(lockPath, 'utf8'));
  art = lock.art;
  shot = (name) => `/${name}?v=${lock.copyHash}`;

  // Calculator numbers (from the rules archive) and the shared arithmetic.
  mspRules = JSON.parse(await readFile(new URL('./msp-ny.json', import.meta.url), 'utf8'));
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(await readFile(path.join(OUT, 'msp-calc.js'), 'utf8'), sandbox);
  MSPCalc = sandbox.MSPCalc;

  const load = async (lang) => (await import(`./strings.${lang}.mjs`)).default;
  const en = await load('en');
  const es = await load('es');

  const pages = [];
  for (const [s, dir, share, shareSchools, shareFunds] of [
    [en, '', 'share.png', 'share-schools.png', 'share-funds.png'],
    [es, 'es', 'share-es.png', 'share-schools-es.png', 'share-funds-es.png'],
  ]) {
    // The homepage (public/index.html and public/es.html) is hand-written, not
    // generated: see "The website" in AGENTS.md. The generator builds the six
    // pages below only.
    // /schools, for school districts and charter networks.
    pages.push({
      file: dir ? `${dir}/schools.html` : 'schools.html',
      html: buyerDocument(s, {
        title: at(s, 'schools.meta.title'),
        description: at(s, 'schools.meta.description'),
        canonical: dir ? '/es/schools' : '/schools',
        alts: [['en', '/schools'], ['es', '/es/schools']],
        body: schoolSections(s),
        langHref: dir ? '/schools' : '/es/schools',
        nav: [[at(s, 'schools.nav.outcomes'), '#sees'], [at(s, 'schools.nav.how'), '#how'], [at(s, 'schools.nav.funds'), localized(s, '/funds')]],
        ctaLabel: at(s, 'schools.nav.join'),
        ctaHref: '#close',
        shareAlt: at(s, 'schools.meta.shareAlt'),
        share: shareSchools,
      }),
    });
    // /funds, for union benefit funds that reimburse Part B.
    pages.push({
      file: dir ? `${dir}/funds.html` : 'funds.html',
      html: buyerDocument(s, {
        title: at(s, 'meta.title'),
        description: at(s, 'meta.description'),
        canonical: dir ? '/es/funds' : '/funds',
        alts: [['en', '/funds'], ['es', '/es/funds']],
        body: fundBuyerSections(s),
        langHref: dir ? '/funds' : '/es/funds',
        nav: [[at(s, 'nav.money'), '#money'], [at(s, 'nav.how'), '#how'], [at(s, 'nav.members'), localized(s, '/members')]],
        ctaLabel: at(s, 'hero.primary2'),
        ctaHref: '#close',
        shareAlt: at(s, 'meta.shareAlt'),
        share: shareFunds,
      }),
    });
    pages.push({
      file: dir ? `${dir}/members.html` : 'members.html',
      html: buyerDocument(s, {
        title: at(s, 'members.meta.title'),
        description: at(s, 'members.meta.description'),
        canonical: dir ? '/es/members' : '/members',
        alts: [['en', '/members'], ['es', '/es/members']],
        body: membersBuyerSections(s),
        langHref: dir ? '/members' : '/es/members',
        nav: [[at(s, 'members.calc.h2'), '#check'], [at(s, 'members.help.h2'), '#help'], [at(s, 'nav.money'), localized(s, '/funds') + '#money']],
        ctaLabel: at(s, 'nav.joinMembers'),
        ctaHref: '#close',
        shareAlt: at(s, 'members.meta.shareAlt'),
        share: shareFunds,
      }),
    });
  }
  return pages;
}

async function main() {
  const check = process.argv.includes('--check');
  const pages = await render();
  let drift = false;
  for (const page of pages) {
    const target = path.join(OUT, page.file);
    if (check) {
      const current = existsSync(target) ? await readFile(target, 'utf8') : null;
      if (current !== page.html) {
        console.error(`drift: public/${page.file} is not what the strings produce — run npm run build:site`);
        drift = true;
      }
    } else {
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, page.html);
      console.log(`wrote public/${page.file}`);
    }
  }
  if (check) {
    if (drift) process.exit(1);
    console.log(`ok: ${pages.length} pages match the strings.`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

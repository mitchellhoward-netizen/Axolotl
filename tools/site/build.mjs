/**
 * Renders the static site from the per-language strings files.
 *
 *     npm run build:site      # write public/index.html, public/es.html,
 *                             # public/members.html, public/es/members.html,
 *                             # public/employers.html, public/es/employers.html
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
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const OUT = path.join(ROOT, 'public');
const SITE = 'https://www.get-axolotl.com';

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

/** The header. `prefix` is '' on the home page and '/' elsewhere, so the
 *  section links keep working from a page that does not have those sections.
 *  `ctaLabel` names the header button: a pilot on the fund pages, a text on
 *  /members. */
function header(s, { prefix, cta, ctaLabel, langHref }) {
  // Section links point at this language's home page, so /es/members does not
  // send a Spanish reader to the English page.
  const home = s.lang === 'es' ? '/es' : '/';
  const base = prefix ? home : '';
  const nav = [
    [at(s, 'nav.money'), `${base}#money`],
    [at(s, 'nav.how'), `${base}#how`],
    [at(s, 'nav.members'), s.lang === 'es' ? '/es/members' : '/members'],
  ]
    .map(([label, href]) => `<li><a href="${href}">${esc(label)}</a></li>`)
    .join('');
  return `
  <header class="site-header">
    <div class="wrap header-bar">
      <a class="brand" href="${home}" aria-label="${esc(at(s, 'a11y.home'))}">
        <img src="/ollie/ollie.webp" alt="" width="44" height="44" />
        <span>Axolotl</span>
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

function footer(s, { langHref }) {
  const home = s.lang === 'es' ? '/es' : '/';
  const links = at(s, 'footer.links')
    .map((l) => `<li><a href="${l.href}">${esc(l.label)}</a></li>`)
    .join('');
  return `
  <footer class="site-footer">
    <div class="wrap footer-grid">
      <div>
        <a class="brand brand-footer" href="${home}">
          <img src="/ollie/ollie.webp" alt="" width="44" height="44" />
          <span>Axolotl</span>
        </a>
        <p>${esc(at(s, 'footer.tagline'))}</p>
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

// ── the homepage: for union benefit funds ────────────────────────────────────
//
// One idea (docs/FUNDS-MONEY-MAP.md): the fund pays bills that Medicare, Social
// Security or the state should pay, and the member loses money in the same
// cases. Two phones carry it: a retiree's Part B premium in the hero, and a
// disability award further down.

function homeSections(s) {
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

  const d = at(s, 'disability');
  const disability = `
    <section class="section t-afternoon" id="disability" aria-labelledby="disability-title">
      <div class="wrap split">
        <figure class="fund-phone">
          ${device(`phone-${s.lang}.webp`, size.yes, at(s, 'how.phone.alt'), 'loading="lazy" ')}
          <figcaption class="caption">${esc(at(s, 'how.phone.caption'))}</figcaption>
        </figure>
        <div class="split-copy">
          <h2 id="disability-title">${payoff(d.h2Plain, d.h2Em)}</h2>
          <p class="lead">${esc(d.lead)}</p>
          ${briefCard(d.brief, 'disability-brief-title')}
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

  const fm = at(s, 'form');
  const form = `
    <section class="section" id="school-contact" aria-labelledby="school-contact-title">
      <div class="wrap contact-grid">
        <div>
          <h2 id="school-contact-title">${esc(fm.h2)}</h2>
          <p class="lead">${esc(fm.lead)}</p>
          <form id="school-form" novalidate data-source="funds" data-error="${esc(fm.generic)}">
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

  const mb = at(s, 'membersBand');
  const membersBand = `
    <section class="section t-night-deep section-band" aria-labelledby="members-band-title">
      <div class="wrap band">
        <h2 id="members-band-title">${esc(mb.h2)}</h2>
        <p class="lead">${esc(mb.body)}</p>
        <a class="text-link" href="${s.lang === 'es' ? '/es/members' : '/members'}">${esc(mb.link)}</a>
      </div>
    </section>`;

  return [hero, money, scan, example, disability, steps, different, never, pilot, form, membersBand].join('');
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
  return [hero, help, rules, join].join('');
}


// ── /employers ────────────────────────────────────────────────────────────────

function employersPageSections(s) {
  const heroBlock = `
    <section class="hero hero-schools" aria-labelledby="schools-hero-title">
      <div class="wrap">
        <p class="schools-eyebrow">${esc(at(s, 'employers.hero.eyebrow'))}</p>
        <h1 id="schools-hero-title">${payoff(at(s, 'employers.hero.h1Plain'), at(s, 'employers.hero.h1Em'))}</h1>
        <p class="lead">${esc(at(s, 'employers.hero.sub'))}</p>
        <div class="hero-actions">
          <a class="button primary" href="#school-contact">${esc(at(s, 'employers.hero.primary'))}</a>
          <a class="text-link" href="#office">${esc(at(s, 'employers.hero.secondary'))}</a>
        </div>
      </div>
    </section>`;

  // The office's week: the same back-and-forth parents are stuck in, from the
  // school's side. This is the table a principal reads first.
  const o = at(s, 'employers.office');
  const officeRows = o.rows
    .map(
      (r) => `<tr>
            <td data-label="${esc(o.head[0])}">${esc(r.pain)}</td>
            <td data-label="${esc(o.head[1])}">${esc(r.does)}</td>
            <td data-label="${esc(o.head[2])}">${esc(r.who)}</td>
          </tr>`,
    )
    .join('\n          ');
  const office = `
    <section class="section t-day" id="office" aria-labelledby="office-title">
      <div class="wrap">
        <h2 id="office-title">${payoff(o.h2Plain, o.h2Em)}</h2>
        <p class="lead">${esc(o.lead)}</p>
        <table class="year-table">
          <caption class="sr-only">${esc(o.h2Plain)} ${esc(o.h2Em)}</caption>
          <thead>
            <tr><th scope="col">${esc(o.head[0])}</th><th scope="col">${esc(o.head[1])}</th><th scope="col">${esc(o.head[2])}</th></tr>
          </thead>
          <tbody>
          ${officeRows}
          </tbody>
        </table>
      </div>
    </section>`;

  // The same need twice: the letter an AI writes with no front door, and the
  // request Axolotl sends.
  const d = at(s, 'employers.door');
  const foot = (items) => items.map((i) => `<li>${esc(i)}</li>`).join('');
  const doorRows = d.after.rows
    .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
    .join('');
  const door = `
    <section class="section t-noon" id="door" aria-labelledby="door-title">
      <div class="wrap">
        <h2 id="door-title">${payoff(d.h2Plain, d.h2Em)}</h2>
        <p class="lead">${esc(d.lead)}</p>
        <div class="door-pair">
          <article class="door-card door-before" aria-label="${esc(d.before.label)}">
            <p class="door-label"><span>${esc(d.before.label)}</span><span>${esc(d.example)}</span></p>
            <p class="door-to">${esc(d.before.to)}</p>
            <p class="door-subject">${esc(d.before.subject)}</p>
            <p class="door-body">${esc(d.before.body)}</p>
            <ul class="door-foot">${foot(d.before.foot)}</ul>
          </article>
          <article class="door-card door-after" aria-label="${esc(d.after.label)}">
            <p class="door-label"><span>${esc(d.after.label)}</span><span>${esc(d.example)}</span></p>
            <p class="door-to">${esc(d.after.to)}</p>
            <dl class="door-rows">${doorRows}</dl>
            <p class="door-sent">${esc(d.after.sent)}</p>
            <ul class="door-foot">${foot(d.after.foot)}</ul>
          </article>
        </div>
        <div class="tension">
          <h3>${esc(d.tensionTitle)}</h3>
          <p>${esc(d.tensionBody)}</p>
        </div>
      </div>
    </section>`;

  // A text thread in the page's own markup: `out` is the person holding the phone.
  const thread = (label, msgs, outFrom) => `<figure class="staff-thread">
            <figcaption>${esc(label)}</figcaption>
            <ol>${msgs
              .map((m) => `<li class="staff-msg staff-msg-${m.from === outFrom ? 'out' : 'in'}">${esc(m.text)}</li>`)
              .join('')}</ol>
          </figure>`;

  const a = at(s, 'employers.attendance');
  const attendance = `
    <section class="section t-afternoon" id="attendance" aria-labelledby="attendance-title">
      <div class="wrap">
        <h2 id="attendance-title">${payoff(a.h2Plain, a.h2Em)}</h2>
        <p class="lead">${esc(a.lead)}</p>
        <div class="att-split">
          <div class="att-items">
            ${a.items.map((i) => `<article><h3>${esc(i.h)}</h3><p>${esc(i.p)}</p></article>`).join('\n            ')}
          </div>
          ${thread(a.threadLabel, a.thread, 'parent')}
        </div>
        <p class="att-research">${esc(a.research)}</p>
      </div>
    </section>`;

  // The flywheel: six steps that end where they began, plus one worked example
  // of what an official path does to the back-and-forth.
  const f = at(s, 'employers.flywheel');
  const dots = (n) => `<span class="fly-dots" aria-hidden="true">${'<i></i>'.repeat(n)}</span>`;
  const flywheel = `
    <section class="section t-night-deep" id="flywheel" aria-labelledby="flywheel-title">
      <div class="wrap">
        <h2 id="flywheel-title">${payoff(f.h2Plain, f.h2Em)}</h2>
        <p class="lead">${esc(f.lead)}</p>
        <ol class="fly-steps">
          ${f.steps.map((st) => `<li><strong>${esc(st.tag)}</strong><span>${esc(st.text)}</span></li>`).join('\n          ')}
        </ol>
        <div class="fly-example">
          <p class="fly-example-label">${esc(f.example.label)}</p>
          <p class="fly-row"><span>${esc(f.example.beforeLabel)}</span>${dots(f.example.before)}<b>${esc(f.example.before)}</b></p>
          <p class="fly-row is-after"><span>${esc(f.example.afterLabel)}</span>${dots(f.example.after)}<b>${esc(f.example.after)}</b></p>
        </div>
        <p class="network-note">${esc(f.note)}</p>
      </div>
    </section>`;

  const p = at(s, 'employers.paths');
  const paths = `
    <section class="section t-golden" id="paths" aria-labelledby="paths-title">
      <div class="wrap split path-split">
        <div class="split-copy">
          <h2 id="paths-title">${payoff(p.h2Plain, p.h2Em)}</h2>
          <p class="lead">${esc(p.lead)}</p>
          <ol class="path-steps path-steps-stack">${p.steps
            .map((st) => `<li><span class="path-step-tag">${esc(st.tag)}</span>${esc(st.text)}</li>`)
            .join('')}</ol>
        </div>
        <div class="path-side">
          ${pathCard(p.card)}
        </div>
      </div>
    </section>`;

  const st = at(s, 'employers.staff');
  const brief = st.brief.rows
    .map(
      (r) => `<li><span class="brief-v">${esc(r.v)}</span><span class="brief-l">${esc(r.l)}<span class="brief-note">${esc(r.note)}</span></span></li>`,
    )
    .join('');
  const staff = `
    <section class="section t-noon" id="staff" aria-labelledby="staff-title">
      <div class="wrap">
        <h2 id="staff-title">${payoff(st.h2Plain, st.h2Em)}</h2>
        <p class="lead">${esc(st.lead)}</p>
        <div class="staff-pair">
          ${thread(st.threadLabel, st.thread, 'staff')}
          <article class="brief-card" aria-labelledby="brief-title">
            <p class="door-label"><span id="brief-title">${esc(st.brief.eyebrow)}</span><span>${esc(st.brief.example)}</span></p>
            <ul class="brief-rows">${brief}</ul>
            <p class="brief-foot">${esc(st.brief.foot)}</p>
          </article>
        </div>
      </div>
    </section>`;

  const c = at(s, 'employers.connect');
  const connect = `
    <section class="section t-day" id="connect" aria-labelledby="connect-title">
      <div class="wrap">
        <h2 id="connect-title">${payoff(c.h2Plain, c.h2Em)}</h2>
        <p class="lead">${esc(c.lead)}</p>
        <table class="year-table connect-table">
          <caption class="sr-only">${esc(c.h2Plain)} ${esc(c.h2Em)}</caption>
          <thead>
            <tr><th scope="col">${esc(c.head[0])}</th><th scope="col">${esc(c.head[1])}</th></tr>
          </thead>
          <tbody>
          ${c.rows
            .map(([k, v]) => `<tr><td data-label="${esc(c.head[0])}">${esc(k)}</td><td data-label="${esc(c.head[1])}">${esc(v)}</td></tr>`)
            .join('\n          ')}
          </tbody>
        </table>
        <div class="tension">
          <h3>${esc(c.ruleTitle)}</h3>
          <p>${esc(c.ruleBody)}</p>
          <p>${esc(c.start)}</p>
        </div>
      </div>
    </section>`;

  const never = `
    <section class="section" aria-labelledby="never-title">
      <div class="wrap">
        <h2 id="never-title">${esc(at(s, 'employers.never.h2'))}</h2>
        <div class="never-grid">
          ${at(s, 'employers.never.items')
            .map((i) => `<article><h3>${esc(i.title)}</h3><p>${esc(i.body)}</p></article>`)
            .join('\n          ')}
        </div>
      </div>
    </section>`;

  const equity = `
    <section class="section" aria-labelledby="equity-title">
      <div class="wrap">
        <h2 id="equity-title">${esc(at(s, 'employers.equity.h2'))}</h2>
        <p class="lead">${esc(at(s, 'employers.equity.lead'))}</p>
        <ul class="plain-list wide">
          ${at(s, 'employers.equity.items').map((i) => `<li>${esc(i)}</li>`).join('\n          ')}
        </ul>
      </div>
    </section>`;

  const pilot = `
    <section class="section section-sheet" aria-labelledby="pilot-title">
      <div class="wrap">
        <h2 id="pilot-title">${esc(at(s, 'employers.pilot.h2'))}</h2>
        <p class="lead">${esc(at(s, 'employers.pilot.lead'))}</p>
        <h3>${esc(at(s, 'employers.pilot.baselineTitle'))}</h3>
        <p>${esc(at(s, 'employers.pilot.baseline'))}</p>
        <h3>${esc(at(s, 'employers.pilot.measuresLabel'))}</h3>
        <ul class="plain-list wide">
          ${at(s, 'employers.pilot.measures').map((i) => `<li>${esc(i)}</li>`).join('\n          ')}
        </ul>
        <p>${esc(at(s, 'employers.pilot.consent'))}</p>
        <p>${esc(at(s, 'employers.pilot.integration'))}</p>
        <p><span class="highlight">${esc(at(s, 'employers.pilot.guardrail'))}</span></p>
      </div>
    </section>`;

  const form = `
    <section class="section" id="school-contact" aria-labelledby="school-contact-title">
      <div class="wrap contact-grid">
        <div>
          <h2 id="school-contact-title">${esc(at(s, 'employers.form.h2'))}</h2>
          <p class="lead">${esc(at(s, 'employers.form.lead'))}</p>
          <form id="school-form" novalidate data-error="${esc(at(s, 'employers.form.generic'))}">
            <div class="field">
              <label for="school-name">${esc(at(s, 'employers.form.nameLabel'))}</label>
              <input id="school-name" name="name" type="text" autocomplete="name" maxlength="120" required aria-describedby="school-error" />
            </div>
            <div class="field">
              <label for="school-role">${esc(at(s, 'employers.form.roleLabel'))}</label>
              <input id="school-role" name="role" type="text" autocomplete="organization-title" maxlength="120" required aria-describedby="school-error" />
            </div>
            <div class="field">
              <label for="school-district">${esc(at(s, 'employers.form.schoolLabel'))}</label>
              <input id="school-district" name="school" type="text" autocomplete="organization" maxlength="160" required aria-describedby="school-error" />
            </div>
            <div class="field">
              <label for="school-email">${esc(at(s, 'employers.form.emailLabel'))}</label>
              <input id="school-email" name="email" type="email" autocomplete="email" maxlength="254" required aria-describedby="school-error" />
            </div>
            <div class="field">
              <label for="school-message">${esc(at(s, 'employers.form.messageLabel'))} <span class="hint">${esc(at(s, 'employers.form.messageHint'))}</span></label>
              <textarea id="school-message" name="message" maxlength="2000" rows="4" aria-describedby="school-error"></textarea>
            </div>
            <button class="button primary" type="submit">${esc(at(s, 'employers.form.submit'))}</button>
            <p class="form-note">${esc(at(s, 'employers.form.note'))}</p>
            <p class="form-error" id="school-error" role="alert" hidden>${esc(at(s, 'employers.form.error'))}</p>
          </form>
          <div class="form-success" id="school-sent" role="status" tabindex="-1" hidden>
            <p>${esc(at(s, 'employers.form.success'))}</p>
          </div>
        </div>
      </div>
    </section>`;

  return [heroBlock, office, door, attendance, flywheel, paths, staff, connect, never, equity, pilot, form].join('');
}

// ── document shell ───────────────────────────────────────────────────────────

function document(s, { title, description, canonical, alts, body, prefix, langHref, cta, ctaLabel = at(s, 'nav.join'), shareAlt, share }) {
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
    <meta property="og:site_name" content="Axolotl" />
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
    <link rel="stylesheet" href="/site.css?v=17" />
    <script src="/site.js?v=17" defer></script>
  </head>
  <body>
    <a class="skip-link" href="#main">${esc(at(s, 'a11y.skip'))}</a>
${header(s, { prefix, cta, ctaLabel, langHref })}
    <main id="main">
${body}
    </main>
${footer(s, { prefix, langHref })}
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

  const load = async (lang) => (await import(`./strings.${lang}.mjs`)).default;
  const en = await load('en');
  const es = await load('es');

  const pages = [];
  for (const [s, dir, share] of [
    [en, '', 'share.png'],
    [es, 'es', 'share-es.png'],
  ]) {
    pages.push({
      file: dir ? `${dir}.html` : 'index.html',
      html: document(s, {
        title: at(s, 'meta.title'),
        description: at(s, 'meta.description'),
        canonical: dir ? '/es' : '/',
        alts: [['en', '/'], ['es', '/es'], ['x-default', '/']],
        body: homeSections(s),
        prefix: '',
        langHref: dir ? '/' : '/es',
        cta: '#school-contact',
        shareAlt: at(s, 'meta.shareAlt'),
        share,
      }),
    });
    pages.push({
      file: dir ? `${dir}/employers.html` : 'employers.html',
      html: document(s, {
        title: at(s, 'employers.meta.title'),
        description: at(s, 'employers.meta.description'),
        canonical: dir ? '/es/employers' : '/employers',
        alts: [['en', '/employers'], ['es', '/es/employers']],
        body: employersPageSections(s),
        prefix: '/',
        langHref: dir ? '/employers' : '/es/employers',
        cta: '#school-contact',
        shareAlt: at(s, 'employers.meta.shareAlt'),
        share,
      }),
    });
    pages.push({
      file: dir ? `${dir}/members.html` : 'members.html',
      html: document(s, {
        title: at(s, 'members.meta.title'),
        description: at(s, 'members.meta.description'),
        canonical: dir ? '/es/members' : '/members',
        alts: [['en', '/members'], ['es', '/es/members']],
        body: membersPageSections(s),
        prefix: '/',
        langHref: dir ? '/members' : '/es/members',
        cta: '#join',
        ctaLabel: at(s, 'nav.joinMembers'),
        shareAlt: at(s, 'members.meta.shareAlt'),
        share,
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

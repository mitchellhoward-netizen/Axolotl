/**
 * Renders the static site from the per-language strings files.
 *
 *     npm run build:site      # write public/index.html, public/es/index.html,
 *                             # public/schools.html, public/es/schools.html
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

/** The header. `prefix` is '' on the home page and '/' on /schools, so the
 *  section links keep working from a page that does not have those sections. */
function header(s, { prefix, cta, langHref }) {
  // Section links point at this language's home page, so /es/schools does not
  // send a Spanish reader to the English page.
  const home = s.lang === 'es' ? '/es' : '/';
  const base = prefix ? home : '';
  const nav = [
    [at(s, 'nav.how'), `${base}#inbox`],
    [at(s, 'nav.help'), `${base}#qualify`],
    [at(s, 'nav.schools'), s.lang === 'es' ? '/es/schools' : '/schools'],
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
        <a class="button primary header-cta" href="${cta}">${esc(at(s, 'nav.join'))}</a>
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

// ── the homepage: one school day ─────────────────────────────────────────────
//
// Each section is a moment in a parent's day (7:15 AM to 9:40 PM) and carries
// its time. The light is done in CSS: every section has a `t-*` class that sets
// its own background, and neighbouring sections start where the last one ended,
// so the page reads as one day getting later rather than a stack of panels.

/** The small time stamp that opens every section: "7:15 AM · A school day". */
const timeChip = (d) =>
  `<p class="time-chip"><span class="time-chip-time">${esc(d.time)}</span><span class="time-chip-label">${esc(d.label)}</span></p>`;

/** A heading whose last words are the italic payoff: "Help your kid <em>already qualifies for.</em>" */
const payoff = (plain, em) => `${esc(plain)} <em>${esc(em)}</em>`;

/** A device render from scripts/build-phone.mjs. `alt` '' marks a decorative copy. */
function device(name, size, alt, extra = '') {
  return `<img class="device" src="${shot(name)}" width="${size.width}" height="${size.height}" alt="${esc(alt)}" decoding="async" ${extra}/>`;
}

/** The alt text for one of the week screens: the conversation, then its status. */
function weekAlt(s, i) {
  const c = at(s, 'week.cols')[i];
  const said = c.turns
    .filter((t) => t.in || t.out)
    .map((t) => `${t.out ? at(s, 'week.you') : 'Axolotl'}: ${t.out ?? t.in}`)
    .join(' ');
  return `${at(s, 'week.shotAlt')} ${c.h3}. ${said} ${s.statuses[c.status]}`;
}

/** A phone-number signup. The hero and the night section each carry one, so a
 *  parent never has to scroll the whole day to join; `id` keeps them apart. */
function joinForm(s, id) {
  return `
          <form id="${id}-form" class="pill-form" novalidate data-error="${esc(at(s, 'join.generic'))}" data-error-phone="${esc(at(s, 'join.error'))}">
            <label class="sr-only" for="${id}-phone">${esc(at(s, 'join.phoneLabel'))}</label>
            <div class="pill-field">
              <input id="${id}-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="30" required placeholder="${esc(at(s, 'day.phonePlaceholder'))}" aria-describedby="${id}-error" />
              <button class="button primary" type="submit">${esc(at(s, 'join.submit'))}</button>
            </div>
            <p class="form-note">${esc(at(s, 'join.note'))}</p>
            <p class="form-error" id="${id}-error" role="alert" hidden></p>
          </form>
          <div class="form-success" id="${id}-sent" role="status" tabindex="-1" hidden>
            <p id="${id}-sent-text" data-template="${esc(at(s, 'join.success'))}"></p>
          </div>`;
}

/** Blurred school paper drifting behind the phones: the mess Axolotl sorts out.
 *  Pure decoration, so it carries no words a screen reader would trip over. */
const clutter = `
        <div class="clutter" aria-hidden="true">
          <span class="paper paper-slip"><i></i><i></i><i></i><b></b></span>
          <span class="paper paper-menu"><i></i><i></i><i></i><i></i></span>
          <span class="paper paper-note"></span>
          <span class="paper paper-card"><i></i><i></i></span>
        </div>`;

function hero(s) {
  const d = at(s, 'day.morning');
  const agents = at(s, 'day.agents');
  if (agents.items.length !== 8) throw new Error(`day.agents.items must have 8 lines (the animation is timed for 8), ${s.lang} has ${agents.items.length}`);
  const lines = agents.items.map((line) => `<span>${esc(line)}</span>`).join('');
  const size = art[s.lang];
  return `
    <section class="hero t-morning" id="top" aria-labelledby="hero-title">
      <div class="sun" aria-hidden="true"></div>${clutter}
      <div class="wrap hero-copy">
        ${timeChip(d)}
        <div class="agents" aria-hidden="true">
          <div class="agents-track">${lines}<span class="agents-parents">${esc(agents.parentsLead)} <s>${esc(agents.parentsTail)}</s></span><span>${esc(agents.items[0])}</span></div>
        </div>
        <h1 id="hero-title">${payoff(d.h1Plain, d.h1Em)}</h1>
        <p class="lead">${esc(at(s, 'hero.sub'))}</p>
${joinForm(s, 'hero-join')}
        <p class="trust-line">${esc(at(s, 'hero.trust'))}</p>
      </div>
      <div class="hero-stage">
        ${device(`week-1-${s.lang}.webp`, size.weekcol0, '', 'loading="lazy" ')}
        ${device(`circles-${s.lang}.webp`, size.circles, '', 'loading="lazy" ')}
        <img class="peek" src="/ollie/ollie-think.webp" alt="" width="900" height="900" decoding="async" />
        ${device(`hero-phone-${s.lang}.webp`, size.week, at(s, 'hero.phone.alt'), 'fetchpriority="high" ')}
      </div>
    </section>`;
}

function inbox(s) {
  const d = at(s, 'day.inbox');
  const steps = d.steps
    .map((st, i) => `<li><span class="step-tag">${String(i + 1).padStart(2, '0')} · ${esc(st.tag)}</span>${esc(st.body)}</li>`)
    .join('\n            ');
  const emails = d.emails
    .map((e, i) => `<li${i === d.highlight ? ' class="is-flagged"' : ''}>${esc(e)}</li>`)
    .join('');
  return `
    <section class="section t-day" id="inbox" aria-labelledby="inbox-title">
      <div class="wrap split">
        <div class="split-copy">
          ${timeChip(d)}
          <h2 id="inbox-title">${payoff(d.h2Plain, d.h2Em)}</h2>
          <p class="lead">${esc(d.lead)}</p>
          <ol class="step-grid">
            ${steps}
          </ol>
        </div>
        <figure class="inbox-stage">
          <div class="inbox-card" aria-hidden="true">
            <p class="inbox-label">${esc(d.inboxLabel)}</p>
            <ul>${emails}</ul>
          </div>
          ${device(`phone-${s.lang}.webp`, art[s.lang].yes, at(s, 'how.phone.alt'), 'loading="lazy" ')}
          <figcaption class="caption">${esc(at(s, 'how.phone.caption'))}</figcaption>
        </figure>
      </div>
    </section>`;
}

/** The week, as four device renders. A row on a wide screen; on a phone the row
 *  scrolls sideways with arrows, which ship hidden until the script wires them. */
function midday(s) {
  const d = at(s, 'day.midday');
  const slides = at(s, 'week.cols')
    .map(
      (c, i) => `<li class="week-card">
            ${device(`week-${i + 1}-${s.lang}.webp`, art[s.lang][`weekcol${i}`], weekAlt(s, i), 'loading="lazy" ')}
            <p class="week-time">${esc(c.time)}</p>
            <h3>${esc(c.h3)}</h3>
          </li>`,
    )
    .join('\n          ');
  return `
    <section class="section t-noon" id="week" aria-labelledby="week-title">
      <div class="wrap center-head">
        ${timeChip(d)}
        <h2 id="week-title">${esc(at(s, 'week.h2'))}</h2>
        <p class="lead">${esc(at(s, 'week.lead'))}</p>
      </div>
      <div class="wrap">
        <div class="carousel" data-carousel>
          <button class="carousel-arrow carousel-prev" type="button" aria-label="${esc(at(s, 'week.prev'))}" hidden>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14.5 5 8 12l6.5 7" /></svg>
          </button>
          <ul class="carousel-track" tabindex="0" aria-label="${esc(at(s, 'week.trackLabel'))}">
          ${slides}
          </ul>
          <button class="carousel-arrow carousel-next" type="button" aria-label="${esc(at(s, 'week.next'))}" hidden>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9.5 5 16 12l-6.5 7" /></svg>
          </button>
        </div>
        <p class="caption center">${esc(at(s, 'exampleCaption'))}</p>
      </div>
    </section>`;
}

/** One ask, start to finish: the school's email, Axolotl's reading of it, the
 *  letter, the follow-up, the answer. The law is named only inside the letter,
 *  which is where a parent would actually meet it. */
function qualify(s) {
  const d = at(s, 'day.qualify');
  const body = (st) => {
    if (st.kind === 'email')
      return `<div class="tl-card tl-email"><span class="tl-meta">${esc(st.from)}</span><strong>${esc(st.subject)}</strong><span>${esc(st.before)}<mark>${esc(st.mark)}</mark>${esc(st.after)}</span></div>`;
    if (st.kind === 'letter')
      return `<div class="tl-card tl-letter"><span class="tl-meta">${esc(st.to)}</span><span class="tl-letter-text">${esc(st.before)}<mark>${esc(st.mark)}</mark>${esc(st.after)}</span><span class="tl-sent">${esc(st.sent)}</span></div>`;
    if (st.kind === 'reply')
      return `<div class="tl-card tl-reply"><span class="tl-meta">${esc(st.from)}</span><span>${esc(st.text)}</span></div><p class="tl-track"><span class="tl-bar" aria-hidden="true"><span></span></span>${esc(st.track)}</p>`;
    return `<p class="bubble in">${esc(st.in)}</p>${st.out ? `<p class="bubble out">${esc(st.out)}</p>` : ''}`;
  };
  const steps = d.steps
    .map(
      (st) => `<li class="tl-step${st.pending ? ' is-pending' : ''}${st.done ? ' is-done' : ''}">
              <p class="tl-when">${esc(st.when)}</p>
              <h3>${esc(st.title)}</h3>
              ${body(st)}
            </li>`,
    )
    .join('\n            ');
  const also = d.also.map((a) => `<li>${esc(a)}</li>`).join('');
  return `
    <section class="section t-afternoon" id="qualify" aria-labelledby="qualify-title">
      <div class="wrap">
        <div class="head-split">
          <div>
            ${timeChip(d)}
            <h2 id="qualify-title">${payoff(d.h2Plain, d.h2Em)}</h2>
          </div>
          <p class="lead">${esc(d.lead)}</p>
        </div>
        <div class="glass timeline">
          <div class="timeline-head">
            <h3>${esc(d.timelineTitle)}</h3>
            <p class="caption">${esc(at(s, 'exampleCaption'))}</p>
          </div>
          <ol class="tl">
            ${steps}
          </ol>
        </div>
        <div class="also">
          <p class="also-label">${esc(d.alsoLabel)}</p>
          <ul class="chips">${also}</ul>
        </div>
        <p class="line-note">${esc(d.note)}</p>
      </div>
    </section>`;
}

function schoolNet(s) {
  const d = at(s, 'day.school');
  const g = d.diagram;
  const list = (items) => items.map((i) => `<li>${esc(i)}</li>`).join('');
  // Six families around one school. Plain geometry, so it is drawn inline and
  // takes the page's colours instead of being a picture of them.
  const pts = [[270, 55], [456, 162], [456, 378], [270, 485], [84, 378], [84, 162]];
  const lines = pts.map(([x, y]) => `<line x1="270" y1="270" x2="${x}" y2="${y}" />`).join('');
  const dots = pts.slice(0, 5).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" />`).join('');
  return `
    <section class="section t-golden" id="school" aria-labelledby="school-title">
      <div class="wrap split">
        <div class="split-copy">
          ${timeChip(d)}
          <h2 id="school-title">${payoff(d.h2Plain, d.h2Em)}</h2>
          <p class="lead">${esc(d.lead)}</p>
          <div class="two-lists">
            <div><h3>${esc(d.sharedLabel)}</h3><ul>${list(d.shared)}</ul></div>
            <div><h3>${esc(d.privateLabel)}</h3><ul>${list(d.private)}</ul></div>
          </div>
          <a class="text-link" href="${s.lang === 'es' ? '/es/schools' : '/schools'}">${esc(d.link)}</a>
        </div>
        <svg class="net" viewBox="0 0 540 540" role="img" aria-label="${esc(g.alt)}">
          <circle class="net-ring" cx="270" cy="270" r="215" />
          <circle class="net-ring net-ring-inner" cx="270" cy="270" r="140" />
          <g class="net-lines">${lines}</g>
          <circle class="net-school" cx="270" cy="270" r="88" />
          <text class="net-school-text" x="270" y="262" text-anchor="middle">${esc(g.school[0])}</text>
          <text class="net-school-text" x="270" y="292" text-anchor="middle">${esc(g.school[1])}</text>
          <g class="net-dots">${dots}</g>
          <circle class="net-you" cx="84" cy="162" r="13" />
          <g class="net-label">
            <text x="288" y="50">${esc(g.family)}</text><text x="474" y="158">${esc(g.family)}</text><text x="474" y="383">${esc(g.family)}</text>
            <text x="288" y="500">${esc(g.family)}</text><text x="18" y="404">${esc(g.family)}</text>
            <text class="net-you-label" x="44" y="136">${esc(g.you)}</text>
          </g>
          <g class="net-note">
            <text x="284" y="126">${esc(g.notes[0])}</text><text x="256" y="432" text-anchor="end">${esc(g.notes[1])}</text><text x="284" y="432">${esc(g.notes[2])}</text>
          </g>
        </svg>
      </div>
    </section>`;
}

function dinner(s) {
  const d = at(s, 'day.dinner');
  const size = art[s.lang];
  return `
    <section class="section t-dusk" id="dinner" aria-labelledby="dinner-title">
      <div class="wrap center-head">
        ${timeChip(d)}
        <h2 id="dinner-title">${payoff(d.h2Plain, d.h2Em)}</h2>
        <p class="lead">${esc(d.lead)}</p>
      </div>
      <div class="dinner-stage">
        ${device(`week-4-${s.lang}.webp`, size.weekcol3, weekAlt(s, 3), 'loading="lazy" ')}
        ${device(`circles-${s.lang}.webp`, size.circles, at(s, 'circles.chat.alt'), 'loading="lazy" ')}
      </div>
      <div class="wrap">
        <p class="soon-line"><span class="soon-tag">${esc(d.soon)}</span>${esc(d.circles)}</p>
      </div>
    </section>`;
}

/** Hidden until at least two permissioned quotes exist. Never a placeholder. */
function voices(s) {
  const quotes = at(s, 'voices.quotes');
  if (quotes.length < 2) return '';
  const cards = quotes
    .map(
      (q) => `<figure class="glass quote">
          <blockquote><p>${esc(q.text)}</p></blockquote>
          <figcaption>${esc(q.name)}, ${esc(q.grade)}, ${esc(q.city)}</figcaption>
        </figure>`,
    )
    .join('\n        ');
  return `
      <div class="wrap" id="voices">
        <h2>${esc(at(s, 'voices.h2'))}</h2>
        <div class="quote-grid">
        ${cards}
        </div>
      </div>`;
}

/** Night: the day's summary, the promises, and the way in. The footer lives in
 *  here too, so the page ends in the dark instead of on a separate band. */
function night(s) {
  const d = at(s, 'day.night');
  const tick = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12l5 5 9-10" /></svg>`;
  const summary = d.summary
    .map(
      (item) => `<li class="${item.done ? 'is-done' : 'is-waiting'}">
              <span class="sum-mark">${item.done ? tick : ''}</span>
              <span class="sum-text"><strong>${esc(item.title)}</strong><span>${esc(item.detail)}</span></span>
              <span class="sr-only">${esc(item.done ? d.doneWord : d.waitingWord)}</span>
            </li>`,
    )
    .join('\n            ');
  const promises = d.promises
    .map((p) => `<article class="glass promise"><h3>${esc(p.title)}</h3><p>${esc(p.body)}</p></article>`)
    .join('\n          ');
  const links = d.links.map((l) => `<a class="text-link" href="${l.href}">${esc(l.label)}</a>`).join('\n          ');
  return `
    <section class="section t-night" id="night" aria-labelledby="night-title">
      <div class="stars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <div class="wrap split">
        <div class="split-copy">
          ${timeChip(d)}
          <h2 id="night-title">${payoff(d.h2Plain, d.h2Em)}</h2>
          <p class="lead">${esc(d.lead)}</p>
        </div>
        <div>
          <p class="sum-label">${esc(d.summaryLabel)}</p>
          <ul class="summary">
            ${summary}
          </ul>
          <p class="caption">${esc(at(s, 'exampleCaption'))}</p>
        </div>
      </div>
      <div class="wrap promises">
          ${promises}
      </div>
      <div class="wrap promise-links">
          ${links}
      </div>
${voices(s)}
      <div class="wrap join" id="join" aria-labelledby="join-title">
        <img class="sleeper" src="/ollie/ollie-sleep.webp" alt="" width="900" height="900" loading="lazy" decoding="async" />
        <h2 id="join-title">${payoff(d.closePlain, d.closeEm)}</h2>
        <p class="lead">${esc(at(s, 'join.lead'))}</p>
${joinForm(s, 'join')}
        <p class="join-alt"><a class="text-link" href="#contact">${esc(at(s, 'join.questionLink'))}</a></p>
      </div>
    </section>`;
}

function schoolsBand(s) {
  return `
    <section class="section t-night-deep section-band" aria-labelledby="schools-band-title">
      <div class="wrap band">
        <h2 id="schools-band-title">${esc(at(s, 'schoolsBand.h2'))}</h2>
        <p class="lead">${esc(at(s, 'schoolsBand.body'))}</p>
        <a class="text-link" href="${s.lang === 'es' ? '/es/schools' : '/schools'}">${esc(at(s, 'schoolsBand.link'))}</a>
      </div>
    </section>`;
}

function contact(s) {
  const blocks = at(s, 'websitePrivacy.blocks')
    .map((b) => `<h3>${esc(b.h3)}</h3>\n            <p>${esc(b.body)}</p>`)
    .join('\n            ');
  return `
    <section class="section t-night-deep" id="contact" aria-labelledby="contact-title">
      <div class="wrap contact-grid">
        <div>
          <h2 id="contact-title">${esc(at(s, 'contact.h2'))}</h2>
          <p class="lead">${esc(at(s, 'contact.lead'))}</p>
          <form id="inquiry-form" novalidate data-error="${esc(at(s, 'contact.error'))}">
            <div class="field">
              <label for="inquiry-email">${esc(at(s, 'contact.emailLabel'))}</label>
              <input id="inquiry-email" name="email" type="email" autocomplete="email" maxlength="254" required aria-describedby="inquiry-error" />
            </div>
            <div class="field">
              <label for="inquiry-message">${esc(at(s, 'contact.messageLabel'))} <span class="hint">${esc(at(s, 'contact.messageHint'))}</span></label>
              <textarea id="inquiry-message" name="message" maxlength="2000" rows="4" aria-describedby="inquiry-error"></textarea>
            </div>
            <button class="button primary" type="submit">${esc(at(s, 'contact.submit'))}</button>
            <p class="form-note">${esc(at(s, 'contact.note'))} <a href="#website-privacy" data-privacy>${esc(at(s, 'contact.privacyLink'))}</a></p>
            <p class="form-error" id="inquiry-error" role="alert" hidden>${esc(at(s, 'contact.error'))}</p>
          </form>
          <div class="form-success" id="inquiry-sent" role="status" tabindex="-1" hidden>
            <p>${esc(at(s, 'contact.success'))}</p>
          </div>
        </div>
        <details id="website-privacy" class="inline-panel">
          <summary>${esc(at(s, 'websitePrivacy.summary'))}</summary>
          <div class="panel-body">
            <h3 class="panel-title">${esc(at(s, 'websitePrivacy.h2'))}</h3>
            ${blocks}
            <a class="text-link" href="/privacy">${esc(at(s, 'websitePrivacy.link'))}</a>
          </div>
        </details>
      </div>
    </section>`;
}

const homeSections = (s) => [hero(s), inbox(s), midday(s), qualify(s), schoolNet(s), dinner(s), night(s), schoolsBand(s), contact(s)].join('');

// ── /schools ─────────────────────────────────────────────────────────────────

function schoolsPageSections(s) {
  const heroBlock = `
    <section class="hero hero-schools" aria-labelledby="schools-hero-title">
      <div class="wrap">
        <h1 id="schools-hero-title">${esc(at(s, 'schools.hero.h1'))}</h1>
        <p class="lead">${esc(at(s, 'schools.hero.sub'))}</p>
        <div class="hero-actions">
          <a class="button primary" href="#school-contact">${esc(at(s, 'schools.hero.primary'))}</a>
        </div>
      </div>
    </section>`;

  const head = at(s, 'schools.changes.head');
  const rows = at(s, 'schools.changes.rows')
    .map(
      (r) => `<tr>
            <td data-label="${esc(head[0])}">${esc(r.pain)}</td>
            <td data-label="${esc(head[1])}">${esc(r.does)}</td>
            <td data-label="${esc(head[2])}">${esc(r.who)}</td>
          </tr>`,
    )
    .join('\n          ');
  const changes = `
    <section class="section" aria-labelledby="changes-title">
      <div class="wrap">
        <h2 id="changes-title">${esc(at(s, 'schools.changes.h2'))}</h2>
        <p class="lead">${esc(at(s, 'schools.changes.lead'))}</p>
        <table class="year-table">
          <caption class="sr-only">${esc(at(s, 'schools.changes.h2'))}</caption>
          <thead>
            <tr><th scope="col">${esc(head[0])}</th><th scope="col">${esc(head[1])}</th><th scope="col">${esc(head[2])}</th></tr>
          </thead>
          <tbody>
          ${rows}
          </tbody>
        </table>
      </div>
    </section>`;

  const how = `
    <section class="section" aria-labelledby="schools-how-title">
      <div class="wrap">
        <h2 id="schools-how-title">${esc(at(s, 'schools.how.h2'))}</h2>
        <p class="lead">${esc(at(s, 'schools.how.lead'))}</p>
        <ul class="plain-list wide">
          ${at(s, 'schools.how.items').map((i) => `<li>${esc(i)}</li>`).join('\n          ')}
        </ul>
        <div class="tension">
          <h3>${esc(at(s, 'schools.how.tensionTitle'))}</h3>
          <p>${esc(at(s, 'schools.how.tensionBody'))}</p>
          <p>${esc(at(s, 'schools.how.integration'))}</p>
        </div>
      </div>
    </section>`;

  const never = `
    <section class="section" aria-labelledby="never-title">
      <div class="wrap">
        <h2 id="never-title">${esc(at(s, 'schools.never.h2'))}</h2>
        <div class="never-grid">
          ${at(s, 'schools.never.items')
            .map((i) => `<article><h3>${esc(i.title)}</h3><p>${esc(i.body)}</p></article>`)
            .join('\n          ')}
        </div>
      </div>
    </section>`;

  const equity = `
    <section class="section" aria-labelledby="equity-title">
      <div class="wrap">
        <h2 id="equity-title">${esc(at(s, 'schools.equity.h2'))}</h2>
        <p class="lead">${esc(at(s, 'schools.equity.lead'))}</p>
        <ul class="plain-list wide">
          ${at(s, 'schools.equity.items').map((i) => `<li>${esc(i)}</li>`).join('\n          ')}
        </ul>
      </div>
    </section>`;

  const pilot = `
    <section class="section section-sheet" aria-labelledby="pilot-title">
      <div class="wrap">
        <h2 id="pilot-title">${esc(at(s, 'schools.pilot.h2'))}</h2>
        <p class="lead">${esc(at(s, 'schools.pilot.lead'))}</p>
        <h3>${esc(at(s, 'schools.pilot.measuresLabel'))}</h3>
        <ul class="plain-list wide">
          ${at(s, 'schools.pilot.measures').map((i) => `<li>${esc(i)}</li>`).join('\n          ')}
        </ul>
        <p>${esc(at(s, 'schools.pilot.consent'))}</p>
        <p><span class="highlight">${esc(at(s, 'schools.pilot.guardrail'))}</span></p>
      </div>
    </section>`;

  const form = `
    <section class="section" id="school-contact" aria-labelledby="school-contact-title">
      <div class="wrap contact-grid">
        <div>
          <h2 id="school-contact-title">${esc(at(s, 'schools.form.h2'))}</h2>
          <p class="lead">${esc(at(s, 'schools.form.lead'))}</p>
          <form id="school-form" novalidate data-error="${esc(at(s, 'schools.form.generic'))}">
            <div class="field">
              <label for="school-name">${esc(at(s, 'schools.form.nameLabel'))}</label>
              <input id="school-name" name="name" type="text" autocomplete="name" maxlength="120" required aria-describedby="school-error" />
            </div>
            <div class="field">
              <label for="school-role">${esc(at(s, 'schools.form.roleLabel'))}</label>
              <input id="school-role" name="role" type="text" autocomplete="organization-title" maxlength="120" required aria-describedby="school-error" />
            </div>
            <div class="field">
              <label for="school-district">${esc(at(s, 'schools.form.schoolLabel'))}</label>
              <input id="school-district" name="school" type="text" autocomplete="organization" maxlength="160" required aria-describedby="school-error" />
            </div>
            <div class="field">
              <label for="school-email">${esc(at(s, 'schools.form.emailLabel'))}</label>
              <input id="school-email" name="email" type="email" autocomplete="email" maxlength="254" required aria-describedby="school-error" />
            </div>
            <div class="field">
              <label for="school-message">${esc(at(s, 'schools.form.messageLabel'))} <span class="hint">${esc(at(s, 'schools.form.messageHint'))}</span></label>
              <textarea id="school-message" name="message" maxlength="2000" rows="4" aria-describedby="school-error"></textarea>
            </div>
            <button class="button primary" type="submit">${esc(at(s, 'schools.form.submit'))}</button>
            <p class="form-note">${esc(at(s, 'schools.form.note'))}</p>
            <p class="form-error" id="school-error" role="alert" hidden>${esc(at(s, 'schools.form.error'))}</p>
          </form>
          <div class="form-success" id="school-sent" role="status" tabindex="-1" hidden>
            <p>${esc(at(s, 'schools.form.success'))}</p>
          </div>
        </div>
      </div>
    </section>`;

  return [heroBlock, changes, how, never, equity, pilot, form].join('');
}

// ── document shell ───────────────────────────────────────────────────────────

function document(s, { title, description, canonical, alts, body, prefix, langHref, cta, shareAlt, share }) {
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
    <link rel="stylesheet" href="/site.css?v=14" />
    <script src="/site.js?v=14" defer></script>
  </head>
  <body>
    <a class="skip-link" href="#main">${esc(at(s, 'a11y.skip'))}</a>
${header(s, { prefix, cta, langHref })}
    <main id="main">
${body}
    </main>
${footer(s, { prefix, langHref })}
${cta === '#join' ? `    <a class="sticky-join" id="sticky-join" href="#join" hidden>${esc(at(s, 'nav.join'))}</a>
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
        cta: '#join',
        shareAlt: at(s, 'meta.shareAlt'),
        share,
      }),
    });
    pages.push({
      file: dir ? `${dir}/schools.html` : 'schools.html',
      html: document(s, {
        title: at(s, 'schools.meta.title'),
        description: at(s, 'schools.meta.description'),
        canonical: dir ? '/es/schools' : '/schools',
        alts: [['en', '/schools'], ['es', '/es/schools']],
        body: schoolsPageSections(s),
        prefix: '/',
        langHref: dir ? '/schools' : '/es/schools',
        cta: '#school-contact',
        shareAlt: at(s, 'schools.meta.shareAlt'),
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

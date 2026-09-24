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

/** A finished agent step: a circled tick, in the same 24px-grid, 1.75px-stroke,
 *  round-capped language as the icons below and as the device render. */
const stepTick = `<svg class="step-tick" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" /><path d="M8.2 12.4l2.6 2.6 5-5.4" /></svg>`;



const status = (s, key, extra = '') =>
  `<span class="status status-${key}">${esc(at(s, `statuses.${key}`))}${extra}</span>`;

/** The header. `prefix` is '' on the home page and '/' on /schools, so the
 *  section links keep working from a page that does not have those sections. */
function header(s, { prefix, cta, langHref }) {
  const nav = [
    [at(s, 'nav.how'), `${prefix}#how`],
    [at(s, 'nav.rights'), `${prefix}#rights`],
    [at(s, 'nav.circles'), `${prefix}#circles`],
    [at(s, 'nav.limits'), `${prefix}#limits`],
  ]
    .map(([label, href]) => `<li><a href="${href}">${esc(label)}</a></li>`)
    .join('');
  return `
  <header class="site-header">
    <div class="wrap header-bar">
      <a class="brand" href="${prefix || '/'}" aria-label="${esc(at(s, 'a11y.home'))}">
        <img src="/animation/axolotl-mascot.png" alt="" width="34" height="34" />
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

function footer(s, { prefix, langHref }) {
  const links = at(s, 'footer.links')
    .map((l) => `<li><a href="${l.href}">${esc(l.label)}</a></li>`)
    .join('');
  return `
  <footer class="site-footer">
    <div class="wrap footer-grid">
      <div>
        <a class="brand brand-footer" href="${prefix || '/'}">
          <img src="/animation/axolotl-mascot.png" alt="" width="34" height="34" />
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

/**
 * The hero: the same five rows the paper folder held, as the card the parent
 * actually gets, rendered inside the real device by scripts/build-phone.mjs.
 *
 * The render is shown clean: a real screenshot has no pen ring or rubber stamp
 * floating over it. The card's own status chips already carry "waiting for your
 * yes" and "confirmed", so nothing is lost.
 */
function heroPhone(s, art) {
  const size = art[s.lang].week;

  return `
        <figure class="hero-visual">
          <div class="hero-phone-wrap">
            <img
              class="hero-phone"
              src="${shot(`hero-phone-${s.lang}.webp`)}"
              width="${size.width}"
              height="${size.height}"
              alt="${esc(at(s, 'hero.phone.alt'))}"
              fetchpriority="high"
              decoding="async"
            />
          </div>
          <img class="mascot" src="/animation/axolotl-mascot.png" alt="${esc(at(s, 'a11y.mascot'))}" width="150" height="150" />
        </figure>`;
}

function hero(s, art) {
  return `
    <section class="hero" aria-labelledby="hero-title">
      <div class="wrap hero-grid">
        <div class="hero-copy">
          <h1 id="hero-title">${esc(at(s, 'hero.h1'))}</h1>
          <p class="lead">${esc(at(s, 'hero.sub'))}</p>
          <div class="hero-actions">
            <a class="button primary" href="#join">${esc(at(s, 'hero.primary'))}</a>
            <a class="text-link" href="#how">${esc(at(s, 'hero.secondary'))}</a>
          </div>
          <p class="trust-line">${esc(at(s, 'hero.trust'))}</p>
        </div>
${heroPhone(s, art)}
      </div>
    </section>`;
}

function layers(s) {
  const cols = at(s, 'layers.cols')
    .map(
      (c) => `<div class="layer">
          <p class="layer-label">${esc(c.label)}</p>
          <h3>${esc(c.h3)}</h3>
          <p>${esc(c.body)}</p>
        </div>`,
    )
    .join('\n        ');
  return `
    <section class="section" id="layers" aria-labelledby="layers-title">
      <div class="wrap">
        <h2 id="layers-title">${esc(at(s, 'layers.h2'))}</h2>
        <p class="lead">${esc(at(s, 'layers.lead'))}</p>
        <div class="layer-grid">
        ${cols}
        </div>
        <p class="line-note">${esc(at(s, 'layers.line'))}</p>
      </div>
    </section>`;
}

/**
 * The week, as four device renders — one phone per card, the same way the hero
 * is a device render. Nothing here is drawn by the page: each phone is a real
 * iOS screen built by scripts/build-phone.mjs, so the cards carry the system
 * font and the system metrics on every device, not just on Apple's.
 *
 * The alt text carries what the screen shows, including the status, because the
 * status word is the one thing a picture cannot say out loud on its own.
 */
function week(s, art) {
  const slides = at(s, 'week.cols')
    .map((c, i) => {
      const size = art[s.lang][`weekcol${i}`];
      // The screen is a picture, so the alt has to carry the conversation it
      // shows, speaker by speaker, and the status at the end.
      const said = c.turns
        .filter((t) => t.in || t.out)
        .map((t) => `${t.out ? at(s, 'week.you') : 'Axolotl'}: ${t.out ?? t.in}`)
        .join(' ');
      const alt = `${at(s, 'week.shotAlt')} ${c.h3}. ${said} ${s.statuses[c.status]}`;
      return `<li class="week-card">
            <h3>${esc(c.h3)}</h3>
            <img
              class="week-shot"
              src="${shot(`week-${i + 1}-${s.lang}.webp`)}"
              width="${size.width}"
              height="${size.height}"
              alt="${esc(alt)}"
              loading="lazy"
              decoding="async"
            />
          </li>`;
    })
    .join('\n          ');
  // One screen at a time, stepped with an arrow, the way the reference does it.
  // The arrows ship hidden and the script reveals them, so a visitor without
  // scripting gets a row they can still swipe through instead of dead buttons.
  return `
    <section class="section" id="week" aria-labelledby="week-title">
      <div class="wrap">
        <h2 id="week-title">${esc(at(s, 'week.h2'))}</h2>
        <p class="lead">${esc(at(s, 'week.lead'))}</p>
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
        <p class="caption">${esc(at(s, 'exampleCaption'))}</p>
      </div>
    </section>`;
}

function year(s) {
  const head = at(s, 'year.head');
  const rows = at(s, 'year.rows')
    .map(
      (r) => `<tr>
            <td data-label="${esc(head[0])}"><q>${esc(r.say.replace(/^"|"$/g, ''))}</q></td>
            <td data-label="${esc(head[1])}">${esc(r.rule)}</td>
            <td data-label="${esc(head[2])}">${esc(r.does)}</td>
          </tr>`,
    )
    .join('\n          ');
  return `
    <section class="section" id="rights" aria-labelledby="rights-title">
      <div class="wrap">
        <h2 id="rights-title">${esc(at(s, 'year.h2'))}</h2>
        <p class="lead">${esc(at(s, 'year.lead'))}</p>
        <table class="year-table">
          <caption class="sr-only">${esc(at(s, 'year.h2'))}</caption>
          <thead>
            <tr><th scope="col">${esc(head[0])}</th><th scope="col">${esc(head[1])}</th><th scope="col">${esc(head[2])}</th></tr>
          </thead>
          <tbody>
          ${rows}
          </tbody>
        </table>
        <p class="line-note">${esc(at(s, 'year.line'))}</p>
      </div>
    </section>`;
}

/** The phone: a real device render, built by scripts/build-phone.mjs.
 *  Shown clean — the thread already ends with the school's confirmation, so no
 *  stamp or handwritten note is drawn over the device. */
function phone(s, art) {
  const size = art[s.lang].yes;
  return `
        <figure class="phone-figure">
          <div class="phone-tilt">
            <img
              class="phone-shot"
              src="${shot(`phone-${s.lang}.webp`)}"
              width="${size.width}"
              height="${size.height}"
              alt="${esc(at(s, 'how.phone.alt'))}"
              loading="lazy"
              decoding="async"
            />
          </div>
          <figcaption class="caption">${esc(at(s, 'how.phone.caption'))}</figcaption>
        </figure>`;
}

function how(s, art) {
  const steps = at(s, 'how.steps')
    .map(
      (step, i) => `<li>
            <span class="step-number" aria-hidden="true">${i + 1}</span>
            <div><h3>${esc(step.title)}</h3><p>${esc(step.body)}</p></div>
          </li>`,
    )
    .join('\n          ');
  const channel = at(s, 'how.channel.items')
    .map((item) =>
      item.kind === 'photo'
        ? `<li class="ios-bubble out ios-bubble-photo"><span class="photo-thumb" aria-hidden="true"></span>${esc(item.text)}</li>`
        : `<li class="ios-bubble out">${esc(item.text)}</li>`,
    )
    .join('\n          ');
  return `
    <section class="section" id="how" aria-labelledby="how-title">
      <div class="wrap how-grid">
        <div>
          <h2 id="how-title">${esc(at(s, 'how.h2'))}</h2>
          <p class="lead">${esc(at(s, 'how.lead'))}</p>
          <ol class="how-steps" aria-label="${esc(at(s, 'how.stepsLabel'))}">
          ${steps}
          </ol>
        </div>
${phone(s, art)}
      </div>
      <div class="wrap channel">
        <p class="channel-line">${esc(at(s, 'how.channel.line'))}</p>
        <ul class="channel-bubbles" aria-label="${esc(at(s, 'how.channel.label'))}">
          ${channel}
        </ul>
      </div>
    </section>`;
}

/**
 * The circles section is one device render too: the group chat the families
 * actually coordinate in. An earlier pass drew this as a ring of families
 * around a plan, which read as a diagram of a feature rather than as the
 * product — and the brief's own rule is to show the product.
 */
function circlesShot(s, art) {
  const size = art[s.lang].circles;
  return `
          <figure class="circles-shot">
            <img
              class="phone-shot"
              src="${shot(`circles-${s.lang}.webp`)}"
              width="${size.width}"
              height="${size.height}"
              alt="${esc(at(s, 'circles.chat.alt'))}"
              loading="lazy"
              decoding="async"
            />
            <figcaption class="caption">${esc(at(s, 'exampleCaption'))}</figcaption>
          </figure>`;
}

function circles(s, art) {
  const list = at(s, 'circles.list').map((item) => `<li>${esc(item)}</li>`).join('\n          ');
  const options = at(s, 'circles.form.familiesOptions')
    .map((o) => `<option value="${esc(o)}">${esc(o)}</option>`)
    .join('');
  return `
    <section class="section" id="circles" aria-labelledby="circles-title">
      <div class="wrap circles-grid">
        <div>
          <div class="h2-row">
            <h2 id="circles-title">${esc(at(s, 'circles.h2'))}</h2>
            ${status(s, 'soon')}
          </div>
          <p class="lead">${esc(at(s, 'circles.lead'))}</p>
          <ul class="plain-list" aria-label="${esc(at(s, 'circles.listLabel'))}">
          ${list}
          </ul>
          <div class="form-block">
          <h3>${esc(at(s, 'circles.form.legend'))}</h3>
          <form id="circle-form" novalidate data-error="${esc(at(s, 'circles.form.errors.generic'))}" data-error-phone="${esc(at(s, 'circles.form.errors.phone'))}" data-error-families="${esc(at(s, 'circles.form.errors.families'))}">
            <div class="field">
              <label for="circle-phone">${esc(at(s, 'circles.form.phoneLabel'))}</label>
              <input id="circle-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="30" required aria-describedby="circle-error" />
            </div>
            <div class="field">
              <label for="circle-families">${esc(at(s, 'circles.form.familiesLabel'))}</label>
              <select id="circle-families" name="families" required aria-describedby="circle-error">
                <option value="">&nbsp;</option>
                ${options}
              </select>
            </div>
            <div class="field">
              <label for="circle-school">${esc(at(s, 'circles.form.schoolLabel'))} <span class="hint">${esc(at(s, 'circles.form.schoolHint'))}</span></label>
              <input id="circle-school" name="school" type="text" maxlength="120" autocomplete="organization" />
            </div>
            <button class="button primary" type="submit">${esc(at(s, 'circles.form.submit'))}</button>
            <p class="form-note">${esc(at(s, 'circles.form.note'))}</p>
            <p class="form-error" id="circle-error" role="alert" hidden></p>
          </form>
          <div class="form-success" id="circle-sent" role="status" tabindex="-1" hidden>
            <p>${esc(at(s, 'circles.form.success'))}</p>
          </div>
          </div>
        </div>
        <div>
${circlesShot(s, art)}
        </div>
      </div>
    </section>`;
}

function limits(s) {
  const items = at(s, 'limits.items')
    .map(
      (item) => `<article>
          <h3>${esc(item.title)}</h3>
          <p>${esc(item.body)}</p>
        </article>`,
    )
    .join('\n        ');
  const links = at(s, 'limits.privacyLinks')
    .map((l) => `<a class="text-link" href="${l.href}">${esc(l.label)}</a>`)
    .join('\n          ');
  return `
    <section class="section" id="limits" aria-labelledby="limits-title">
      <div class="wrap">
        <h2 id="limits-title">${esc(at(s, 'limits.h2'))}</h2>
        <p class="lead">${esc(at(s, 'limits.lead'))}</p>
        <div class="limits-grid">
        ${items}
        </div>
        <div class="privacy-note">
          <p>${esc(at(s, 'limits.privacy'))}</p>
          <div class="slip-links">
          ${links}
          </div>
        </div>
      </div>
    </section>`;
}

/** Hidden until at least two permissioned quotes exist. Never a placeholder. */
function voices(s) {
  const quotes = at(s, 'voices.quotes');
  if (quotes.length < 2) return '';
  const cards = quotes
    .map(
      (q) => `<figure class="index-card ${q.tone === 'pink' ? 'card-pink' : 'card-canary'}">
          <blockquote><p>${esc(q.text)}</p></blockquote>
          <figcaption>${esc(q.name)}, ${esc(q.grade)}, ${esc(q.city)}</figcaption>
        </figure>`,
    )
    .join('\n        ');
  return `
    <section class="section" id="voices" aria-labelledby="voices-title">
      <div class="wrap">
        <h2 id="voices-title">${esc(at(s, 'voices.h2'))}</h2>
        <div class="card-grid">
        ${cards}
        </div>
      </div>
    </section>`;
}

function join(s) {
  return `
    <section class="section section-sheet" id="join" aria-labelledby="join-title">
      <div class="wrap">
        <div class="join-grid">
        <div>
          <h2 id="join-title">${esc(at(s, 'join.h2'))}</h2>
          <p class="lead">${esc(at(s, 'join.lead'))}</p>
          <p class="join-alt">
            <a class="text-link" href="#circles">${esc(at(s, 'join.circleLink'))}</a>
            <a class="text-link" href="#contact">${esc(at(s, 'join.questionLink'))}</a>
          </p>
        </div>
        <div>
          <form id="join-form" novalidate data-error="${esc(at(s, 'join.generic'))}" data-error-phone="${esc(at(s, 'join.error'))}">
            <div class="field">
              <label for="join-phone">${esc(at(s, 'join.phoneLabel'))}</label>
              <input id="join-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="30" required aria-describedby="join-error" />
            </div>
            <button class="button primary" type="submit">${esc(at(s, 'join.submit'))}</button>
            <p class="form-note"><span class="highlight">${esc(at(s, 'join.note'))}</span></p>
            <p class="form-error" id="join-error" role="alert" hidden></p>
          </form>
          <div class="form-success" id="join-sent" role="status" tabindex="-1" hidden>
            <p id="join-sent-text" data-template="${esc(at(s, 'join.success'))}"></p>
          </div>
        </div>
        </div>
      </div>
    </section>`;
}

function schoolsBand(s) {
  return `
    <section class="section section-band" aria-labelledby="schools-band-title">
      <div class="wrap">
        <div class="band">
          <h2 id="schools-band-title">${esc(at(s, 'schoolsBand.h2'))}</h2>
          <p class="lead">${esc(at(s, 'schoolsBand.body'))}</p>
          <a class="text-link" href="/schools">${esc(at(s, 'schoolsBand.link'))}</a>
        </div>
      </div>
    </section>`;
}

function contact(s) {
  const blocks = at(s, 'websitePrivacy.blocks')
    .map((b) => `<h3>${esc(b.h3)}</h3>\n            <p>${esc(b.body)}</p>`)
    .join('\n            ');
  return `
    <section class="section" id="contact" aria-labelledby="contact-title">
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

const homeSections = (s, art) => [hero(s, art), layers(s), week(s, art), year(s), how(s, art), circles(s, art), limits(s), voices(s), join(s), schoolsBand(s), contact(s)].join('');

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
    <meta name="theme-color" content="#FFE8E6" />
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
      href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600&family=Zilla+Slab:wght@500;600;700&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="/site.css?v=13" />
    <script src="/site.js?v=13" defer></script>
  </head>
  <body>
    <a class="skip-link" href="#main">${esc(at(s, 'a11y.skip'))}</a>
${header(s, { prefix, cta, langHref })}
    <main id="main">
${body}
    </main>
${footer(s, { prefix, langHref })}
    <a class="sticky-join" id="sticky-join" href="#join" hidden>${esc(at(s, 'nav.join'))}</a>
  </body>
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
        body: homeSections(s, art),
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

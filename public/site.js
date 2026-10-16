/* Axolotl website behaviour.
   ============================================================================
   Kept deliberately small: the site is static and every word of it is in the
   HTML before this file runs, so this only adds the things a page cannot do
   without scripting — the mobile menu, the sticky join bar, the privacy panel
   link, the week carousel on small screens, and the forms.

   The load animation is not here: it is CSS, so it plays even if this file
   fails to load. */

(() => {
  const header = document.querySelector(".site-header");
  const navToggle = header && header.querySelector(".nav-toggle");
  if (navToggle) {
    navToggle.addEventListener("click", () => {
      const open = header.dataset.navOpen !== "true";
      header.dataset.navOpen = String(open);
      navToggle.setAttribute("aria-expanded", String(open));
    });
  }

  // The website-privacy panel is a <details>; the form note links to it, so open
  // it before scrolling rather than landing on a closed summary.
  document.querySelectorAll("[data-privacy]").forEach((link) => {
    link.addEventListener("click", (event) => {
      const panel = document.getElementById(link.hash.slice(1));
      if (!panel) return;
      event.preventDefault();
      panel.open = true;
      if (location.hash !== link.hash) history.pushState(null, "", link.hash);
      panel.scrollIntoView({ block: "start" });
      panel.querySelector("summary").focus({ preventScroll: true });
    });
  });

  // The week carousel: one screen at a time, stepped with an arrow. The track is
  // a plain scroll container, so it already works by swiping; this only adds the
  // arrows, which ship hidden precisely because they need this code to do
  // anything.
  document.querySelectorAll("[data-carousel]").forEach((carousel) => {
    const track = carousel.querySelector(".carousel-track");
    const prev = carousel.querySelector(".carousel-prev");
    const next = carousel.querySelector(".carousel-next");
    const slides = track ? [...track.children] : [];
    if (!track || !prev || !next || slides.length < 2) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // The card the visitor is looking at is the one nearest the MIDDLE of the
    // track, because the cards snap to the centre. Measuring a card's left edge
    // against scrollLeft is the left-aligned model, and once the neighbours come
    // into view it lights up the wrong card and dims the one in the middle.
    const gapToMiddle = (slide) => {
      const box = slide.getBoundingClientRect();
      const trackBox = track.getBoundingClientRect();
      return box.left + box.width / 2 - (trackBox.left + trackBox.width / 2);
    };
    const at = () => {
      let best = 0;
      let bestGap = Infinity;
      slides.forEach((slide, i) => {
        const gap = Math.abs(gapToMiddle(slide));
        if (gap < bestGap) {
          bestGap = gap;
          best = i;
        }
      });
      return best;
    };
    const go = (i) => {
      const index = Math.max(0, Math.min(slides.length - 1, i));
      track.scrollTo({ left: track.scrollLeft + gapToMiddle(slides[index]), behavior: reduce ? "auto" : "smooth" });
    };
    const sync = () => {
      const index = at();
      prev.disabled = index === 0;
      next.disabled = index === slides.length - 1;
      // The centred screen is the live one; its neighbours sit back. Without
      // this a wide screen would show four phones at equal weight.
      slides.forEach((slide, i) => slide.classList.toggle("is-active", i === index));
    };

    prev.hidden = false;
    next.hidden = false;
    prev.addEventListener("click", () => go(at() - 1));
    next.addEventListener("click", () => go(at() + 1));
    track.addEventListener("scroll", () => window.requestAnimationFrame(sync), { passive: true });
    sync();
  });

  // "Join the pilot" follows the visitor down the page once the hero is gone, and
  // steps aside again while the join form itself is on screen — covering the very
  // field it points at would be worse than not showing the bar.
  const sticky = document.getElementById("sticky-join");
  const hero = document.querySelector(".hero");
  const joinSection = document.getElementById("join");
  if (sticky && hero && "IntersectionObserver" in window) {
    const state = { hero: true, join: false };
    const sync = () => {
      sticky.hidden = state.hero || state.join;
    };
    new IntersectionObserver(
      ([entry]) => {
        state.hero = entry.isIntersecting;
        sync();
      },
      { rootMargin: "-40px 0px 0px 0px" },
    ).observe(hero);
    if (joinSection) {
      new IntersectionObserver(([entry]) => {
        state.join = entry.isIntersecting;
        sync();
      }).observe(joinSection);
    }
  }

  const digits = (value) => String(value || "").replace(/\D/g, "");
  const isUsPhone = (value) => {
    const d = digits(value);
    return d.length === 10 || (d.length === 11 && d.startsWith("1"));
  };

  async function post(url, body) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let result = {};
    try {
      result = await response.json();
    } catch {
      /* a non-JSON error page is still a failure */
    }
    if (!response.ok || result.ok !== true) throw new Error("request failed");
    return result;
  }

  /**
   * Wire a form: validate, submit, then swap the form for its success panel.
   * `validate` returns an error string, or null when the values are good.
   */
  function wireForm({ form, error, sent, validate, payload, onSuccess }) {
    if (!form) return;
    const button = form.querySelector("button[type=submit]");
    const label = button.textContent;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (button.disabled) return;
      error.hidden = true;
      const problem = validate();
      if (problem) {
        error.textContent = problem.message;
        error.hidden = false;
        problem.field.focus();
        return;
      }
      button.disabled = true;
      button.textContent = label.replace(/[^ ]+$/, "…");
      try {
        await post("/api/waitlist", payload());
        form.hidden = true;
        if (onSuccess) onSuccess();
        sent.hidden = false;
        sent.focus();
      } catch {
        error.textContent = form.dataset.error;
        error.hidden = false;
      } finally {
        button.disabled = false;
        button.textContent = label;
      }
    });
  }

  const field = (id) => document.getElementById(id);

  // ── Join the pilot (family) ───────────────────────────────────────────────
  // Two copies of the same signup: one at 7:15 AM in the hero, one at night at
  // the end of the day. Each keeps its own ids so their messages never mix.
  ["hero-join", "join"].forEach((id) => {
    const form = field(`${id}-form`);
    const phone = field(`${id}-phone`);
    wireForm({
      form,
      error: field(`${id}-error`),
      sent: field(`${id}-sent`),
      validate: () => (isUsPhone(phone.value) ? null : { message: form.dataset.errorPhone, field: phone }),
      payload: () => ({ kind: "family", phone: digits(phone.value) }),
      onSuccess: () => {
        const text = field(`${id}-sent-text`);
        text.textContent = text.dataset.template.replace("{phone}", phone.value.trim());
      },
    });
  });

  // ── Start a circle ────────────────────────────────────────────────────────
  wireForm({
    form: field("circle-form"),
    error: field("circle-error"),
    sent: field("circle-sent"),
    validate: () => {
      if (!isUsPhone(field("circle-phone").value))
        return { message: field("circle-form").dataset.errorPhone, field: field("circle-phone") };
      if (!field("circle-families").value)
        return { message: field("circle-form").dataset.errorFamilies, field: field("circle-families") };
      return null;
    },
    payload: () => ({
      kind: "circle",
      phone: digits(field("circle-phone").value),
      families: field("circle-families").value,
      school: field("circle-school").value.trim(),
    }),
  });

  // ── Fund scan request ───────────────────────────────────────────────────────
  // The fund form on the homepage posts kind "school", with the fund in the
  // `school` column, so it saves against the live table without a migration.
  // Its message is prefixed "[funds]" (data-source="funds") so a fund request
  // can be told apart. Give it its own kind once db/signups.sql allows one.
  wireForm({
    form: field("school-form"),
    error: field("school-error"),
    sent: field("school-sent"),
    validate: () => {
      const required = ["school-name", "school-role", "school-district", "school-email"];
      for (const id of required) {
        if (!field(id).value.trim())
          return { message: field("school-form").dataset.error, field: field(id) };
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field("school-email").value.trim()))
        return { message: field("school-form").dataset.error, field: field("school-email") };
      return null;
    },
    payload: () => ({
      kind: "school",
      name: field("school-name").value.trim(),
      role: field("school-role").value.trim(),
      school: field("school-district").value.trim(),
      email: field("school-email").value.trim(),
      message: [
        field("school-form").dataset.source && `[${field("school-form").dataset.source}]`,
        field("school-message").value.trim(),
      ]
        .filter(Boolean)
        .join(" "),
    }),
  });

  // ── Questions (inquiries) ─────────────────────────────────────────────────
  const inquiry = field("inquiry-form");
  if (inquiry) {
    const error = field("inquiry-error");
    const sent = field("inquiry-sent");
    const button = inquiry.querySelector("button[type=submit]");
    const label = button.textContent;
    inquiry.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (button.disabled) return;
      error.hidden = true;
      const email = field("inquiry-email");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
        error.textContent = inquiry.dataset.error;
        error.hidden = false;
        email.focus();
        return;
      }
      button.disabled = true;
      button.textContent = label.replace(/[^ ]+$/, "…");
      try {
        await post("/api/inquiry", {
          email: email.value.trim(),
          company: "",
          message: field("inquiry-message").value.trim(),
        });
        inquiry.hidden = true;
        sent.hidden = false;
        sent.focus();
      } catch {
        error.textContent = inquiry.dataset.error;
        error.hidden = false;
      } finally {
        button.disabled = false;
        button.textContent = label;
      }
    });
  }
})();

/* The Part B calculators. The arithmetic and the sentences are in msp-calc.js,
   shared with the build, which prints the default result into the HTML; this
   only reads the inputs and re-renders. Nothing typed here leaves the page. */
(() => {
  const rulesEl = document.getElementById("msp-rules");
  if (!rulesEl || !window.MSPCalc) return;
  const rules = JSON.parse(rulesEl.textContent);
  const calc = window.MSPCalc;

  const templates = (form) => JSON.parse(form.dataset.tpl || "{}");
  const show = (el, text) => {
    if (!el) return;
    el.textContent = text;
    el.hidden = !text;
  };

  document.querySelectorAll('form[data-calc="fund"]').forEach((form) => {
    const tpl = templates(form);
    const lang = form.dataset.lang;
    const out = (k) => form.querySelector(`[data-out="${k}"]`);
    const update = () => {
      const t = calc.fundText(rules, {
        retirees: form.elements.retirees.value,
        reimbursed: Number(form.elements.reimbursed.value),
        pension: form.elements.pension.value,
        fee: 0.2,
      }, tpl, lang);
      for (const k of ["pool", "poolRange", "enrolled", "enrolledRange", "saved", "savedRange", "fee", "net",
        "retirees", "perRetiree", "ceiling", "timing"]) show(out(k), t[k]);
    };
    form.addEventListener("input", update);
    form.addEventListener("submit", (e) => e.preventDefault());
    update();
  });

  document.querySelectorAll('form[data-calc="member"]').forEach((form) => {
    const tpl = templates(form);
    const lang = form.dataset.lang;
    const out = (k) => form.querySelector(`[data-out="${k}"]`);
    const coupleField = form.querySelector("[data-when-couple]");
    const update = () => {
      const couple = form.elements.household.value === "2";
      if (coupleField) coupleField.hidden = !couple;
      const t = calc.memberText(rules, {
        couple,
        onMedicare: Number(form.elements.onMedicare.value),
        unearned: form.elements.unearned.value,
        earned: form.elements.earned.value,
        premiums: form.elements.premiums.value,
        reimbursed: Number(form.elements.reimbursed.value),
        partA: form.elements.partA.value === "yes",
        medicaid: form.elements.medicaid.value === "yes",
      }, tpl, lang);
      show(out("headline"), t.headline);
      show(out("gain"), t.gain);
      show(out("extra"), t.extra);
    };
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    form.addEventListener("submit", (e) => e.preventDefault());
    update();
  });
})();


/* The district picker on /schools: searches public/scan-data.json, built by
   tools/site/scan/build.py from the state's own files, and recomputes the
   arithmetic from the assumptions shipped in that JSON. */
(() => {
  const input = document.getElementById("district-input");
  if (!input) return;
  const L = JSON.parse(document.getElementById("district-strings").textContent);
  const figure = document.getElementById("scan-figure"), sub = document.getElementById("scan-sub"), lines = document.getElementById("scan-lines");
  const list = document.getElementById("scan-matches"), quick = document.getElementById("scan-quick");
  let A = null, rows = [], active = -1;
  const money = (n) => n >= 1e7 ? "$" + (n / 1e6).toFixed(0) + "M" : n >= 1e6 ? "$" + (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? "$" + Math.round(n / 1e3) + "K" : "$" + Math.round(n);
  const num = (n) => n.toLocaleString("en-US");
  const fill = (t, m) => t.replace(/\{(\w+)\}/g, (_, k) => m[k]);
  const show = (fig, s, ls) => {
    figure.firstChild.nodeValue = fig; sub.textContent = s; lines.innerHTML = "";
    for (const [a, b] of ls) { const row = document.createElement("div"); const sp = document.createElement("span"); sp.textContent = a; const bb = document.createElement("b"); bb.textContent = b; row.append(sp, bb); lines.append(row); }
  };
  const district = (r) => {
    const [, name, , enrolled, absent, rate, perDay, perCounted, perPoint, basic, kind, trend] = r;
    const when = kind === "c" ? L.trendCharter : trend == null ? L.trendNone : trend < 0 ? fill(L.trendDown, { pct: Math.abs(trend) }) : fill(L.trendUp, { pct: trend });
    const reached = Math.round(absent * A.reach), days = reached * A.days, uncounted = Math.round(enrolled * A.uncounted);
    const cost = [fill(L.line3, { enrolled: num(enrolled) }), money(enrolled * L.priceBase) + "–" + money(enrolled * L.priceTop)];
    if (basic) { show("$0", fill(L.basicSub, { name }), [[fill(L.basicLine1, { absent: num(absent) }), rate + "%"], [L.basicLine2, "$0"], cost, [L.basicLine3, ""]]); return; }
    const att = days * perDay, cnt = uncounted * perCounted;
    show(money(att + cnt), fill(L.sub, { name }), [
      [fill(L.line1, { uncounted: num(uncounted), perCounted: num(perCounted) }), money(cnt)],
      [fill(L.line2, { absent: num(absent), days: A.days, perDay }), money(att)],
      cost,
      [fill(L.line4, { perPoint: money(perPoint) }) + " " + when, ""],
    ]);
  };
  const pick = (id) => { const r = rows.find((r) => r[0] === id); if (!r) return; input.value = r[1]; district(r); };
  const close = () => { list.innerHTML = ""; active = -1; input.setAttribute("aria-expanded", "false"); };
  const search = () => {
    const q = input.value.trim().toLowerCase(); close(); if (q.length < 2 || !rows.length) return;
    const hits = rows.map((r) => { const n = r[1].toLowerCase(), c = r[2].toLowerCase(); const k = n.indexOf(q) === 0 ? 0 : n.indexOf(q) > 0 ? 1 : c.indexOf(q) === 0 ? 2 : -1; return [k, r]; })
      .filter((h) => h[0] >= 0).sort((x, y) => x[0] - y[0] || y[1][3] - x[1][3]).slice(0, 8).map((h) => h[1]);
    for (const r of hits) { const li = document.createElement("li"); li.setAttribute("role", "option"); li.dataset.id = r[0]; li.textContent = r[1]; const sm = document.createElement("small"); sm.textContent = r[10] === "c" ? r[2] + " · " + L.charterTag : r[2]; li.append(sm); li.addEventListener("mousedown", (e) => { e.preventDefault(); pick(r[0]); close(); }); list.append(li); }
    input.setAttribute("aria-expanded", hits.length ? "true" : "false");
  };
  fetch("/scan-data.json").then((r) => r.json()).then((d) => { A = d.assumptions; rows = d.districts; }).catch(() => { input.placeholder = L.offline; });
  input.addEventListener("input", search);
  input.addEventListener("focus", () => { if (rows.length && input.value) search(); });
  input.addEventListener("blur", close);
  input.addEventListener("keydown", (e) => {
    const items = list.children; if (!items.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); active = (active + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length; for (let i = 0; i < items.length; i++) items[i].setAttribute("aria-selected", i === active ? "true" : "false"); }
    else if (e.key === "Enter") { e.preventDefault(); pick(items[active >= 0 ? active : 0].dataset.id); close(); }
    else if (e.key === "Escape") close();
  });
  quick.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) pick(b.dataset.pick); });
})();

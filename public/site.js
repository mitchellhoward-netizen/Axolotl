/* Axolotl website behaviour.
   ============================================================================
   Kept deliberately small: the site is static and every word of it is in the
   HTML before this file runs, so this only adds the things a page cannot do
   without scripting — the mobile menu, the sticky join bar, the privacy panel
   link, and the four forms.

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
    const leftOf = (slide) =>
      slide.getBoundingClientRect().left - track.getBoundingClientRect().left + track.scrollLeft;
    const at = () =>
      slides.reduce(
        (best, slide, i) =>
          Math.abs(leftOf(slide) - track.scrollLeft) < Math.abs(leftOf(slides[best]) - track.scrollLeft)
            ? i
            : best,
        0,
      );
    const go = (i) => {
      const index = Math.max(0, Math.min(slides.length - 1, i));
      track.scrollTo({ left: leftOf(slides[index]), behavior: reduce ? "auto" : "smooth" });
    };
    const sync = () => {
      const index = at();
      prev.disabled = index === 0;
      next.disabled = index === slides.length - 1;
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
  wireForm({
    form: field("join-form"),
    error: field("join-error"),
    sent: field("join-sent"),
    validate: () =>
      isUsPhone(field("join-phone").value)
        ? null
        : { message: field("join-form").dataset.errorPhone, field: field("join-phone") },
    payload: () => ({ kind: "family", phone: digits(field("join-phone").value) }),
    onSuccess: () => {
      const text = field("join-sent-text");
      text.textContent = text.dataset.template.replace("{phone}", field("join-phone").value.trim());
    },
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

  // ── School pilot request ──────────────────────────────────────────────────
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
      message: field("school-message").value.trim(),
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

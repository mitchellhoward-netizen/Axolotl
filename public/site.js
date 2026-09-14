(() => {
  document.querySelectorAll("[data-privacy], [data-inquiry]").forEach((link) =>
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const panel = document.getElementById(link.hash.slice(1));
      panel.open = true;
      if (location.hash !== link.hash) history.pushState(null, "", link.hash);
      panel.scrollIntoView({ block: "start" });
      panel.querySelector("summary").focus({ preventScroll: true });
    }),
  );
  const openLinkedPanel = () => {
    if (location.hash === "#privacy" || location.hash === "#contact") {
      document.getElementById(location.hash.slice(1)).open = true;
    }
  };
  openLinkedPanel();
  window.addEventListener("hashchange", openLinkedPanel);

  const inquiry = document.getElementById("inquiry-form");
  inquiry.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = inquiry.querySelector("button");
    if (button.disabled) return;
    const error = document.getElementById("inquiry-error");
    error.hidden = true;
    button.disabled = true;
    button.textContent = "Sending…";
    try {
      const response = await fetch("/api/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inquiry.elements.email.value.trim(),
          company: inquiry.elements.company.value.trim(),
          message: inquiry.elements.message.value.trim(),
        }),
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true)
        throw new Error("Inquiry not saved");
      inquiry.hidden = true;
      const sent = document.getElementById("inquiry-sent");
      sent.hidden = false;
      sent.focus();
    } catch {
      error.hidden = false;
    } finally {
      button.disabled = false;
      button.textContent = "Send an inquiry";
    }
  });

  const waitlist = document.getElementById("waitlist-form");
  waitlist.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = waitlist.querySelector("button");
    if (button.disabled) return;
    const error = document.getElementById("waitlist-error");
    const phone = document.getElementById("waitlist-phone");
    const digits = phone.value.replace(/\D/g, "");
    error.hidden = true;
    if (digits.length < 7 || digits.length > 15) {
      error.textContent =
        "Enter a valid phone number, including your area code.";
      error.hidden = false;
      phone.focus();
      return;
    }
    button.disabled = true;
    button.textContent = "Joining…";
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: digits }),
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true)
        throw new Error("Signup not saved");
      waitlist.hidden = true;
      const sent = document.getElementById("waitlist-sent");
      sent.hidden = false;
      sent.focus();
    } catch {
      error.textContent = "We couldn’t save your signup. Please try again.";
      error.hidden = false;
    } finally {
      button.disabled = false;
      button.textContent = "Join the waitlist";
    }
  });

  // Animate only the mascot; the full headline always stays visible.
  const mascot = document.getElementById("benny-wake");
  const motionToggle = document.getElementById("benny-motion");
  motionToggle.hidden = false;
  motionToggle.addEventListener("click", () => {
    const paused = mascot.dataset.paused !== "true";
    mascot.dataset.paused = String(paused);
    motionToggle.textContent = paused ? "Resume motion" : "Pause motion";
  });
  import("/animation/wake.js?v=independent-headline-1")
    .then(({ mountWake }) => mountWake(mascot))
    .catch(() => {
      // The static awake artwork is already present if the module cannot load.
    });
})();

(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const state = {
    data: null,
    scenarioId: null,
    caseId: null,
    displayed: new Map(),
    stale: new Set(),
    busy: false,
  };
  const money = (cents) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format((cents || 0) / 100);
  const time = (iso) =>
    iso
      ? new Intl.DateTimeFormat("en-US", {
          timeZone: "America/Los_Angeles",
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(iso))
      : "—";
  const el = (tag, className, text) => {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  function error(message) {
    const box = $("error");
    box.textContent = message || "";
    box.hidden = !message;
  }
  async function request(path, options) {
    const response = await fetch(path, options);
    let body = {};
    try {
      body = await response.json();
    } catch (_) {
      /* visible generic error below */
    }
    if (!response.ok || body.error)
      throw new Error(body.error || `Request failed (${response.status})`);
    return body;
  }
  async function refresh({ initial = false } = {}) {
    try {
      const data = await request("/api/state");
      const changed =
        !state.data ||
        JSON.stringify(data.cases) !== JSON.stringify(state.data.cases);
      if (!initial && state.caseId) {
        const next = data.cases.find((c) => c.id === state.caseId);
        const shown = state.displayed.get(state.caseId);
        if (
          shown &&
          next?.proposal &&
          (shown.revision !== next.proposal.revision ||
            shown.hash !== next.proposal.hash)
        )
          state.stale.add(state.caseId);
        if (!shown && next?.proposal) acceptProposal(next);
      }
      state.data = data;
      $("clock").textContent = time(data.now);
      if (changed) render();
    } catch (e) {
      error(e.message);
    }
  }
  async function mutate(path, body) {
    if (state.busy) return;
    state.busy = true;
    render();
    error("");
    try {
      await request(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Benny-Lab": "1" },
        body: JSON.stringify(body),
      });
      await refresh();
    } catch (e) {
      error(e.message);
    } finally {
      state.busy = false;
      render();
    }
  }
  function render() {
    if (!state.data) return;
    $("clock").textContent = time(state.data.now);
    const m = state.data.metrics;
    $("m-cases").textContent = m.cases;
    $("m-completed").textContent = m.completed;
    $("m-money").textContent = money(m.realizedCents);
    $("m-submitted").textContent = m.providerSubmissions;
    $("m-approvals").textContent = m.approvals;
    renderFilters();
    renderScenarios();
    renderCases();
    renderCase();
    document
      .querySelectorAll("[data-clock], #tick, #empty-load")
      .forEach((b) => {
        b.disabled = state.busy;
      });
    document.querySelectorAll("button").forEach((b) => {
      if (!b.dataset.local) b.disabled = state.busy || b.disabled;
    });
  }
  function renderFilters() {
    const select = $("workflow");
    if (select.options.length > 1) return;
    [...new Set(state.data.scenarios.map((s) => s.workflow))].forEach(
      (workflow) => {
        const option = el("option", "", workflow);
        option.value = workflow;
        select.append(option);
      },
    );
  }
  function renderScenarios() {
    const list = $("scenarios");
    list.replaceChildren();
    const filtered = state.data.scenarios.filter(
      (s) =>
        $("workflow").value === "all" || s.workflow === $("workflow").value,
    );
    if (
      !state.scenarioId ||
      !state.data.scenarios.some((s) => s.id === state.scenarioId)
    )
      state.scenarioId = filtered[0]?.id;
    filtered.forEach((s) => {
      const item = el("div");
      item.setAttribute("role", "listitem");
      const b = el("button", "scenario-button");
      b.type = "button";
      b.setAttribute("aria-current", String(s.id === state.scenarioId));
      b.append(el("small", "", s.workflow), el("strong", "", s.title));
      b.onclick = () => {
        state.scenarioId = s.id;
        renderScenarios();
      };
      item.append(b);
      list.append(item);
    });
    const scenario = state.data.scenarios.find(
      (s) => s.id === state.scenarioId,
    );
    const detail = $("scenario-detail");
    detail.replaceChildren();
    if (!scenario) {
      detail.append(el("p", "muted", "No scenarios in this workflow."));
      return;
    }
    detail.append(
      el("p", "eyebrow", scenario.workflow.toUpperCase()),
      el("h3", "", scenario.title),
      el("p", "", scenario.description),
      el("p", "label", "Expected result"),
      el("p", "", scenario.expected),
    );
    const load = el("button", "dark", "Load this fictional case");
    load.onclick = async () => {
      await mutate("/api/cases", { scenarioId: scenario.id });
      const found = state.data?.cases.find((c) => c.scenarioId === scenario.id);
      if (found) {
        state.caseId = found.id;
        acceptProposal(found);
        render();
        $("case-detail").scrollIntoView({ block: "start" });
      }
    };
    detail.append(load);
  }
  function renderCases() {
    const list = $("cases");
    list.replaceChildren();
    if (!state.data.cases.length) {
      list.append(el("p", "muted", "No cases loaded yet."));
      return;
    }
    state.data.cases.forEach((c) => {
      const b = el("button");
      b.type = "button";
      b.setAttribute("aria-current", String(c.id === state.caseId));
      b.append(
        el("strong", "", c.title),
        el("span", "status", c.status.replaceAll("_", " ")),
      );
      b.onclick = () => {
        state.caseId = c.id;
        acceptProposal(c);
        render();
        $("case-detail").scrollIntoView({ block: "start" });
      };
      list.append(b);
    });
  }
  function acceptProposal(c) {
    if (c.proposal)
      state.displayed.set(c.id, {
        ...c.proposal,
        disclosures: [...c.proposal.disclosures],
      });
    else state.displayed.delete(c.id);
    state.stale.delete(c.id);
  }
  function datum(parent, label, value) {
    const d = el("div", "fact");
    d.append(el("dt", "", label), el("dd", "", String(value)));
    parent.append(d);
  }
  function renderCase() {
    const root = $("case-detail");
    const c = state.data.cases.find((item) => item.id === state.caseId);
    if (!c) return;
    root.replaceChildren();
    const top = el("div", "case-top");
    const heading = el("div");
    heading.append(
      el(
        "p",
        "eyebrow",
        `${c.workflow} · ${c.status.replaceAll("_", " ")}`.toUpperCase(),
      ),
      el("h2", "", c.title),
      el("p", "", `${c.need} · ${c.person}`),
    );
    top.append(heading, el("span", "status", `Fixture: ${c.scenarioId}`));
    root.append(top);
    const next = el("div", "next");
    [
      ["Next action", c.nextAction],
      ["Owner", c.owner],
      [
        "Deadline / run",
        c.nextRunAt ? time(c.nextRunAt) : time(c.facts.deadline),
      ],
    ].forEach(([a, b]) => {
      const d = el("div");
      d.append(el("span", "", a), el("strong", "", b));
      next.append(d);
    });
    root.append(next);
    if (state.stale.has(c.id)) {
      const note = el("div", "rereview");
      note.append(
        el("strong", "", "Proposal changed — review is required. "),
        document.createTextNode(
          "Polling found a new revision. Approval remains disabled until you explicitly review it. ",
        ),
      );
      const review = el("button", "", "Review updated proposal");
      review.dataset.local = "true";
      review.onclick = () => {
        acceptProposal(c);
        render();
      };
      note.append(review);
      root.append(note);
    }
    root.append(actionBar(c));
    const grid = el("div", "detail-grid");
    grid.append(
      proposalPanel(c),
      factsPanel(c),
      evidencePanel(c),
      timelinePanel(c),
    );
    root.append(grid);
  }
  function actionBar(c) {
    const bar = el("div", "actions");
    const add = (label, command, extra = {}, disabled = false) => {
      const b = el(
        "button",
        command === "approve" ? "dark" : command === "cancel" ? "danger" : "",
        label,
      );
      b.disabled = disabled;
      b.onclick = () =>
        mutate(`/api/cases/${encodeURIComponent(c.id)}/command`, {
          command,
          ...extra,
        });
      bar.append(b);
    };
    if (c.status === "opportunity") add("Prepare exact proposal", "prepare");
    if (["needs_information", "blocked"].includes(c.status))
      add("Supply simulated evidence / reconnect", "repair");
    if (["awaiting_approval", "queued"].includes(c.status))
      add(
        c.workflow === "appointment"
          ? "Revise to new simulated slot"
          : "Revise simulated amount +$1",
        "revise",
      );
    if (c.status === "awaiting_approval" && c.proposal) {
      const p = state.displayed.get(c.id);
      add(
        "Approve displayed proposal",
        "approve",
        p ? { revision: p.revision, hash: p.hash } : {},
        state.stale.has(c.id) || !p,
      );
    }
    if (c.status === "ready" && c.workflow === "refill")
      add("Confirm simulated pickup", "confirm");
    if (c.status === "ready" && c.workflow === "appointment")
      add("Confirm simulated visit attended", "confirm");
    if (
      [
        "opportunity",
        "needs_information",
        "awaiting_approval",
        "queued",
        "ineligible",
        "expired",
      ].includes(c.status)
    )
      add("Cancel case", "cancel");
    return bar;
  }
  function proposalPanel(c) {
    const panel = el("section", "proposal");
    panel.append(
      el("p", "eyebrow", "EXACT APPROVAL REVIEW"),
      el(
        "h3",
        "",
        state.stale.has(c.id)
          ? "Previously displayed proposal"
          : "Displayed proposal",
      ),
    );
    const p = state.displayed.get(c.id);
    if (!p) {
      panel.append(el("p", "muted", "No proposal has been prepared."));
      return panel;
    }
    panel.append(el("p", "", p.summary));
    const dl = el("dl");
    [
      ["Operation", p.operation.replaceAll("_", " ")],
      ["Destination", p.destination],
      ["Subject", p.subject],
      ["Amount", money(p.amountCents)],
      ["Deadline", time(p.deadline)],
      [
        "Appointment",
        p.appointmentAt ? time(p.appointmentAt) : "Not applicable",
      ],
      ["Expires", time(p.expiresAt)],
      ["Revision", p.revision],
      ["Hash", p.hash],
    ].forEach(([a, b]) => datum(dl, a, b));
    panel.append(dl);
    if (p.disclosures.length) {
      panel.append(el("p", "label", "Disclosures"));
      const ul = el("ul");
      p.disclosures.forEach((x) => ul.append(el("li", "", x)));
      panel.append(ul);
    }
    return panel;
  }
  function factsPanel(c) {
    const p = el("section", "panel");
    p.append(el("h3", "", "Fictional case facts"));
    const dl = el("dl", "facts");
    const f = c.facts;
    [
      ["Covered", f.covered === null ? "Unknown" : f.covered ? "Yes" : "No"],
      ["Enrolled", f.enrolled ? "Yes" : "No"],
      ["Authority", f.authorizedDependent ? "Confirmed" : "Unconfirmed"],
      ["Documents", f.documentsComplete ? "Complete" : "Incomplete"],
      ["Amount", money(f.amountCents)],
      ["Balance", money(f.balanceCents)],
      ["Deadline", time(f.deadline)],
      ["Connection", f.connectionActive ? "Active" : "Expired"],
      ["Refills remaining", f.refillsRemaining],
      ["Slot available", f.slotAvailable ? "Yes" : "No"],
    ].forEach((x) => datum(dl, ...x));
    p.append(dl);
    return p;
  }
  function evidencePanel(c) {
    const p = el("section", "panel");
    p.append(el("h3", "", "Fictional source evidence"));
    const ul = el("ul", "evidence");
    c.evidence.forEach((e) => {
      const li = el("li");
      li.append(
        el("strong", "", e.title),
        el(
          "small",
          "",
          `${e.source.replaceAll("_", " ")} · observed ${time(e.observedAt)}`,
        ),
        el("p", "", e.detail),
      );
      ul.append(li);
    });
    p.append(ul);
    return p;
  }
  function timelinePanel(c) {
    const p = el("section", "panel timeline");
    p.append(el("h3", "", "Timeline"));
    const ul = el("ol", "timeline");
    [...c.events].reverse().forEach((e) => {
      const li = el("li");
      li.append(
        el("time", "", time(e.at)),
        el("span", "", e.type.replaceAll("_", " ")),
        document.createTextNode(e.text),
      );
      ul.append(li);
    });
    p.append(ul);
    return p;
  }
  $("workflow").addEventListener("change", () => {
    state.scenarioId = null;
    renderScenarios();
  });
  document
    .querySelectorAll("[data-clock]")
    .forEach((b) =>
      b.addEventListener("click", () =>
        mutate("/api/clock", { minutes: Number(b.dataset.clock) }),
      ),
    );
  $("tick").addEventListener("click", () => mutate("/api/tick", {}));
  $("empty-load").addEventListener("click", () =>
    mutate("/api/cases", { scenarioId: "fsa-glasses" }).then(() => {
      const c = state.data?.cases.find((x) => x.scenarioId === "fsa-glasses");
      if (c) {
        state.caseId = c.id;
        acceptProposal(c);
        render();
        $("case-detail").scrollIntoView({ block: "start" });
      }
    }),
  );
  refresh({ initial: true });
  setInterval(() => {
    if (!state.busy && document.visibilityState === "visible") refresh();
  }, 3000);
})();

// Shared helpers for every page of the book.
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Theme: follow the device unless the reader chose; remember the choice on this device only.
(function () {
  let t = null;
  try { t = localStorage.getItem("theme"); } catch (e) {}
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
})();
function toggleTheme() {
  const dark = document.documentElement.dataset.theme === "dark" ||
    (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
  const next = dark ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("theme", next); } catch (e) {}
}

async function api(path, opts = {}) {
  const o = { ...opts, headers: { "X-Requested-With": "book", ...(opts.headers || {}) } };
  if (o.json !== undefined) { o.body = JSON.stringify(o.json); o.headers["Content-Type"] = "application/json"; delete o.json; }
  const r = await fetch(path, o);
  if (r.status === 401) { location.href = "/signin"; throw new Error("Sign in first."); }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.detail || `Something went wrong (${r.status}).`);
  return body;
}

// A background job, shown as a ledger of what it is doing. Resolves with the job's result.
async function runJob(jobId, ledgerEl, url) {
  // ledgerEl may be null: then the job is followed quietly (the page shows its own status)
  ledgerEl = ledgerEl || document.createElement("div");
  const lines = [];
  let last = null;
  const t0 = Date.now();
  const draw = (final) => {
    ledgerEl.innerHTML = lines.map((l, i) => `<div class="line ${i === lines.length - 1 && !final ? "now" : "done"}">
      <span class="t">${l.t}s</span><span class="what">${esc(l.stage)}</span></div>`).join("");
  };
  ledgerEl.classList.remove("hidden");
  for (;;) {
    const j = await api(url || `/api/jobs/${jobId}`);
    if (j.stage !== last) { last = j.stage; lines.push({ stage: j.stage, t: Math.round((Date.now() - t0) / 1000) }); draw(false); }
    if (j.status === "done") { draw(true); return j.result; }
    if (j.status === "error") { draw(true); throw new Error(j.error || "That didn't work."); }
    await new Promise((res) => setTimeout(res, 1200));
  }
}

function mathify(el) {
  if (window.renderMathInElement) {
    renderMathInElement(el, { delimiters: [{ left: "$", right: "$", display: false }], throwOnError: false });
  }
}

// Typst problem markup -> readable text with KaTeX math (for showing a problem statement on screen).
function typstToTex(s) {
  let t = String(s || "");
  const frac = (str) => {
    let out = "", i = 0;
    while (i < str.length) {
      if (str.startsWith("frac(", i)) {
        let depth = 0, j = i + 4, comma = -1;
        for (; j < str.length; j++) {
          if (str[j] === "(") depth++;
          else if (str[j] === ")") { depth--; if (depth === 0) break; }
          else if (str[j] === "," && depth === 1 && comma < 0) comma = j;
        }
        const a = str.slice(i + 5, comma), b = str.slice(comma + 1, j);
        out += `\\frac{${frac(a.trim())}}{${frac(b.trim())}}`;
        i = j + 1;
      } else { out += str[i]; i++; }
    }
    return out;
  };
  return t.replace(/\$([^$]+)\$/g, (_, m) => {
    let x = frac(m);
    x = x.replace(/sqrt\(([^()]*)\)/g, "\\sqrt{$1}").replace(/root\((\d+), ([^()]*)\)/g, "\\sqrt[$1]{$2}")
      .replace(/\^\(([^()]*)\)/g, "^{$1}").replace(/\bdot\b/g, "\\cdot").replace(/\btimes\b/g, "\\times")
      .replace(/\bdiv\b/g, "\\div").replace(/<=/g, "\\le ").replace(/>=/g, "\\ge ").replace(/!=/g, "\\ne ")
      .replace(/infinity/g, "\\infty").replace(/plus\.minus/g, "\\pm").replace(/lr\(\|/g, "\\left|").replace(/\|\)/g, "\\right|")
      .replace(/cases\(([^)]*)\)/g, (_, c) => "\\begin{cases}" + c.split(", ").join("\\\\") + "\\end{cases}")
      .replace(/"([^"]*)"/g, "\\text{$1}");
    return `$${x}$`;
  }).replace(/\\\$/g, "&#36;").replace(/\\%/g, "%");
}

async function signOut() {
  try { await api("/api/auth/signout", { method: "POST" }); } catch (e) {}
  location.href = "/";
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

// ---------------------------------------------------------------- a spoken check-in
// The child explains one problem out loud; the phone's own speech recognition turns it into words.
// No audio is sent anywhere by this page: only the words, which the grown-up can correct first.
function talkBox(el, want, name, send) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  el.innerHTML = `<div class="talk">
    <div class="kick">One more thing · about 15 seconds</div>
    <p class="talk-how">${esc(want.how)}</p>
    ${SR ? `<button class="btn primary" type="button" data-rec>Listen</button>` : ""}
    <label class="field"><span>${SR ? "What was said (fix anything misheard)" : `What ${esc(name)} said, in a sentence or two`}</span>
      <textarea data-said rows="3"></textarea></label>
    <div class="row"><button class="btn" type="button" data-send>Send</button><button class="linkish" type="button" data-skip>Not now</button></div>
    <p class="caption">${SR ? "Your phone turns the words into text; no recording is kept or sent." : ""} This is never graded. It helps the next pages fit.</p>
    <p class="small" data-msg role="status"></p></div>`;
  const said = el.querySelector("[data-said]"), m = el.querySelector("[data-msg]");
  let rec = null, base = "";
  const stop = () => { if (rec) { rec.stop(); rec = null; } const b = el.querySelector("[data-rec]"); if (b) b.textContent = "Listen again"; };
  const recBtn = el.querySelector("[data-rec]");
  if (recBtn) recBtn.onclick = () => {
    if (rec) return stop();
    rec = new SR();
    rec.lang = navigator.language || "en-US"; rec.interimResults = true; rec.continuous = true;
    base = said.value ? said.value + " " : "";
    rec.onresult = (e) => { let t = ""; for (const r of e.results) t += r[0].transcript; said.value = base + t; };
    rec.onerror = (e) => { m.textContent = e.error === "not-allowed" ? "The microphone is off for this page; type what was said instead." : ""; stop(); };
    rec.onend = () => { rec = null; if (recBtn) recBtn.textContent = "Listen again"; };
    rec.start();
    recBtn.textContent = "Done listening";
    setTimeout(stop, 30000);
  };
  el.querySelector("[data-skip]").onclick = () => { stop(); el.innerHTML = ""; };
  el.querySelector("[data-send]").onclick = async () => {
    stop();
    m.textContent = "Listening to what was said…";
    try {
      const r = await send(said.value);
      el.innerHTML = spokeHtml(r, name);
    } catch (e) { m.textContent = e.message; m.className = "small err"; }
  };
}

function spokeHtml(c, name) {
  if (!c) return "";
  return `<div class="talk said"><div class="kick">${esc(name)} explained number ${c.number}</div>
    ${c.quote ? `<p class="quote">“${esc(c.quote)}”</p>` : ""}<p>${esc(c.note)}</p></div>`;
}

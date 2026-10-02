"""Browser front end: `python -m adaptcalc serve`.

Pages
  /                     the book's front matter (public): what it is, sign in, create an account
  /signin, /signup      account forms (sign-up needs a pilot access code)
  /home                 a family's learners: add a child, open their book, account settings
  /learn/<id>           one learner's workspace: next step, packets, photos, feedback, questions
  /learn/<id>/progress  a parent-readable progress report
  /privacy, /terms      plain-language policies

API (JSON). Everything under /api/l/<learner id>/ is scoped to one learner of the signed-in
family: their course and their own data directory. Building a packet and grading a photo take
from a few seconds to a minute or two, so they run as background jobs: the POST returns a job id
and the page polls /api/jobs/<id>, which reports what the job is doing.

Security: HttpOnly SameSite=Lax session cookie; state-changing requests must carry the header
X-Requested-With (a cross-site form cannot send it); the learner id is always checked against
the signed-in family.
"""
from __future__ import annotations

import collections
import datetime as dt
import functools
import json
import os
import re
import secrets
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse, Response

from . import accounts, billing, diagnostic, extract, flow, mailer, packets, paths, pipeline, records, source, transcribe, volume
from .learner import LearnerDB, config

STATIC = Path(__file__).resolve().parent / "static"
COOKIE = "book_session"
app = FastAPI(title="Adaptive textbook", docs_url=None, redoc_url=None)


# ---------------------------------------------------------------------------
# courses

def course_info(course_id: str) -> dict:
    with paths.use_course(course_id):
        src = extract.course_source()
        n = len(extract.skills())
    books = [b["id"] for b in src.get("books", [])] or ["calc1"]
    return {"id": course_id, "title": src.get("title", course_id), "subtitle": src.get("subtitle", ""),
            "commercial": bool(src.get("commercial")), "skills": n,
            "credit": " ".join(source.attribution_line(b) for b in books),
            "starts": [{"id": k, "label": v["label"]} for k, v in config().get("starting_points", {}).get(course_id, {}).items()]}


def courses_for(family: dict) -> list[dict]:
    """Families see the courses whose text may be used in a paid product; the owner also sees
    personal-study courses (Calculus Volume 1 is non-commercial)."""
    out = []
    order = {"elementary": 0, "prealgebra": 1, "algebra1": 2}  # by grade; anything else after
    for d in sorted(paths.COURSES_DIR.iterdir(), key=lambda d: (order.get(d.name, 9), d.name)):
        if (d / "skills.json").exists():
            info = course_info(d.name)
            if info["commercial"] or family.get("role") == "owner":
                out.append(info)
    return out


# ---------------------------------------------------------------------------
# sessions and scope

def acc() -> accounts.Accounts:
    return accounts.Accounts()


def signed_in(request: Request) -> tuple[accounts.Accounts, dict] | None:
    a = acc()
    fid = a.session_family(request.cookies.get(COOKIE))
    fam = a.family(fid) if fid else None
    return (a, fam) if fam else None


def require_family(request: Request) -> tuple[accounts.Accounts, dict]:
    s = signed_in(request)
    if not s:
        raise HTTPException(401, "Sign in first.")
    return s


def require_learner(request: Request, lid: str) -> tuple[accounts.Accounts, dict, dict]:
    """The signed-in family's learner `lid`; sets the course and data directory for this request."""
    a, fam = require_family(request)
    lr = a.learner(fam["id"], lid) if re.fullmatch(r"[a-f0-9]{16}", lid or "") else None
    if not lr:
        raise HTTPException(404, "No such learner.")
    paths.set_scope(accounts.learner_dir(lid), lr["course"])
    return a, fam, lr


def base_url(request: Request | None = None) -> str:
    """The public address, for links in emails and Stripe redirects."""
    env = os.environ.get("PUBLIC_URL") or (f"https://{os.environ['RAILWAY_PUBLIC_DOMAIN']}"
                                           if os.environ.get("RAILWAY_PUBLIC_DOMAIN") else "")
    if env:
        return env.rstrip("/")
    if request is None:
        return "http://127.0.0.1:8000"
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    return f"{proto}://{request.headers.get('host') or request.url.netloc}"


def require_access(a: accounts.Accounts, fam: dict) -> None:
    if not a.has_access(fam):
        raise HTTPException(402, "Start the subscription on the Learners page to make new packets and send in work. "
                                 "Everything already made stays readable.")


def in_background(fn, *args) -> None:
    threading.Thread(target=fn, args=args, daemon=True).start()


def db() -> LearnerDB:
    return LearnerDB()  # one connection per request (SQLite connections are per thread)


_RATE: dict[str, list[float]] = collections.defaultdict(list)


def rate_limit(key: str, n: int, per_s: float) -> None:
    now_ = time.time()
    hits = [t for t in _RATE[key] if now_ - t < per_s]
    if len(hits) >= n:
        raise HTTPException(429, "Too many attempts. Wait a minute and try again.")
    hits.append(now_)
    _RATE[key] = hits


@app.middleware("http")
async def guard(request: Request, call_next):
    if request.method in ("POST", "PUT", "PATCH", "DELETE") and request.url.path.startswith("/api/") \
            and request.headers.get("x-requested-with") != "book":
        return JSONResponse({"detail": "Missing request header."}, status_code=403)
    resp = await call_next(request)
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "same-origin")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Permissions-Policy", "camera=(self), microphone=(), geolocation=()")
    return resp


def set_session(resp: Response, token: str, request: Request) -> None:
    secure = request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
    resp.set_cookie(COOKIE, token, max_age=accounts.SESSION_DAYS * 86400, httponly=True, samesite="lax",
                    secure=secure, path="/")


# ---------------------------------------------------------------------------
# background jobs

_POOL = ThreadPoolExecutor(max_workers=int(os.environ.get("ADAPTCALC_WORKERS", "4")))
_JOBS: dict[str, dict] = {}
_LOCKS: dict[str, threading.Lock] = collections.defaultdict(threading.Lock)


def start_job(fid: str, lid: str, course: str, kind: str, fn) -> str:
    """Run fn(progress) for one learner in the background, one job per learner at a time."""
    jid = secrets.token_hex(8)
    job = {"id": jid, "family": fid, "learner": lid, "kind": kind, "status": "queued", "stage": "Waiting to start",
           "result": None, "error": None, "started": time.time()}
    _JOBS[jid] = job

    def run():
        with _LOCKS[lid]:
            paths.set_scope(accounts.learner_dir(lid), course)
            job["status"] = "running"

            def progress(stage: str):
                job["stage"] = stage

            try:
                job["result"] = fn(progress)
                job["status"] = "done"
                job["stage"] = "Done"
            except HTTPException as e:
                job["status"], job["error"] = "error", e.detail
            except Exception as e:  # noqa: BLE001 - the page shows the reason
                job["status"], job["error"] = "error", f"{type(e).__name__}: {str(e)[:300]}"
        for k in [k for k, j in _JOBS.items() if j["status"] in ("done", "error") and time.time() - j["started"] > 3600]:
            _JOBS.pop(k, None)

    _POOL.submit(run)
    return jid


def kick(a: accounts.Accounts, fam: dict, lr: dict, base: str) -> str | None:
    """Make the learner's next pages in the background, if none are open (no-op otherwise)."""
    lid = lr["id"]
    if flow.activity(lid) and flow.activity(lid)["kind"] == "making":
        return None
    flow.set_activity(lid, "making", "Getting ready")

    def work(progress):
        def say(stage):
            progress(stage)
            flow.set_activity(lid, "making", stage)
        a2 = acc()  # this runs on a worker thread: its own database connection
        try:
            return flow.advance(a2, a2.family(fam["id"]) or fam, lr, base, say) or {}
        finally:
            flow.set_activity(lid, None)

    return start_job(fam["id"], lid, lr["course"], "making", work)


@app.get("/api/jobs/{jid}")
def job_status(jid: str, request: Request):
    _, fam = require_family(request)
    j = _JOBS.get(jid)
    if not j or j["family"] != fam["id"]:
        raise HTTPException(404, "No such job.")
    return {k: j[k] for k in ("id", "kind", "status", "stage", "result", "error")} | {
        "seconds": round(time.time() - j["started"])}


# ---------------------------------------------------------------------------
# pages

def page(name: str) -> HTMLResponse:
    return HTMLResponse((STATIC / name).read_text(encoding="utf-8"), headers={"Cache-Control": "no-store"})


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/", response_class=HTMLResponse)
def front(request: Request):
    return page("front.html")


@app.get("/signin", response_class=HTMLResponse)
@app.get("/signup", response_class=HTMLResponse)
def account_page(request: Request):
    if signed_in(request):
        return RedirectResponse("/home", status_code=303)
    return page("account.html")


@app.get("/home", response_class=HTMLResponse)
def home_page(request: Request):
    if not signed_in(request):
        return RedirectResponse("/signin", status_code=303)
    return page("home.html")


@app.get("/learn/{lid}", response_class=HTMLResponse)
def learn_page(lid: str, request: Request):
    if not signed_in(request):
        return RedirectResponse("/signin", status_code=303)
    return page("learn.html")


@app.get("/learn/{lid}/progress", response_class=HTMLResponse)
def progress_page(lid: str, request: Request):
    if not signed_in(request):
        return RedirectResponse("/signin", status_code=303)
    return page("progress.html")


@app.get("/reset", response_class=HTMLResponse)
@app.get("/forgot", response_class=HTMLResponse)
def reset_page():
    return page("reset.html")


@app.get("/privacy", response_class=HTMLResponse)
def privacy_page():
    return page("privacy.html")


@app.get("/terms", response_class=HTMLResponse)
def terms_page():
    return page("terms.html")


@app.get("/static/{name}")
def static_file(name: str):
    p = STATIC / name
    if not re.fullmatch(r"[a-z0-9_-]+\.(css|js|svg)", name) or not p.exists():
        raise HTTPException(404)
    mt = {"css": "text/css", "js": "text/javascript", "svg": "image/svg+xml"}[name.rsplit(".", 1)[1]]
    return FileResponse(p, media_type=mt, headers={"Cache-Control": "no-cache"})


@app.get("/fonts/{name}")
def font(name: str):
    p = paths.FONT_DIR / name
    if not re.fullmatch(r"[A-Za-z0-9-]+\.ttf", name) or not p.exists():
        raise HTTPException(404)
    return FileResponse(p, media_type="font/ttf", headers={"Cache-Control": "public, max-age=31536000, immutable"})


@app.get("/vendor/{path:path}")
def vendor(path: str):
    from . import assets

    p = (assets.VENDOR / path).resolve()
    if not str(p).startswith(str(assets.VENDOR.resolve())) or not p.is_file():
        raise HTTPException(404)
    mt = {".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2"}.get(p.suffix, "application/octet-stream")
    return FileResponse(p, media_type=mt, headers={"Cache-Control": "public, max-age=31536000, immutable"})


# ---------------------------------------------------------------------------
# accounts

@app.post("/api/auth/signup")
async def signup(request: Request):
    rate_limit(f"signup:{request.client.host if request.client else '-'}", 5, 3600)
    b = await request.json()
    a = acc()
    try:
        fid = a.sign_up(str(b.get("email", "")), str(b.get("password", "")), str(b.get("name", "")), str(b.get("code", "")))
    except accounts.AuthError as e:
        raise HTTPException(400, str(e)) from e
    fam = a.family(fid)
    child, grade = " ".join(str(b.get("child", "")).split()), str(b.get("grade", ""))
    lid = None
    if child and grade in flow.GRADE:  # the one-step sign-up: the child's first pages start right away
        course, start = flow.GRADE[grade]
        lid = a.add_learner(fid, child, course, start)
        kick(a, fam, a.learner(fid, lid), base_url(request))
    else:
        in_background(mailer.welcome, fam["email"], fam["name"], base_url(request))
    resp = JSONResponse({"ok": True, "learner": lid})
    set_session(resp, a.new_session(fid), request)
    return resp


@app.post("/api/auth/forgot")
async def forgot(request: Request):
    b = await request.json()
    email = str(b.get("email", "")).strip().lower()
    rate_limit(f"forgot:{request.client.host if request.client else '-'}", 5, 3600)
    rate_limit(f"forgot:{email}", 3, 3600)
    token = acc().start_reset(email)
    if token:
        in_background(mailer.reset, email, f"{base_url(request)}/reset?token={token}")
    return {"ok": True, "message": "If there is an account for that email, a reset link is on its way. It works for one hour."}


@app.post("/api/auth/reset")
async def reset(request: Request):
    b = await request.json()
    rate_limit(f"reset:{request.client.host if request.client else '-'}", 10, 3600)
    a = acc()
    try:
        fid = a.finish_reset(str(b.get("token", "")), str(b.get("password", "")))
    except accounts.AuthError as e:
        raise HTTPException(400, str(e)) from e
    resp = JSONResponse({"ok": True})
    set_session(resp, a.new_session(fid), request)
    return resp


@app.post("/api/auth/signin")
async def signin(request: Request):
    b = await request.json()
    email = str(b.get("email", "")).strip().lower()
    rate_limit(f"signin:{request.client.host if request.client else '-'}", 20, 900)
    rate_limit(f"signin:{email}", 8, 900)
    a = acc()
    try:
        fid = a.authenticate(email, str(b.get("password", "")))
    except accounts.AuthError as e:
        raise HTTPException(400, str(e)) from e
    resp = JSONResponse({"ok": True})
    set_session(resp, a.new_session(fid), request)
    return resp


@app.post("/api/auth/signout")
def signout(request: Request):
    acc().end_session(request.cookies.get(COOKIE))
    resp = JSONResponse({"ok": True})
    resp.delete_cookie(COOKIE, path="/")
    return resp


@app.get("/api/me")
def me(request: Request):
    a, fam = require_family(request)
    out = []
    for lr in a.learners(fam["id"]):
        paths.set_scope(accounts.learner_dir(lr["id"]), lr["course"])
        d = db()
        sk = extract.skills()
        done = d.mastered_set()
        front = d.frontier()
        attempts = d.attempts()
        out.append({"id": lr["id"], "name": lr["name"], "course": course_info(lr["course"]),
                    "mastered": len(done), "total": len(sk),
                    "problems": len(attempts), "correct": sum(int(x["correct"]) for x in attempts),
                    "next": [sk[s]["name"] for s in front[:2]],
                    "open": [p["id"] for p in d.packets() if p["status"] == "open"],
                    "last": attempts[-1]["graded_at"] if attempts else None})
    bill = {"enabled": billing.enabled(), "plan": fam.get("plan"), "until": fam.get("plan_until"),
            "access": a.has_access(fam), "trial_days": billing.trial_days(),
            "price": billing.price_display(a) if billing.enabled() else None,
            "can_manage": bool(fam.get("stripe_customer"))}
    return {"family": {"email": fam["email"], "name": fam["name"], "role": fam["role"], "weekly": bool(fam.get("weekly"))},
            "learners": out, "courses": courses_for(fam), "billing": bill}


@app.post("/api/account/weekly")
async def weekly_pref(request: Request):
    a, fam = require_family(request)
    b = await request.json()
    a.update_family(fam["id"], weekly=1 if b.get("on") else 0)
    return {"weekly": bool(b.get("on"))}


@app.post("/api/billing/checkout")
def billing_checkout(request: Request):
    a, fam = require_family(request)
    if not billing.enabled():
        raise HTTPException(409, "Billing is not switched on.")
    try:
        return {"url": billing.checkout_url(a, fam, base_url(request))}
    except billing.BillingError as e:
        raise HTTPException(502, str(e)) from e


@app.post("/api/billing/portal")
def billing_portal(request: Request):
    a, fam = require_family(request)
    try:
        return {"url": billing.portal_url(a, fam, base_url(request))}
    except billing.BillingError as e:
        raise HTTPException(409, str(e)) from e


@app.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    a = acc()
    payload = await request.body()
    try:
        event = billing.verify(payload, request.headers.get("stripe-signature", ""), billing.webhook_secret(a))
    except billing.BillingError as e:
        raise HTTPException(400, str(e)) from e
    try:
        out = billing.handle(a, event)
    except billing.BillingError as e:
        raise HTTPException(502, str(e)) from e
    if out["changed"] and out["email"]:
        in_background(mailer.receipt_note, out["email"], out["plan"], base_url(request))
    return {"received": True, **{k: out[k] for k in ("type", "plan")}}


@app.post("/api/learners")
async def add_learner(request: Request):
    a, fam = require_family(request)
    b = await request.json()
    allowed = {c["id"]: c for c in courses_for(fam)}
    if str(b.get("grade", "")) in flow.GRADE:  # the usual way: the grade the child is in
        course, start = flow.GRADE[str(b["grade"])]
    else:
        course, start = str(b.get("course", "")), str(b.get("start", "unsure"))
    if course not in allowed:
        raise HTTPException(400, "Choose the grade your child is in.")
    if start not in {s["id"] for s in allowed[course]["starts"]}:
        start = "unsure"
    try:
        lid = a.add_learner(fam["id"], str(b.get("name", "")), course, start)
    except accounts.AuthError as e:
        raise HTTPException(400, str(e)) from e
    if b.get("make", True):
        kick(a, fam, a.learner(fam["id"], lid), base_url(request))
    return {"id": lid}


@app.delete("/api/learners/{lid}")
def remove_learner(lid: str, request: Request):
    a, fam = require_family(request)
    try:
        a.remove_learner(fam["id"], lid)
    except accounts.AuthError as e:
        raise HTTPException(404, str(e)) from e
    return {"ok": True}


@app.post("/api/account/password")
async def change_password(request: Request):
    a, fam = require_family(request)
    b = await request.json()
    try:
        a.authenticate(fam["email"], str(b.get("current", "")))
        a.set_password(fam["id"], str(b.get("password", "")))
    except accounts.AuthError as e:
        raise HTTPException(400, str(e)) from e
    resp = JSONResponse({"ok": True})
    set_session(resp, a.new_session(fam["id"]), request)
    return resp


@app.post("/api/account/delete")
async def delete_account(request: Request):
    a, fam = require_family(request)
    b = await request.json()
    if str(b.get("confirm", "")).strip().upper() != "DELETE":
        raise HTTPException(400, 'Type DELETE to confirm.')
    try:
        a.authenticate(fam["email"], str(b.get("password", "")))
    except accounts.AuthError as e:
        raise HTTPException(400, str(e)) from e
    a.delete_family(fam["id"])
    resp = JSONResponse({"ok": True})
    resp.delete_cookie(COOKIE, path="/")
    return resp


@app.get("/api/account/export")
def export_account(request: Request):
    """Everything stored about a family's learners, as one JSON file."""
    a, fam = require_family(request)
    out = {"family": {"email": fam["email"], "name": fam["name"], "created": fam["created"]}, "learners": []}
    for lr in a.learners(fam["id"]):
        paths.set_scope(accounts.learner_dir(lr["id"]), lr["course"])
        d = db()
        out["learners"].append({
            "name": lr["name"], "course": lr["course"], "created": lr["created"],
            "skills": [dict(r) for r in d.skill_rows()],
            "packets": [dict(p) for p in d.packets()],
            "attempts": [{k: v for k, v in x.items() if k != "pdata"} for x in d.attempts()],
            "questions": d.questions()})
    return Response(json.dumps(out, indent=1, default=str), media_type="application/json",
                    headers={"Content-Disposition": 'attachment; filename="my-data.json"'})


# ---------------------------------------------------------------------------
# one learner

def transcriber_ready() -> bool:
    return transcribe.default_transcriber().backend == "claude-vision"


@app.get("/api/l/{lid}/state")
def state(lid: str, request: Request):
    _, _, lr = require_learner(request, lid)
    d = db()
    sk = extract.skills()
    rows = {r["id"]: r for r in d.skill_rows()}
    done = d.mastered_set()
    thr = config()["learner"]["mastery_threshold"]
    groups = skill_groups()
    skills = [{"id": s, "name": sk[s]["name"], "group": groups[s], "kind": sk[s]["kind"],
               "p": round(rows[s]["p_mastery"], 3), "mastered": s in done, "practice": rows[s]["n_obs"],
               "seen": rows[s]["source"] != "prior" or rows[s]["n_obs"] > 0}
              for s in extract.skill_order()]
    summ = diagnostic.summary(d)
    cfg = config()["diagnostic"]
    rounds = d.packets("diagnostic")
    open_round = any(r["status"] == "open" for r in rounds)
    finished = False
    if not open_round and summ["asked"] >= cfg["min_questions"]:
        try:
            finished = diagnostic.next_round(d) is None
        except RuntimeError:
            finished = False
    pk = []
    for p in reversed(d.packets()):
        probs = d.problems(p["id"])
        meta = json.loads(p["meta"] or "{}")
        graded = sum(1 for q in probs if d.is_graded(q["id"]))
        pk.append({"id": p["id"], "kind": p["kind"], "status": p["status"], "created": p["created"],
                   "problems": len(probs), "graded": graded,
                   "focus": [sk[s]["name"] for s in meta.get("focus", []) if s in sk],
                   "pdf": f"/l/{lid}/packets/{p['id']}.pdf" if p["pdf"] else None,
                   "key": f"/l/{lid}/packets/{p['id']}-key.pdf" if p["pdf"] else None})
    return {"learner": {"id": lid, "name": lr["name"]}, "course": course_info(lr["course"]),
            "skills": skills, "threshold": thr,
            "diagnostic": {"asked": summ["asked"], "answered": summ["answered"],
                           "uncertainty_bits": round(summ["entropy"]["sum_marginal_bits"], 1),
                           "min": cfg["min_questions"], "max": cfg["max_questions"],
                           "open_round": open_round, "finished": finished},
            "packets": pk, "frontier": [sk[s]["name"] for s in d.frontier()[:3]],
            "reviews": [sk[s]["name"] for s in d.due_reviews()],
            "ready": {"photos": transcriber_ready(), "jev": bool(os.environ.get("TYPESAFE_API_KEY"))}}


skill_groups = records.skill_groups  # chapters (grades in the elementary book) per skill


def _limit(a: accounts.Accounts, lid: str, kind: str) -> None:
    lim = config().get("limits", {})
    try:
        a.use(lid, kind, int(lim.get(f"{kind}_per_day", 1000)))
    except accounts.AuthError as e:
        raise HTTPException(429, str(e)) from e


@app.post("/api/l/{lid}/diagnostic/next")
def diagnostic_next(lid: str, request: Request):
    a, fam, lr = require_learner(request, lid)
    require_access(a, fam)
    _limit(a, lid, "packets")

    def work(progress):
        d = db()
        progress("Choosing the questions that tell the most")
        try:
            pid = diagnostic.create_round(d)
        except RuntimeError as e:
            raise HTTPException(409, str(e)) from e
        if pid is None:
            return {"finished": True}
        progress("Setting the pages")
        packets.render_diagnostic(d, pid)
        return {"packet": pid, "pdf": f"/l/{lid}/packets/{pid}.pdf", "kind": "diagnostic"}

    return {"job": start_job(fam["id"], lid, lr["course"], "diagnostic", work)}


@app.post("/api/l/{lid}/lesson/next")
def lesson_next(lid: str, request: Request):
    a, fam, lr = require_learner(request, lid)
    require_access(a, fam)
    _limit(a, lid, "packets")

    def work(progress):
        d = db()
        use_jev = bool(os.environ.get("TYPESAFE_API_KEY"))
        progress("Choosing what to teach next, and checking every generated line")
        try:
            r = packets.next_lesson(d, log=d.log_jev, use_jev=use_jev)
        except RuntimeError as e:
            raise HTTPException(409, str(e)) from e
        return {"packet": r["pid"], "pdf": f"/l/{lid}/packets/{r['pid']}.pdf", "kind": r["kind"],
                "verbatim_ok": r["audit"]["ok"]}

    return {"job": start_job(fam["id"], lid, lr["course"], "lesson", work)}


@app.get("/l/{lid}/packets/{name}.pdf")
def packet_pdf(lid: str, name: str, request: Request):
    require_learner(request, lid)
    if not re.fullmatch(r"[DLR]\d+(-key)?", name):
        raise HTTPException(404)
    p = paths.OUT / f"{name}.pdf"
    if not p.exists():
        raise HTTPException(404)
    return FileResponse(p, media_type="application/pdf", filename=p.name, content_disposition_type="inline")


# ---------------------------------------------------------------------------
# the bound book (volume.py): the whole course as a textbook to read and turn the pages of

@app.get("/api/l/{lid}/book")
def book(lid: str, request: Request):
    """The course's book and this learner's place in it: which sections are learned, which is
    being worked on (the bookmark), which are ahead."""
    _, _, lr = require_learner(request, lid)
    course = lr["course"]
    idx = volume.index(course)
    if not idx:
        volume.ensure_async(course)
        return {"ready": False, **volume.status(course)}
    d = db()
    done = d.mastered_set()
    front = d.frontier()
    open_focus = []
    for p in d.packets():
        if p["status"] == "open" and p["kind"] != "diagnostic":
            open_focus += json.loads(p["meta"] or "{}").get("focus", [])
    # a place in the book comes from evidence: an open lesson, or the frontier once work has been checked
    here_skills = open_focus or (front[:1] if d.attempts() else [])
    sections = []
    bookmark = None
    for sec in idx["sections"]:
        sks = sec["skills"]
        if sks and all(s in done for s in sks):
            mark = "learned"
        elif any(s in here_skills for s in sks):
            mark = "here"
        elif any(s in done for s in sks):
            mark = "begun"
        else:
            mark = "ahead"
        if mark == "here" and bookmark is None:
            bookmark = sec["page"]
        sections.append({**sec, "mark": mark,
                         "learned": sum(1 for s in sks if s in done), "of": len(sks)})
    v = idx["hash"]
    return {"ready": True, "pages": idx["pages"], "size": idx["size"], "chapters": idx["chapters"],
            "sections": sections, "answers_page": idx["answers_page"], "bookmark": bookmark,
            "page_url": f"/l/{lid}/book/page/{{n}}.webp?v={v}", "pdf": f"/l/{lid}/book.pdf?v={v}",
            "title": extract.course_source().get("title", course)}


def _volume_file(lr: dict, rel: str) -> Path:
    if not volume.index(lr["course"]):
        raise HTTPException(404, "The book is still being bound.")
    p = volume.volume_dir(lr["course"]) / rel
    if not p.exists():
        raise HTTPException(404)
    return p


@app.get("/l/{lid}/book/page/{n}.webp")
def book_page(lid: str, n: int, request: Request):
    _, _, lr = require_learner(request, lid)
    p = _volume_file(lr, f"pages/{n}.webp")
    return FileResponse(p, media_type="image/webp", headers={"Cache-Control": "private, max-age=31536000, immutable"})


@app.get("/l/{lid}/book.pdf")
def book_pdf(lid: str, request: Request):
    _, _, lr = require_learner(request, lid)
    p = _volume_file(lr, "book.pdf")
    title = re.sub(r"[^A-Za-z0-9]+", "-", extract.course_source().get("title", "book")).strip("-")
    return FileResponse(p, media_type="application/pdf", filename=f"{title}.pdf", content_disposition_type="inline")


def _save_upload(f: UploadFile) -> Path:
    paths.INBOX.mkdir(parents=True, exist_ok=True)
    stem = re.sub(r"[^A-Za-z0-9_-]", "_", Path(f.filename or "photo").stem)[:60] or "photo"
    ext = Path(f.filename or "").suffix.lower()
    ext = ext if ext in pipeline.PHOTO_EXT else ".jpg"
    dest = paths.INBOX / f"{stem}{ext}"
    n = 1
    while dest.exists() or (paths.PROCESSED / dest.name).exists():
        n += 1
        dest = paths.INBOX / f"{stem}-{n}{ext}"
    data = f.file.read(25 * 1024 * 1024 + 1)
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(413, "That photo is over 25 MB.")
    dest.write_bytes(data)
    return dest


def photo_job(a: accounts.Accounts, fam: dict, lr: dict, dest: Path, base: str, packet: str | None = None) -> str:
    lid = lr["id"]
    flow.set_activity(lid, "checking", "Reading the page")

    def work(progress):
        def say(stage):
            progress(stage)
            flow.set_activity(lid, "checking", stage)
        d = db()
        try:
            rep = pipeline.process_photo(d, dest, progress=say, packet=packet)
        except transcribe.UnreadableImage as e:
            raise HTTPException(415, f"{e}. Try exporting the photo as JPEG.") from e
        except transcribe.PendingTranscription:
            return {"pending": True, "photo": dest.name,
                    "message": "Saved. Photo reading is not set up on this server, so this page waits for a transcript."}
        finally:
            flow.set_activity(lid, None)
        say("Writing up the feedback")
        out = public_report(rep)
        pid = rep.get("packet")
        if pid:
            out["summary"] = flow.summary_of(d, pid)
            out["done"] = flow.packet_done(d, pid)
            if out["done"]:  # the whole set is checked: the next pages start being made now
                kick(acc(), fam, lr, base)
        return out

    return start_job(fam["id"], lid, lr["course"], "photo", work)


@app.post("/api/l/{lid}/photos")
def upload_photo(lid: str, request: Request, photo: UploadFile = File(...)):
    a, fam, lr = require_learner(request, lid)
    if not os.environ.get("TYPESAFE_API_KEY"):
        raise HTTPException(503, "Photo checking is not set up on this server yet.")
    require_access(a, fam)
    _limit(a, lid, "photos")
    return {"job": photo_job(a, fam, lr, _save_upload(photo), base_url(request), request.query_params.get("packet"))}


@app.post("/api/l/{lid}/done")
def pages_done(lid: str, request: Request):
    """'That's all for these pages': what wasn't sent in stays unchecked, and the next pages are made."""
    a, fam, lr = require_learner(request, lid)
    d = db()
    with d.tx() as c:
        c.execute("UPDATE packets SET status='set_aside' WHERE status='open'")
    return {"job": kick(a, fam, lr, base_url(request))}


@app.post("/api/l/{lid}/make")
def make_pages(lid: str, request: Request):
    a, fam, lr = require_learner(request, lid)
    require_access(a, fam)
    return {"job": kick(a, fam, lr, base_url(request))}


# ---------------------------------------------------------------------------
# scan links: a phone pointed at the code on the first page, no sign-in

def scan_scope(lid: str, pid: str, sig: str) -> tuple[accounts.Accounts, dict, dict]:
    a = acc()
    lr = a.learner_by_id(lid) if re.fullmatch(r"[a-f0-9]{16}", lid or "") else None
    if not lr or not re.fullmatch(r"[DLR]\d+", pid or "") or not flow.verify(a, lid, pid, sig):
        raise HTTPException(404, "This code doesn’t open anything. Scan the code on the first page again.")
    paths.set_scope(accounts.learner_dir(lid), lr["course"])
    return a, a.family(lr["family_id"]), lr


@app.get("/s/{lid}/{pid}/{sig}", response_class=HTMLResponse)
def scan_page(lid: str, pid: str, sig: str):
    scan_scope(lid, pid, sig)
    return page("scan.html")


@app.get("/api/s/{lid}/{pid}/{sig}")
def scan_state(lid: str, pid: str, sig: str):
    a, fam, lr = scan_scope(lid, pid, sig)
    d = db()
    pk = d.packet(pid)
    if not pk:
        raise HTTPException(404, "These pages were removed.")
    act = flow.activity(lid)
    return {"name": lr["name"], "packet": pid, "kind": pk["kind"], "status": pk["status"],
            "summary": flow.summary_of(d, pid), "activity": act,
            "open": [p["id"] for p in d.packets() if p["status"] == "open"]}


@app.post("/api/s/{lid}/{pid}/{sig}/photos")
def scan_photo(lid: str, pid: str, sig: str, request: Request, photo: UploadFile = File(...)):
    a, fam, lr = scan_scope(lid, pid, sig)
    rate_limit(f"scan:{lid}", 30, 3600)
    if not os.environ.get("TYPESAFE_API_KEY"):
        raise HTTPException(503, "Photo checking is not set up on this server yet.")
    require_access(a, fam)
    _limit(a, lid, "photos")
    return {"job": photo_job(a, fam, lr, _save_upload(photo), base_url(request), pid)}


@app.get("/api/s/{lid}/{pid}/{sig}/jobs/{jid}")
def scan_job(lid: str, pid: str, sig: str, jid: str):
    scan_scope(lid, pid, sig)
    j = _JOBS.get(jid)
    if not j or j["learner"] != lid:
        raise HTTPException(404, "No such job.")
    return {k: j[k] for k in ("id", "kind", "status", "stage", "result", "error")}


def public_report(rep: dict) -> dict:
    d_pk = db()
    mis = {m["id"]: m["description"] for lst in extract.misconceptions().values() for m in lst}
    sk = extract.skills()
    out = {"photo": rep.get("photo"), "packet": rep.get("packet"), "at": rep.get("at"), "error": rep.get("error"),
           "problems": []}
    lines_by_num = {p["number"]: p.get("lines", []) for p in (rep.get("transcript") or {}).get("problems", [])}
    for p in rep.get("problems", []):
        e = {"number": p["number"], "status": p.get("status"), "problem_id": p.get("problem_id")}
        if p.get("status") == "graded":
            dec, c = p["decision"], p["stepcheck"]
            status_by_line = {x["line"]: x for x in c["lines"]}
            prob = d_pk.problem(p["problem_id"]) if p.get("problem_id") else None
            e.update({
                "correct": p["correct"], "credit": p["credit"], "skipped": c["skipped"],
                "packet_kind": (d_pk.packet(rep.get("packet")) or {"kind": None})["kind"] if rep.get("packet") else None,
                "prompt": prob["data"]["prompt"] if prob else None,
                "final_answer": c["final_answer"], "final_note": c["final_note"],
                "lines": [{"text": ln.get("text", ""), "crossed_out": ln.get("crossed_out"), "boxed": ln.get("boxed"),
                           "status": status_by_line.get(i, {}).get("status"), "note": status_by_line.get(i, {}).get("note", "")}
                          for i, ln in enumerate(lines_by_num.get(p["number"], []), 1)],
                "misconception_text": mis.get(dec.get("misconception") or ""),
                "attempts": dec.get("attempts"),
                "changes": sorted(({"skill": k, "name": sk[k]["name"], "before": a_, "after": b_}
                                   for k, (a_, b_) in p["mastery_changes"].items() if k in sk),
                                  key=lambda x: -abs(x["after"] - x["before"]))[:4],
            })
        out["problems"].append(e)
    return out


# ---------------------------------------------------------------------------
# her book: the pages made for this child, in order, each followed by her checked work

def _reports_by_packet() -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = collections.defaultdict(list)
    if paths.OUT.exists():
        for f in sorted(paths.OUT.glob("report-*.json"), key=lambda p: p.stat().st_mtime):
            rep = json.loads(f.read_text(encoding="utf-8"))
            if rep.get("packet"):
                out[rep["packet"]].append(rep)
    return out


def _page_count(pdf: str | None) -> int:
    if not pdf or not Path(pdf).exists():
        return 0
    import pymupdf

    with pymupdf.open(pdf) as doc:
        return doc.page_count


def now_state(a: accounts.Accounts, fam: dict, lr: dict, d: LearnerDB) -> dict:
    """The one thing a grown-up might do right now, and what just happened."""
    lid = lr["id"]
    act = flow.activity(lid)
    opens = [p for p in d.packets() if p["status"] == "open"]
    if opens and not opens[-1]["pdf"]:  # created, still being set: not ready to print yet
        act = act or {"kind": "making", "stage": "Setting the pages", "at": time.time()}
        opens = opens[:-1]
    last_done = next((p for p in reversed(d.packets()) if p["status"] != "open"
                      and flow.summary_of(d, p["id"])["checked"]), None)
    out = {"activity": act, "access": a.has_access(fam), "photos_ready": transcriber_ready()}
    if opens:
        o = opens[-1]
        out["open"] = {"packet": o["id"], "kind": o["kind"], "pdf": f"/l/{lid}/packets/{o['id']}.pdf",
                       "key": f"/l/{lid}/packets/{o['id']}-key.pdf", "summary": flow.summary_of(d, o["id"]),
                       "scan": flow.scan_url(a, base_url(), lid, o["id"]), "about": flow.describe(o["kind"]),
                       "note": flow.teaching_note(d, o["id"], lr["name"])}
    if last_done:
        out["last"] = flow.summary_of(d, last_done["id"]) | {"kind": last_done["kind"]}
    return out


@app.get("/api/l/{lid}/mybook")
def mybook(lid: str, request: Request):
    """Her book's leaves: a cover, then for each set of pages its printed pages and, after them, her
    work as it came back with notes in the margins. 'today' is the leaf the book opens at."""
    a, fam, lr = require_learner(request, lid)
    d = db()
    reps = _reports_by_packet()
    leaves = [{"t": "cover"}]
    today = None
    place = flow.placement()
    for p in d.packets():
        if place and p["kind"] in ("lesson", "refresh") and not any(x["t"] == "placement" for x in leaves):
            leaves.append({"t": "placement", "at": place["date"], **place})  # before the first lesson
        n = _page_count(p["pdf"])
        first = len(leaves)
        for i in range(1, n + 1):
            leaves.append({"t": "img", "src": f"/l/{lid}/packets/{p['id']}/page/{i}.webp", "packet": p["id"],
                           "kind": p["kind"], "n": i, "at": p["created"]})
        where = pipeline.problem_positions(p["pdf"]) if reps.get(p["id"]) else {}
        for rep in reps.get(p["id"], []):
            pub = public_report(rep)
            if rep.get("photo"):
                pub["photo_url"] = f"/l/{lid}/photos/{rep['photo']}"
            graded = [x for x in pub["problems"] if x.get("status") == "graded"]
            if not graded:
                continue  # a photo with nothing new on it leaves no page in the book
            sheets = collections.Counter(where[x["number"]]["page"] for x in graded if x["number"] in where)
            seen_at = {tp["number"]: tp.get("position") for tp in (rep.get("transcript") or {}).get("problems", [])}
            photo_dims = _photo_dims(rep.get("photo")) if rep.get("photo") else None
            if photo_dims and graded and all(seen_at.get(x["number"]) for x in graded):
                # the child's own page, marked where each problem is in the photo
                if (len(leaves) + 1) % 2:
                    leaves.append({"t": "blank"})
                leaves.append({"t": "marked", "packet": p["id"], "src": pub["photo_url"], "photo": True,
                               "aspect": photo_dims[0] / photo_dims[1],
                               "marks": [{"n": x["number"], "x": seen_at[x["number"]]["x"], "y": seen_at[x["number"]]["y"],
                                          "v": "skip" if x.get("skipped") else ("yes" if x.get("correct") else "no")}
                                         for x in graded]})
            elif sheets:
                # the sheet as printed, marked in the margin beside each problem, then the notes facing it
                sheet = sheets.most_common(1)[0][0]
                marks = [{"n": x["number"], "y": where[x["number"]]["y"],
                          "v": "skip" if x.get("skipped") else ("yes" if x.get("correct") else "no")}
                         for x in graded if where.get(x["number"], {}).get("page") == sheet]
                if (len(leaves) + 1) % 2:  # the marked sheet on a left-hand page, its notes facing it
                    leaves.append({"t": "blank"})
                leaves.append({"t": "marked", "packet": p["id"], "src": f"/l/{lid}/packets/{p['id']}/page/{sheet}.webp",
                               "marks": marks})
            leaves.append({"t": "returned", "packet": p["id"], "report": pub, "at": rep.get("at") or ""})
        if p["status"] == "open" and n:
            today = first
    # a chapter finished: a page of its own, in the book where it happened, with a certificate to print
    for m in flow.milestones(d):
        after = max((i for i, x in enumerate(leaves) if (x.get("at") or "")[:10] and (x.get("at") or "")[:10] <= m["date"]
                     and x["t"] in ("returned", "marked", "img")), default=len(leaves) - 1)
        leaves.insert(after + 1, {"t": "milestone", "at": m["date"], **m,
                                  "certificate": f"/l/{lid}/certificate/{m['index']}.pdf"})
        if today is not None and today > after:
            today += 1
    now = now_state(a, fam, lr, d)  # once, so the book and the note above it agree
    making = now["activity"]
    if making and making["kind"] == "making":
        leaves.append({"t": "making", "stage": making["stage"]})
        today = len(leaves) - 1
    if today is None:
        today = len(leaves) - 1
    return {"name": lr["name"], "course": course_info(lr["course"]), "leaves": leaves, "today": today, "now": now}


def _photo_dims(name: str) -> tuple[int, int] | None:
    """Width and height of a work photo as the book shows it (upright), from its cached JPEG."""
    cache = paths.OUT / "photos" / (Path(name).stem + ".jpg")
    if not cache.exists():
        src = next((d_ / name for d_ in (paths.PROCESSED, paths.INBOX) if (d_ / name).exists()), None)
        if src is None:
            return None
        try:
            _, raw = transcribe.prepare_image(src)
        except transcribe.UnreadableImage:
            return None
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_bytes(raw)
    from PIL import Image

    with Image.open(cache) as im:
        return im.size


@app.get("/l/{lid}/certificate/{i}.pdf")
def certificate(lid: str, i: int, request: Request):
    """A chapter finished: a certificate to print, with the child's name and the skills learned."""
    _, _, lr = require_learner(request, lid)
    ms = flow.milestones(db())
    if not 0 <= i < len(ms):
        raise HTTPException(404)
    m = ms[i]
    day = dt.date.fromisoformat(m["date"])
    esc = packets.render.esc
    src = (packets.render.TEMPLATE_IMPORT +
           '#set page(paper: "us-letter", flipped: true, margin: 0.6in)\n#set text(font: ("Libertinus Serif",))\n'
           '#rect(width: 100%, height: 100%, stroke: 2.5pt + spot, inset: 0.35in, radius: 4pt)[#rect(width: 100%, height: 100%, '
           'stroke: 0.6pt + spot, inset: 0.4in)[#align(center)[\n'
           '#text(font: sans, size: 11pt, weight: "bold", fill: spot, tracking: 0.3em)[MARGINALIA] \\ #v(0.25in)\n'
           '#text(size: 16pt, style: "italic")[This is to say that] \\ #v(0.1in)\n'
           f'#text(size: 44pt, weight: "bold")[#"{esc(lr["name"])}"] \\ #v(0.05in)\n'
           '#text(size: 16pt, style: "italic")[has learned everything in] \\ #v(0.08in)\n'
           f'#text(font: sans, size: 28pt, weight: "bold", fill: spot)[#"{esc(m["chapter"])}"] \\ #v(0.18in)\n'
           f'#block(width: 80%)[#set text(size: 10.5pt, fill: luma(60)); #set par(justify: false); #"{esc("; ".join(m["skills"]))}"]\n'
           f'#v(1fr)\n#text(size: 13pt)[#"{day.strftime("%B")} {day.day}, {day.year}"] #h(1fr) #box(rotate(45deg, rect(width: 9pt, height: 9pt, fill: spot, stroke: none)))\n'
           ']]]\n')
    out = paths.OUT / f"certificate-{i}.pdf"
    packets.render.compile_typst(src, out)
    return FileResponse(out, media_type="application/pdf", filename=f"{lr['name']}-{m['chapter']}.pdf".replace(" ", "-"),
                        content_disposition_type="inline")


@app.get("/l/{lid}/packets/{pid}/page/{n}.webp")
def packet_page(lid: str, pid: str, n: int, request: Request):
    require_learner(request, lid)
    if not re.fullmatch(r"[DLR]\d+", pid):
        raise HTTPException(404)
    pdf = paths.OUT / f"{pid}.pdf"
    if not pdf.exists():
        raise HTTPException(404)
    cache = paths.OUT / "pages" / f"{pid}-{n}.webp"
    if not cache.exists() or cache.stat().st_mtime < pdf.stat().st_mtime:
        import pymupdf
        from PIL import Image

        with pymupdf.open(pdf) as doc:
            if not 1 <= n <= doc.page_count:
                raise HTTPException(404)
            pix = doc[n - 1].get_pixmap(dpi=150)
        cache.parent.mkdir(parents=True, exist_ok=True)
        Image.frombytes("RGB", (pix.width, pix.height), pix.samples).save(cache, "WEBP", quality=84)
    return FileResponse(cache, media_type="image/webp", headers={"Cache-Control": "private, max-age=300"})


@app.get("/l/{lid}/photos/{name}")
def work_photo(lid: str, name: str, request: Request):
    """A photo of her work, as sent in (turned upright, any phone format), for her returned pages."""
    require_learner(request, lid)
    if "/" in name or name.startswith("."):
        raise HTTPException(404)
    src = next((d_ / name for d_ in (paths.PROCESSED, paths.INBOX) if (d_ / name).exists()), None)
    if src is None:
        raise HTTPException(404)
    cache = paths.OUT / "photos" / (Path(name).stem + ".jpg")
    if not cache.exists():
        _, raw = transcribe.prepare_image(src)
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_bytes(raw)
    return FileResponse(cache, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=86400"})


@app.get("/api/l/{lid}/reports")
def reports(lid: str, request: Request):
    require_learner(request, lid)
    if not paths.OUT.exists():
        return []
    files = sorted(paths.OUT.glob("report-*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    return [public_report(json.loads(f.read_text(encoding="utf-8"))) for f in files[:12]]


@app.post("/api/l/{lid}/ask")
async def ask(lid: str, request: Request):
    from starlette.concurrency import run_in_threadpool

    a, fam, lr = require_learner(request, lid)
    require_access(a, fam)
    body = await request.json()
    prid, question = str(body.get("problem_id", "")), str(body.get("question", "")).strip()
    line = body.get("line")
    if not question or len(question) > 1000:
        raise HTTPException(400, "Ask a question (up to 1000 characters).")
    if not body.get("dry_run"):
        _limit(a, lid, "questions")

    def run():
        paths.set_scope(accounts.learner_dir(lid), lr["course"])
        return _ask(prid, question, int(line) if line else None, not body.get("dry_run"))

    return await run_in_threadpool(run)


def _ask(prid: str, question: str, line: int | None, store: bool) -> dict:
    from . import tutor

    d = db()
    prob, att = d.problem(prid), d.attempt(prid)
    if prob is None or att is None:
        raise HTTPException(404, "That problem hasn't been checked yet.")
    prob = prob | {"id": prid}
    try:
        result = tutor.ask(prob, att, question, line, log=d.log_jev)
    except Exception as e:  # noqa: BLE001 - show the reason on the page
        raise HTTPException(502, f"The margin notes are unavailable right now ({type(e).__name__}).") from e
    if store:
        d.add_question(prid, line, question, result)
    return {"status": result["status"], "reply": result["reply"], "canonical": result.get("canonical"),
            "cites": result.get("cites", []), "rejected": result.get("rejected")}


@app.get("/api/l/{lid}/questions/{prid}")
def questions(lid: str, prid: str, request: Request):
    require_learner(request, lid)
    return [{"question": q["question"], "line": q["line"], "reply": q["reply"], "status": q["status"],
             "canonical": q["detail"].get("canonical"), "at": q["at"]} for q in db().questions(prid)]


@app.post("/api/l/{lid}/packets/{pid}/set-aside")
def set_aside(lid: str, pid: str, request: Request):
    require_learner(request, lid)
    d = db()
    pk = d.packet(pid)
    if pk is None:
        raise HTTPException(404, "No such packet.")
    if pk["status"] != "open":
        raise HTTPException(409, "Only open packets can be set aside.")
    with d.tx() as c:
        c.execute("UPDATE packets SET status='set_aside' WHERE id=?", (pid,))
    return {"packet": pid, "status": "set_aside"}


@app.post("/api/l/{lid}/problems/{prid}/recheck")
def recheck(lid: str, prid: str, request: Request):
    require_learner(request, lid)
    try:
        return db().recheck(prid)
    except KeyError as e:
        raise HTTPException(404, "That problem hasn't been checked yet.") from e


@app.get("/api/l/{lid}/progress")
def progress(lid: str, request: Request):
    _, _, lr = require_learner(request, lid)
    d = db()
    sk = extract.skills()
    rows = {r["id"]: r for r in d.skill_rows()}
    done = d.mastered_set()
    groups = collections.OrderedDict()
    names = skill_groups()
    for s in extract.skill_order():
        k = sk[s]
        r = rows[s]
        state_ = ("mastered" if s in done else "practicing" if r["n_obs"]
                  else "assessed" if r["source"] == "diagnostic" else "not started")
        groups.setdefault(names[s], []).append({"id": s, "name": k["name"], "p": round(r["p_mastery"], 3), "state": state_})
    attempts = d.attempts()
    days = collections.OrderedDict()
    today = dt.datetime.now(dt.timezone.utc).date()
    for i in range(13, -1, -1):
        days[(today - dt.timedelta(days=i)).isoformat()] = {"problems": 0, "correct": 0, "pages": set()}
    for x in attempts:
        day = x["graded_at"][:10]
        if day in days:
            days[day]["problems"] += 1
            days[day]["correct"] += int(x["correct"])
            if x.get("photo"):
                days[day]["pages"].add(x["photo"])
    mis_by_id = {m["id"]: m for lst in extract.misconceptions().values() for m in lst}
    counts = collections.Counter()
    for x in attempts:
        m = ((x["evidence"] or {}).get("decision") or {}).get("misconception")
        if m in mis_by_id:
            counts[m] += 1
    summ = diagnostic.summary(d)
    return {
        "learner": {"name": lr["name"]}, "course": course_info(lr["course"]),
        "mastered": len(done), "total": len(sk),
        "problems": len(attempts), "correct": sum(int(x["correct"]) for x in attempts),
        "questions": len(d.questions()),
        "diagnostic": {"answered": summ["answered"], "asked": summ["asked"]},
        "groups": [{"name": g, "skills": v, "mastered": sum(x["state"] == "mastered" for x in v)} for g, v in groups.items()],
        "days": [{"day": k, "problems": v["problems"], "correct": v["correct"], "pages": len(v["pages"])} for k, v in days.items()],
        "misconceptions": [{"count": c, "description": mis_by_id[m]["description"],
                            "root": sk[mis_by_id[m]["root_skill"]]["name"]} for m, c in counts.most_common(5)],
        "next": [sk[s]["name"] for s in d.frontier()[:3]],
        "reviews": [sk[s]["name"] for s in d.due_reviews()],
        "generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes"),
    }


# ---------------------------------------------------------------------------
# homeschool records (records.py): kept from the checked work, nothing logged by hand

@app.get("/learn/{lid}/records", response_class=HTMLResponse)
def records_page(lid: str, request: Request):
    if not signed_in(request):
        return RedirectResponse("/signin", status_code=303)
    return page("records.html")


@app.get("/api/l/{lid}/records")
def records_api(lid: str, request: Request):
    _, _, lr = require_learner(request, lid)
    r = records.build(db(), lr["name"], skill_groups())
    for s_ in r["samples"]:
        s_["photo_url"] = f"/l/{lid}/photos/{s_['photo']}"
    return r


@app.get("/l/{lid}/records.csv")
def records_csv(lid: str, request: Request):
    _, _, lr = require_learner(request, lid)
    r = records.build(db(), lr["name"], skill_groups())
    fname = re.sub(r"[^A-Za-z0-9]+", "-", f"{lr['name']} mathematics log {r['year']}").strip("-") + ".csv"
    return Response(records.csv_log(r), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{fname}"'})


@app.get("/l/{lid}/records.pdf")
def records_pdf(lid: str, request: Request):
    _, _, lr = require_learner(request, lid)
    r = records.build(db(), lr["name"], skill_groups())
    out = paths.OUT / "records.pdf"
    records.portfolio_pdf(r, out)
    fname = re.sub(r"[^A-Za-z0-9]+", "-", f"{lr['name']} mathematics record {r['year']}").strip("-") + ".pdf"
    return FileResponse(out, media_type="application/pdf", filename=fname, content_disposition_type="inline")


# ---------------------------------------------------------------------------
# weekly notes to parents

def week_summary(a: accounts.Accounts, fam: dict) -> list[dict]:
    """This week, per learner: problems checked, correct, skills learned, what's next, a repeated mistake."""
    cutoff = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=7)).isoformat()
    out = []
    for lr in a.learners(fam["id"]):
        with paths.use_learner(accounts.learner_dir(lr["id"]), lr["course"]):
            d = db()
            sk = extract.skills()
            week = [x for x in d.attempts() if x["graded_at"] >= cutoff]
            mis = collections.Counter(((x["evidence"] or {}).get("decision") or {}).get("misconception") for x in week)
            by_id = {m["id"]: m for lst in extract.misconceptions().values() for m in lst}
            rep = next((by_id[m]["description"] for m, c in mis.most_common() if m in by_id and c > 1), None)
            front = d.frontier()
            groups = records.skill_groups()
            learned = records.learned_dates(d)
            new_skills = [sk[s_]["name"] for s_, v in learned.items() if v["how"] == "learned" and v["date"] >= cutoff[:10]]
            days = len({x["graded_at"][:10] for x in week})
            out.append({"name": lr["name"], "course": course_info(lr["course"])["title"],
                        "problems_week": len(week), "correct_week": sum(int(x["correct"]) for x in week),
                        "mastered": len(d.mastered_set()), "total": len(sk), "days_week": days,
                        "new_skills": new_skills, "pace": records.pace(d, groups, learned).get("message"),
                        "records": f"{base_url()}/learn/{lr['id']}/records",
                        "next": sk[front[0]]["name"] if front else None, "mistake": rep})
    return out


def send_weekly(a: accounts.Accounts, force: bool = False) -> int:
    sent = 0
    now_ = dt.datetime.now(dt.timezone.utc)
    for fam in a.families():
        if not fam or not fam.get("weekly"):
            continue
        last = fam.get("last_weekly")
        if not force and last and dt.datetime.fromisoformat(last) > now_ - dt.timedelta(days=7):
            continue
        summary = week_summary(a, fam)
        if not any(x["problems_week"] for x in summary):
            continue  # nothing happened this week: no email
        mailer.weekly(fam["email"], fam.get("name") or "", summary, base_url())
        a.update_family(fam["id"], last_weekly=now_.isoformat(timespec="seconds"))
        sent += 1
    return sent


def weekly_loop() -> None:
    time.sleep(120)
    while True:
        try:
            send_weekly(acc())
        except Exception as e:  # noqa: BLE001 - never stop the loop
            print(f"weekly notes: {e}")
        time.sleep(3600)


# ---------------------------------------------------------------------------

def startup() -> None:
    from . import assets

    paths.ensure_dirs()
    paths.LEARNERS.mkdir(parents=True, exist_ok=True)
    if os.environ.get("ADAPTCALC_BIND_BOOKS", "1") == "1":
        volume.bind_all_async()  # in the background; readers see "being bound" until each is ready
    a = acc()
    fid = accounts.adopt_legacy(a)
    if fid:
        print(f"adopted the single-learner data into the owner account ({os.environ.get('ADAPTCALC_OWNER_EMAIL')})")
    if billing.enabled():
        try:
            print("billing:", billing.ensure_setup(a, base_url()))
        except billing.BillingError as e:
            print(f"billing setup failed: {e}")
    if os.environ.get("ADAPTCALC_WEEKLY", "1") == "1":
        in_background(weekly_loop)
    assets.ensure_fonts()
    try:
        assets.ensure_web_assets()
    except Exception as e:  # noqa: BLE001 - pages fall back to system fonts and plain math
        print(f"web assets unavailable: {e}")


def serve(host: str = "127.0.0.1", port: int = 8000) -> None:
    import uvicorn

    startup()
    uvicorn.run(app, host=host, port=port, proxy_headers=True, forwarded_allow_ips="*")

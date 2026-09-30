"""Browser front end: `python -m adaptcalc serve`.

One page (adaptcalc/static/index.html) over a small JSON API. Everything the
page does is a thin wrapper around the same modules the CLI uses:

  GET  /api/state             mastery, diagnostic progress, packets, frontier
  POST /api/diagnostic/next   choose + render the next diagnostic round
  POST /api/lesson/next       build the next lesson packet
  POST /api/photos            upload a photo of work -> transcribe, check, update
  GET  /api/reports           graded photos, newest first
  GET  /packets/{name}.pdf    packet and key PDFs

Set ADAPTCALC_PASSWORD to require HTTP basic auth (any user name).
"""
from __future__ import annotations

import base64
import json
import os
import re
import secrets
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response

from . import diagnostic, extract, packets, paths, pipeline, transcribe
from .learner import LearnerDB, config

STATIC = Path(__file__).resolve().parent / "static"
app = FastAPI(title="Adaptive calculus", docs_url=None, redoc_url=None)


@app.middleware("http")
async def password(request: Request, call_next):
    pw = os.environ.get("ADAPTCALC_PASSWORD")
    if pw and request.url.path != "/health":
        auth = request.headers.get("authorization", "")
        ok = False
        if auth.startswith("Basic "):
            try:
                _, _, given = base64.b64decode(auth[6:]).decode().partition(":")
                ok = secrets.compare_digest(given, pw)
            except Exception:  # noqa: BLE001
                ok = False
        if not ok:
            return Response(status_code=401, headers={"WWW-Authenticate": 'Basic realm="calculus"'})
    return await call_next(request)


def db() -> LearnerDB:
    return LearnerDB()  # one connection per request (SQLite connections are per thread)


def transcriber_name() -> str:
    t = transcribe.default_transcriber()
    return "Claude vision" if t.backend == "claude-vision" else "manual transcript (no Anthropic key set)"


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/", response_class=HTMLResponse)
def index():
    return (STATIC / "index.html").read_text(encoding="utf-8")


@app.get("/fonts/{name}")
def font(name: str):
    p = paths.FONT_DIR / name
    if not re.fullmatch(r"FiraSans-\w+\.ttf", name) or not p.exists():
        raise HTTPException(404)
    return FileResponse(p, media_type="font/ttf")


@app.get("/api/state")
def state():
    d = db()
    sk = extract.skills()
    rows = {r["id"]: r for r in d.skill_rows()}
    thr = config()["learner"]["mastery_threshold"]
    skills = [{"id": s, "name": sk[s]["name"], "section": sk[s]["section"] or "found.",
               "group": "basics" if s.startswith("pre_") else (sk[s]["section"] or "found."),
               "kind": sk[s]["kind"], "p": round(rows[s]["p_mastery"], 3), "source": rows[s]["source"],
               "next_review": rows[s]["next_review"], "mastered": rows[s]["p_mastery"] >= thr}
              for s in extract.skill_order()]
    summ = diagnostic.summary(d)
    cfg = config()["diagnostic"]
    rounds = d.packets("diagnostic")
    open_round = any(r["status"] == "open" for r in rounds)
    finished = False
    if not open_round:
        try:
            finished = diagnostic.next_round(d) is None if summ["asked"] >= cfg["min_questions"] else False
        except RuntimeError:
            finished = False
    pk = []
    for p in reversed(d.packets()):
        probs = d.problems(p["id"])
        graded = sum(1 for q in probs if d.is_graded(q["id"]))
        pk.append({"id": p["id"], "kind": p["kind"], "status": p["status"], "created": p["created"],
                   "problems": len(probs), "graded": graded,
                   "pdf": f"/packets/{p['id']}.pdf" if p["pdf"] else None,
                   "key": f"/packets/{p['id']}-key.pdf" if p["pdf"] else None,
                   "meta": json.loads(p["meta"] or "{}") if p["kind"] == "lesson" else {}})
    return {"skills": skills, "threshold": thr,
            "diagnostic": {"asked": summ["asked"], "answered": summ["answered"],
                           "uncertainty_bits": round(summ["entropy"]["sum_marginal_bits"], 2),
                           "min": cfg["min_questions"], "max": cfg["max_questions"],
                           "open_round": open_round, "finished": finished},
            "packets": pk, "frontier": d.frontier(), "reviews": d.due_reviews(),
            "transcriber": transcriber_name(), "jev": bool(os.environ.get("TYPESAFE_API_KEY"))}


@app.post("/api/diagnostic/next")
def diagnostic_next():
    d = db()
    try:
        pid = diagnostic.create_round(d)
    except RuntimeError as e:
        raise HTTPException(409, str(e)) from e
    if pid is None:
        return {"finished": True}
    packets.render_diagnostic(d, pid)
    return {"packet": pid, "pdf": f"/packets/{pid}.pdf"}


@app.post("/api/lesson/next")
def lesson_next():
    d = db()
    use_jev = bool(os.environ.get("TYPESAFE_API_KEY"))
    r = packets.next_lesson(d, log=d.log_jev, use_jev=use_jev)
    return {"packet": r["pid"], "pdf": f"/packets/{r['pid']}.pdf", "focus": r["focus"], "kind": r["kind"],
            "accepted": sum(1 for x in r["decisions"] if x["accepted"]), "snippets": len(r["decisions"]),
            "verbatim_ok": r["audit"]["ok"]}


@app.get("/packets/{name}.pdf")
def packet_pdf(name: str):
    if not re.fullmatch(r"[DLR]\d+(-key)?", name):
        raise HTTPException(404)
    p = paths.OUT / f"{name}.pdf"
    if not p.exists():
        raise HTTPException(404)
    return FileResponse(p, media_type="application/pdf", filename=p.name,
                        content_disposition_type="inline")


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
    dest.write_bytes(f.file.read())
    return dest


@app.post("/api/photos")
def upload_photo(photo: UploadFile = File(...)):
    if not os.environ.get("TYPESAFE_API_KEY"):
        raise HTTPException(503, "TYPESAFE_API_KEY is not set, so the evidence step cannot run")
    d = db()
    dest = _save_upload(photo)
    try:
        rep = pipeline.process_photo(d, dest)
    except transcribe.UnreadableImage as e:
        raise HTTPException(415, f"{e}. Try exporting the photo as JPEG.") from e
    except transcribe.PendingTranscription:
        return JSONResponse({"pending": True, "photo": dest.name,
                             "message": "Saved. No Anthropic key is set, so this photo waits in the inbox for a "
                                        "manual transcript."}, status_code=202)
    except Exception as e:  # noqa: BLE001 - show the reason on the page instead of a bare 500
        raise HTTPException(502, f"Grading failed ({type(e).__name__}: {str(e)[:300]}). "
                                 "The photo is saved; try again in a minute.") from e
    return _public_report(rep)


def _public_report(rep: dict) -> dict:
    mis = {m["id"]: m["description"] for lst in extract.misconceptions().values() for m in lst}
    sk = extract.skills()
    out = {"photo": rep.get("photo"), "packet": rep.get("packet"), "transcriber": rep.get("transcriber"),
           "at": rep.get("at"), "error": rep.get("error"), "problems": []}
    lines_by_num = {p["number"]: p.get("lines", []) for p in (rep.get("transcript") or {}).get("problems", [])}
    for p in rep.get("problems", []):
        e = {"number": p["number"], "status": p.get("status"), "problem_id": p.get("problem_id")}
        if p.get("status") == "graded":
            d, c = p["decision"], p["stepcheck"]
            status_by_line = {x["line"]: x for x in c["lines"]}
            e.update({
                "correct": p["correct"], "credit": p["credit"], "skipped": c["skipped"],
                "final_answer": c["final_answer"], "final_note": c["final_note"],
                "lines": [{"text": ln.get("text", ""), "crossed_out": ln.get("crossed_out"), "boxed": ln.get("boxed"),
                           "status": status_by_line.get(i, {}).get("status"), "note": status_by_line.get(i, {}).get("note", "")}
                          for i, ln in enumerate(lines_by_num.get(p["number"], []), 1)],
                "misconception": d.get("misconception"),
                "misconception_text": mis.get(d.get("misconception") or ""),
                "attempts": d.get("attempts"), "strategy": d.get("strategy"),
                "substeps": d.get("substeps", {}),
                "changes": sorted(({"skill": k, "name": sk[k]["name"], "before": a, "after": b}
                                   for k, (a, b) in p["mastery_changes"].items()),
                                  key=lambda x: -abs(x["after"] - x["before"]))[:6],
            })
        out["problems"].append(e)
    return out


@app.post("/api/ask")
async def ask(request: Request):
    body = await request.json()
    prid, question = str(body.get("problem_id", "")), str(body.get("question", "")).strip()
    line = body.get("line")
    if not question or len(question) > 1000:
        raise HTTPException(400, "Ask a question (up to 1000 characters).")
    from starlette.concurrency import run_in_threadpool

    return await run_in_threadpool(_ask, prid, question, int(line) if line else None, not body.get("dry_run"))


def _ask(prid: str, question: str, line: int | None, store: bool) -> dict:
    from . import tutor

    d = db()
    prob, att = d.problem(prid), d.attempt(prid)
    if prob is None or att is None:
        raise HTTPException(404, "That problem hasn't been graded yet.")
    prob = prob | {"id": prid}
    try:
        result = tutor.ask(prob, att, question, line, log=d.log_jev)
    except Exception as e:  # noqa: BLE001 - show the reason on the page
        raise HTTPException(502, f"The tutor is unavailable right now ({type(e).__name__}: {str(e)[:200]}).") from e
    if store:
        d.add_question(prid, line, question, result)
    return {"status": result["status"], "reply": result["reply"], "canonical": result.get("canonical"),
            "cites": result.get("cites", [])}


@app.get("/api/questions/{prid}")
def questions(prid: str):
    return [{"question": q["question"], "line": q["line"], "reply": q["reply"], "status": q["status"],
             "canonical": q["detail"].get("canonical"), "at": q["at"]} for q in db().questions(prid)]


@app.post("/api/packets/{pid}/set-aside")
def set_aside(pid: str):
    d = db()
    pk = d.packet(pid)
    if pk is None:
        raise HTTPException(404, "No such packet.")
    if pk["status"] != "open":
        raise HTTPException(409, "Only open packets can be set aside.")
    with d.tx() as c:
        c.execute("UPDATE packets SET status='set_aside' WHERE id=?", (pid,))
    return {"packet": pid, "status": "set_aside"}


@app.get("/progress", response_class=HTMLResponse)
def progress_page():
    return (STATIC / "progress.html").read_text(encoding="utf-8")


@app.get("/api/progress")
def progress():
    import collections
    import datetime as dt

    d = db()
    sk = extract.skills()
    thr = config()["learner"]["mastery_threshold"]
    rows = {r["id"]: r for r in d.skill_rows()}
    groups = collections.OrderedDict()
    for s in extract.skill_order():
        k = sk[s]
        g = ("Prealgebra & algebra basics" if s.startswith("pre_") else
             "Algebra & trig for calculus" if k["kind"] == "foundation" else f"Calculus {k['section']}")
        p = rows[s]["p_mastery"]
        state = ("mastered" if p >= thr else "practicing" if rows[s]["n_obs"]
                 else "assessed" if rows[s]["source"] == "diagnostic" else "not started")
        groups.setdefault(g, []).append({"id": s, "name": k["name"], "p": round(p, 3), "state": state,
                                         "next_review": rows[s]["next_review"]})
    attempts = d.attempts()
    days = collections.OrderedDict()
    today = dt.datetime.now(dt.timezone.utc).date()
    for i in range(13, -1, -1):
        days[(today - dt.timedelta(days=i)).isoformat()] = {"problems": 0, "correct": 0, "pages": set()}
    for a in attempts:
        day = a["graded_at"][:10]
        if day in days:
            days[day]["problems"] += 1
            days[day]["correct"] += int(a["correct"])
            if a.get("photo"):
                days[day]["pages"].add(a["photo"])
    mis_by_id = {m["id"]: m for lst in extract.misconceptions().values() for m in lst}
    counts = collections.Counter()
    for a in attempts:
        m = ((a["evidence"] or {}).get("decision") or {}).get("misconception")
        if m in mis_by_id:
            counts[m] += 1
    summ = diagnostic.summary(d)
    total = len(sk)
    mastered = sum(1 for g in groups.values() for x in g if x["state"] == "mastered")
    return {
        "mastered": mastered, "total": total,
        "problems": len(attempts), "correct": sum(int(a["correct"]) for a in attempts),
        "questions": len(d.questions()),
        "diagnostic": {"answered": summ["answered"], "asked": summ["asked"],
                       "uncertainty_bits": round(summ["entropy"]["sum_marginal_bits"], 1)},
        "groups": [{"name": g, "skills": v, "mastered": sum(x["state"] == "mastered" for x in v)} for g, v in groups.items()],
        "days": [{"day": k, "problems": v["problems"], "correct": v["correct"], "pages": len(v["pages"])} for k, v in days.items()],
        "misconceptions": [{"id": m, "count": c, "description": mis_by_id[m]["description"],
                            "root": sk[mis_by_id[m]["root_skill"]]["name"]} for m, c in counts.most_common(5)],
        "next": [sk[s]["name"] for s in d.frontier()[:4]],
        "reviews": [sk[s]["name"] for s in d.due_reviews()],
    }


@app.get("/api/reports")
def reports():
    files = sorted(paths.OUT.glob("report-*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    return [_public_report(json.loads(f.read_text(encoding="utf-8"))) for f in files[:20]]


def serve(host: str = "127.0.0.1", port: int = 8000) -> None:
    import uvicorn

    paths.ensure_dirs()
    if not paths.SKILLS_JSON.exists():
        extract.build()
    uvicorn.run(app, host=host, port=port)

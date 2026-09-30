""""Ask about this": a tutor reply about one graded problem, checked before it is shown.

The reply is grounded in three things only: the learner's transcribed work, what
SymPy found in it, and the textbook passages for the skill (and for the
misconception's root skill). Claude writes the reply; before it is shown:

  1. every equation it asserts is carried as a SymPy claim and re-checked,
  2. its math may only use notation the book has introduced for this problem,
  3. Jev judges whether it gives away the final answer (unless the learner asked
     for it) and whether it brings in an idea the passages don't contain.

A reply that fails is regenerated once with the failures listed; if it fails
again, the learner gets the canonical fallback: the book's worked example for
this skill, verbatim, and a pointer to the line to compare.
"""
from __future__ import annotations

import json
import re

import sympy as sp

from . import answers, cnxml, extract, notation, stepcheck
from .jev import Jev, noul, spec

MODEL = "claude-opus-5-5"

SYSTEM = """You are a patient math tutor helping an adult relearn math from a textbook. The learner writes their work on paper; you see a transcription of it, one line per step, plus an exact SymPy check of every step.

How to answer:
- Answer the learner's question about their own work. Be brief: 2 to 6 sentences.
- Guide; don't solve. Point to the exact line and the idea it needs, ask one question that leads to the next step, or show the method on a different number than the problem uses. Do not state the final answer unless the learner explicitly asks for it.
- Use only ideas and notation that appear in the textbook passages provided. Refer to the book's own worked example by its label (e.g. "Example 6") when it helps.
- Write math in LaTeX between $...$.
- Every equation you state in the reply must also appear in `claims` as SymPy expressions (lhs, rhs) that are exactly equal. Use SymPy syntax: ** for powers, sqrt(), Limit(expr, x, a) for limits. If you point out a false equation the learner wrote, don't list it as a claim; describe it in words instead."""

SCHEMA = {
    "type": "object",
    "properties": {
        "reply": {"type": "string"},
        "claims": {"type": "array", "items": {
            "type": "object",
            "properties": {"lhs": {"type": "string"}, "rhs": {"type": "string"}},
            "required": ["lhs", "rhs"], "additionalProperties": False}},
        "cites": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["reply", "claims", "cites"],
    "additionalProperties": False,
}

LATEX_TO_TYP = [(r"\\lim", " lim "), (r"\\to\b|\\rightarrow", " -> "), (r"\\infty", " infinity "),
                (r"\\varepsilon|\\epsilon", " epsilon "), (r"\\delta", " delta "), (r"\\frac", " frac( "),
                (r"\\sqrt", " sqrt( "), (r"\\int", " integral "), (r"\\sum", " sum "), (r"\\left\||\\right\|", " \\| "),
                (r"\\sin|\\cos|\\tan", " sin "), (r"\\pi", " pi "), (r"\\ln", " ln ")]


def latex_features(text: str) -> set[str]:
    """Notation used in the $...$ math of a reply (LaTeX mapped onto the Typst feature detectors)."""
    used = set()
    for m in re.findall(r"\$([^$]+)\$", text):
        t = m
        for rx, rep in LATEX_TO_TYP:
            t = re.sub(rx, rep, t)
        t = re.sub(r"\^\{?\s*([-+])\s*\}?", r"^\1", t)
        used |= notation.features(t)
    return used


def passages(skill: str, root: str | None) -> tuple[list[str], set[str], str | None, list[str]]:
    """Canonical passages for the skill (and the misconception's root skill), the notation they
    allow, and the first worked example (for the fallback)."""
    sk = extract.skills()
    texts, allowed, fallback, labels = [], set(), None, []
    for sid in dict.fromkeys([skill] + ([root] if root else [])):
        s = sk[sid]
        if s["kind"] == "chapter":
            allowed |= notation.introduced_by(notation.end_of_section(s["section"]))
        else:
            allowed |= notation.BASELINE_FOUNDATION
        for a in s["anchors"]:
            if a["type"] not in ("example", "box", "checkpoint"):
                continue
            book = a.get("book", "calc1")
            blk = next((b for m in extract.load_book(book) if m.module_id == a["module"]
                        for b in cnxml.walk(m.blocks) if b.get("id") == a["id"]), None)
            if blk is None:
                continue
            allowed |= notation.features_in_blocks([blk])
            text = " ".join(cnxml.block_plain(blk).split())
            label = a.get("label") or a.get("title") or ""
            texts.append(f"{label}: {text}"[:3000])
            if a["type"] == "example":
                labels.append(label)
                if fallback is None:
                    fallback = f"{label}: {text}"
            if sum(len(t) for t in texts) > 12000:
                break
    return texts, allowed, fallback, labels


def key_text(data: dict) -> str:
    from .pipeline import key_plain

    return key_plain(data["key"]) if data.get("key") else str(data.get("key_display", ""))


def learner_reached_answer(problem: dict, attempt: dict) -> bool:
    """True when the learner's own work already ends at the correct answer (boxed or not)."""
    check = attempt.get("stepcheck") or {}
    if check.get("final_correct"):
        return True
    tp = attempt.get("transcript") or {}
    try:
        return bool(stepcheck.check(tp, problem["data"]["key"])["final_correct"])
    except Exception:  # noqa: BLE001
        return False


def check_claims(claims: list[dict]) -> list[str]:
    bad = []
    for c in claims:
        try:
            lhs, rhs = answers.parse(c["lhs"]), answers.parse(c["rhs"])
            lv, rv = stepcheck._value(lhs), stepcheck._value(rhs)
            ok = lv is not None and rv is not None and (lv == rv if "DNE" in (lv, rv) else answers.equal(lv, rv))
        except (ValueError, TypeError):
            ok = False
        if not ok:
            bad.append(f"{c.get('lhs')} = {c.get('rhs')}")
    return bad


def _context(problem: dict, attempt: dict, question: str, line: int | None, texts: list[str]) -> str:
    data = problem["data"]
    check = attempt.get("stepcheck") or {}
    status = {x["line"]: x for x in check.get("lines", [])}
    work = []
    for i, ln in enumerate((attempt.get("transcript") or {}).get("lines", []), 1):
        st = status.get(i, {})
        flag = " (crossed out)" if ln.get("crossed_out") else (" [boxed]" if ln.get("boxed") else "")
        note = f"  <- SymPy: {st.get('status')}{': ' + st['note'] if st.get('note') else ''}" if st.get("status") in ("invalid", "questionable") else ""
        work.append(f"{i}. {ln.get('text', '')}{flag}{note}")
    decision = (attempt.get("evidence") or {}).get("decision") or {}
    mis = next((m["description"] for lst in extract.misconceptions().values() for m in lst
                if m["id"] == decision.get("misconception")), None)
    return json.dumps({
        "problem": data["plain"],
        "answer_key_do_not_reveal": key_text(data),
        "student_work": work,
        "sympy_check": {"first_invalid_line": check.get("first_invalid_line"),
                        "final_answer": check.get("final_answer"), "final_answer_correct": check.get("final_correct")},
        "likely_misconception": mis,
        "line_asked_about": line,
        "question": question,
        "textbook_passages": texts,
    }, ensure_ascii=False, indent=1)


def _claude(context: str, feedback: str | None, client=None) -> dict:
    import anthropic

    client = client or anthropic.Anthropic()
    content = context if not feedback else context + "\n\nYour previous reply failed these checks; fix them:\n" + feedback
    msg = client.beta.messages.create(
        model=MODEL, max_tokens=16000,
        betas=["server-side-fallback-2026-07-01"], fallbacks="default",
        thinking={"type": "adaptive"},
        output_config={"effort": "medium", "format": {"type": "json_schema", "schema": SCHEMA}},
        system=SYSTEM,
        messages=[{"role": "user", "content": content}],
    )
    if msg.stop_reason == "refusal":
        raise RuntimeError("the tutor model declined this request")
    text = next(b.text for b in msg.content if b.type == "text")
    return json.loads(text)


def _jev_checks(problem: dict, question: str, reply: str, texts: list[str], log=None, client=None,
                reached: bool = False) -> dict:
    t = spec()["tutor"]
    state = {"note": t["state_note"], "problem": problem["data"]["plain"],
             "correct_answer": key_text(problem["data"]), "question": question,
             "reply": reply, "canonical": texts}
    qs = {k: noul(t[k]["instructions"], t[k]["criteria"]) for k in ("gives_away", "asked_for_answer", "new_idea")}
    out = Jev("tutor_gate", log=log, client=client).ask(state, qs)
    a = {k: out["answers"][k]["noul"] for k in qs}
    th = t["thresholds"]
    gives = a["gives_away"] > th["gives_away_max"] and a["asked_for_answer"] <= 0.5 and not reached
    return {"gives_away_p": a["gives_away"], "asked_for_answer_p": a["asked_for_answer"],
            "new_idea_p": a["new_idea"], "gives_away": gives, "new_idea": a["new_idea"] > th["new_idea_max"]}


def ask(problem: dict, attempt: dict, question: str, line: int | None = None,
        claude_client=None, jev_client=None, log=None) -> dict:
    data = problem["data"]
    root = ((attempt.get("evidence") or {}).get("decision") or {}).get("misconception_root")
    texts, allowed, fallback, labels = passages(data["skill"], root)
    allowed |= notation.features(data.get("prompt") or "") | notation.BASELINE
    context = _context(problem, attempt, question, line, texts)
    reached = learner_reached_answer(problem, attempt)
    feedback, history = None, []
    for attempt_no in range(2):
        r = _claude(context, feedback, client=claude_client)
        reply = r["reply"].strip()
        problems = []
        bad = check_claims(r.get("claims", []))
        if bad:
            problems.append("these claims are not equal: " + "; ".join(bad))
        n_eq = len(re.findall(r"\$[^$]*=[^$]*\$", reply))
        if n_eq > len(r.get("claims", [])):
            problems.append("every equation in the reply must be listed in claims")
        extra = latex_features(reply) - allowed
        if extra:
            problems.append(f"notation the book has not introduced here: {sorted(extra)}")
        checks = {"sympy_failures": bad, "notation_extra": sorted(extra)}
        if not problems:
            jc = _jev_checks(problem, question, reply, texts, log=log, client=jev_client, reached=reached)
            checks.update(jc)
            if jc["gives_away"]:
                problems.append("do not state the final answer; leave the last step to the learner")
            if jc["new_idea"]:
                problems.append("use only ideas that appear in the textbook passages")
        history.append({"reply": reply, "claims": r.get("claims", []), "checks": checks, "problems": problems})
        if not problems:
            return {"status": "ok", "reply": reply, "cites": r.get("cites", []), "checks": checks, "tries": attempt_no + 1}
        feedback = "\n".join(f"- {p}" for p in problems)
    where = f" line {line} of your work" if line else " your work"
    return {"status": "fallback",
            "reply": (f"I couldn't write an explanation that passed its checks, so here is the book's own worked "
                      f"example to compare with{where}:"),
            "canonical": fallback, "cites": labels[:1], "checks": history[-1]["checks"], "tries": 2,
            "rejected": [h["problems"] for h in history]}

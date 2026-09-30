""""Ask about this": a tutor reply about one graded problem, checked before it is shown.

The reply is grounded in three things only: the learner's transcribed work, what
SymPy found in it, and the textbook passages for the skill (and for the
misconception's root skill). Claude writes the reply; before it is shown:

  1. every equation it asserts is carried as a SymPy claim and re-checked,
  2. its math may only use notation the book has introduced for this problem,
  3. Jev judges whether it gives away the final answer (unless the learner asked
     for it) and whether it brings in an idea the passages don't contain.

A reply that fails is regenerated with the failures listed (up to three tries);
if every try fails, the learner gets the canonical fallback: the book's worked example for
this skill, verbatim, and a pointer to the line to compare.
"""
from __future__ import annotations

import json
import re

import sympy as sp

from . import answers, cnxml, extract, notation, stepcheck
from .jev import Jev, noul, spec

MODEL = "claude-opus-5-5"
TRIES = 3  # a reply that fails its checks is regenerated with the failures listed, up to this many times

SYSTEM = """You are a patient math tutor helping an adult relearn math from a textbook. The learner writes their work on paper; you see a transcription of it, one line per step, plus an exact SymPy check of every step.

How to answer:
- Answer the learner's question about their own work. Be brief: 2 to 6 sentences.
- Guide; don't solve. Point to the exact line and the idea it needs, ask one question that leads to the next step, or show the method on a different number than the problem uses. Do not state the final answer unless the learner explicitly asks for it, or their own work already reached it.
- Use only ideas and notation that appear in the textbook passages provided. Refer to the book's own worked example by its label (e.g. "Example 6") when it helps.
- Equations: never type an equation (anything with "=") into `reply`. Put each one in `equations` as a chain of equal parts in SymPy syntax, and write [[1]], [[2]], ... in `reply` where equation 1, 2, ... belongs. The server checks every chain with SymPy and typesets it. A chain may start with a label such as f(3) or m. A label followed by a general formula (m = (y_2 - y_1)/(x_2 - x_1)) is fine; a label for a number must show the computation (m = (1 - 6)/(2 - 3) = 5), never just m = 5. Use ** for powers, sqrt(), Limit(expr, x, a) for limits.
- Other math without "=" (a single expression or symbol) goes in `reply` as LaTeX between $...$.
- If you point out a false equation the learner wrote, don't restate it as an equation; refer to their line number instead."""

SCHEMA = {
    "type": "object",
    "properties": {
        "reply": {"type": "string"},
        "equations": {"type": "array", "items": {
            "type": "object",
            "properties": {"parts": {"type": "array", "items": {"type": "string"}}},
            "required": ["parts"], "additionalProperties": False}},
        "cites": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["reply", "equations", "cites"],
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


GREEK = {"epsilon": r"\varepsilon", "delta": r"\delta", "theta": r"\theta", "pi": r"\pi", "alpha": r"\alpha"}
FUNCS = {"sin": r"\sin", "cos": r"\cos", "tan": r"\tan", "ln": r"\ln", "log": r"\log", "exp": r"\exp"}


def _tex(node) -> str:
    """LaTeX for a Python/SymPy-syntax expression tree, keeping the order and grouping as written."""
    import ast

    def atom(n):
        return isinstance(n, (ast.Name, ast.Constant, ast.Call))

    def group(n):
        t = _tex(n)
        return t if atom(n) or isinstance(n, ast.BinOp) and isinstance(n.op, (ast.Pow, ast.Div)) else rf"\left({t}\right)"

    if isinstance(node, ast.Expression):
        return _tex(node.body)
    if isinstance(node, ast.Constant):
        return str(node.value)
    if isinstance(node, ast.Name):
        return {"oo": r"\infty", "E": "e"}.get(node.id, GREEK.get(node.id, node.id))
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        inner = node.operand
        body = _tex(inner) if atom(inner) or isinstance(inner, ast.BinOp) and isinstance(inner.op, (ast.Pow, ast.Div, ast.Mult)) \
            else rf"\left({_tex(inner)}\right)"
        return f"-{body}"
    if isinstance(node, ast.BinOp):
        l, r, op = node.left, node.right, node.op
        if isinstance(op, ast.Div):
            return rf"\frac{{{_tex(l)}}}{{{_tex(r)}}}"
        if isinstance(op, ast.Pow):
            return f"{group(l)}^{{{_tex(r)}}}"
        if isinstance(op, (ast.Add, ast.Sub)):
            rt = _tex(r)
            if isinstance(r, ast.UnaryOp) or (isinstance(r, ast.Constant) and isinstance(r.value, (int, float)) and r.value < 0):
                rt = f"({rt})"
            elif isinstance(op, ast.Sub) and isinstance(r, ast.BinOp) and isinstance(r.op, (ast.Add, ast.Sub)):
                rt = rf"\left({rt}\right)"
            return f"{_tex(l)} {'+' if isinstance(op, ast.Add) else '-'} {rt}"
        if isinstance(op, ast.Mult):
            lt = _tex(l) if not (isinstance(l, ast.BinOp) and isinstance(l.op, (ast.Add, ast.Sub))) else rf"\left({_tex(l)}\right)"
            rt = _tex(r) if not (isinstance(r, ast.BinOp) and isinstance(r.op, (ast.Add, ast.Sub))) and not isinstance(r, ast.UnaryOp) \
                else rf"\left({_tex(r)}\right)"
            implicit = (isinstance(l, ast.Constant) and not isinstance(r, ast.Constant)) or rt.startswith(r"\left(") \
                or (isinstance(r, ast.Name) and not isinstance(l, ast.Constant))
            sep = "" if implicit else r" \cdot "
            return lt + sep + rt
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
        name, args = node.func.id, node.args
        if name == "sqrt" and len(args) == 1:
            return rf"\sqrt{{{_tex(args[0])}}}"
        if name in ("Abs", "abs") and len(args) == 1:
            return rf"\left|{_tex(args[0])}\right|"
        if name == "Limit" and len(args) >= 3:
            side = ""
            if len(args) == 4 and isinstance(args[3], ast.Constant) and args[3].value in ("+", "-"):
                side = f"^{{{args[3].value}}}"
            return rf"\lim_{{{_tex(args[1])} \to {_tex(args[2])}{side}}} {group(args[0])}"
        if name in FUNCS:
            return rf"{FUNCS[name]}\left({', '.join(_tex(a) for a in args)}\right)"
        return rf"{name}\left({', '.join(_tex(a) for a in args)}\right)"
    raise ValueError("unsupported")


def _display(part: str) -> str:
    """LaTeX for one chain part exactly as written (order and grouping kept), so the learner
    sees the steps; falls back to SymPy's own LaTeX when the part isn't plain SymPy syntax."""
    import ast

    t = part.strip()
    for a, b in answers.UNICODE.items():
        t = t.replace(a, b)
    t = t.replace("^", "**")
    try:
        return _tex(ast.parse(t, mode="eval"))
    except Exception:  # noqa: BLE001
        try:
            return sp.latex(answers.parse(part))
        except ValueError:
            return part


def check_equations(equations: list[dict]) -> tuple[list[str], list[str]]:
    """Verify every chain with SymPy. Returns (failures, rendered LaTeX for each equation)."""
    bad, rendered = [], []
    for eq in equations:
        parts = [p for p in eq.get("parts", []) if str(p).strip()]
        parsed = [stepcheck._parse(p) for p in parts]
        checkable = [e for j, e in enumerate(parsed) if not stepcheck._is_label(e, j, len(parsed), parts[j])]
        ok = len(checkable) >= 2 and all(e is not stepcheck.UNPARSEABLE for e in checkable)
        # "m = (y_2 - y_1)/(x_2 - x_1)": a name for a general formula states a definition, which
        # SymPy cannot check; allow it. A name for a bare value (m = 5) must show its computation.
        if len(parts) == 2 and len(checkable) == 1 and checkable[0] is not stepcheck.UNPARSEABLE \
                and isinstance(checkable[0], sp.Basic) and checkable[0].free_symbols:
            ok = True
            checkable = []
        if ok:
            for a, b in zip(checkable, checkable[1:]):
                va, vb = stepcheck._value(a), stepcheck._value(b)
                if va is None or vb is None or ("DNE" in (va, vb) and va != vb) or \
                        ("DNE" not in (va, vb) and not answers.equal(va, vb)):
                    ok = False
                    break
        if not ok:
            bad.append(" = ".join(parts))
        rendered.append(" = ".join(_display(p) for p in parts))
    return bad, rendered


def render_reply(reply: str, rendered: list[str]) -> tuple[str, list[str]]:
    """Put the verified equations into the reply; report placeholders that don't exist."""
    missing = []

    def sub(m):
        i = int(m.group(1)) - 1
        if 0 <= i < len(rendered):
            return f"${rendered[i]}$"
        missing.append(m.group(0))
        return ""

    return re.sub(r"\[\[(\d+)\]\]", sub, reply), missing


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
    for attempt_no in range(TRIES):
        r = _claude(context, feedback, client=claude_client)
        problems = []
        bad, rendered = check_equations(r.get("equations", []))
        if bad:
            problems.append("these equations are not true (checked with SymPy): " + "; ".join(bad))
        if re.search(r"\$[^$]*=[^$]*\$", r["reply"]):
            problems.append("an equation was typed into the reply; put every equation in `equations` and use [[n]]")
        reply, missing = render_reply(r["reply"].strip(), rendered)
        if missing:
            problems.append(f"placeholders with no equation: {missing}")
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
        history.append({"reply": reply, "equations": r.get("equations", []), "checks": checks, "problems": problems})
        if not problems:
            return {"status": "ok", "reply": reply, "cites": r.get("cites", []), "checks": checks, "tries": attempt_no + 1}
        feedback = "\n".join(f"- {p}" for p in problems)
    where = f" line {line} of your work" if line else " your work"
    return {"status": "fallback",
            "reply": (f"I couldn't write an explanation that passed its checks, so here is the book's own worked "
                      f"example to compare with{where}:"),
            "canonical": fallback, "cites": labels[:1], "checks": history[-1]["checks"], "tries": TRIES,
            "rejected": [h["problems"] for h in history]}

"""Work from the family's own book: a page from any curriculum, checked and counted.

Families keep the book they already use. A grown-up photographs a page the child worked on (in a
workbook, on a worksheet, or in a notebook with the problems copied out) and it is checked like our
own pages, without us ever copying their book:

  1. read: the printed problems on the photo and the child's work on each (Claude vision);
  2. solve: each problem is solved on its own, from the printed statement only, never seeing the
     child's answer, and given one of this course's skills (or "other");
  3. verify: an answer is used only when it is certain, because SymPy computes the same value from
     the problem, or two independent solves agree. Anything else is left unmarked and not counted;
  4. mark: the child's final answer is graded against it with the same checker as our own pages,
     each line is step-checked, and the result goes into the learner model like any other problem.

The photo is kept privately in the child's book, as with our own pages; nothing from the family's
book is added to our pages or shown to anyone else. Problems on topics outside this course are
marked but do not move the model.
"""
from __future__ import annotations

import base64
import json
import re
from pathlib import Path

import sympy as sp

from . import answers, extract, paths, stepcheck, templates, transcribe
from .learner import LearnerDB, now

MODEL = "claude-opus-5-5"
KINDS = ["value", "expr", "set", "point", "choice"]

READ = """This photo shows a page from a child's own math book, worksheet or notebook (not one we printed), with the child's handwritten work on it.

List every problem the child wrote something for (an answer, work, or "skip"); leave out problems with nothing written.
For each problem:
- label: the problem's number or label as printed ("3", "12b", "A");
- statement: the problem exactly as printed, in plain linear notation (use ^, /, sqrt(), × or *, ÷), including any numbers shown in a picture (describe the picture briefly in brackets, e.g. "[a picture of 7 apples]"). If you cannot read the problem, write "[unreadable]";
- the child's work, line by line, exactly as written, with the same fields as below; do not fix anything;
- final_answer: the child's answer (the boxed or circled value, the value on the answer line, or the last line), without a leading "=" or "x =", or null;
- skipped: true only if the child wrote "skip" or left it blank;
- position: where the problem's label is in the photo, as fractions of the image (x from the left, y from the top).

For each line of work: text (exactly as written), sympy (the line as SymPy syntax with " = " between equal parts, Eq(lhs, rhs) for an equation to solve, or "" for words), continues (the line starts with "="), crossed_out, boxed.
Also give book: the book's title if it is printed on the page, else "". Report anything unusual in notes."""

LINE = {"type": "object", "properties": {"text": {"type": "string"}, "sympy": {"type": "string"},
                                          "continues": {"type": "boolean"}, "crossed_out": {"type": "boolean"},
                                          "boxed": {"type": "boolean"}},
        "required": ["text", "sympy", "continues", "crossed_out", "boxed"], "additionalProperties": False}
READ_SCHEMA = {
    "type": "object",
    "properties": {
        "book": {"type": "string"},
        "problems": {"type": "array", "items": {
            "type": "object",
            "properties": {
                "label": {"type": "string"}, "statement": {"type": "string"},
                "lines": {"type": "array", "items": LINE},
                "final_answer": {"type": ["string", "null"]}, "skipped": {"type": "boolean"},
                "position": {"type": "object", "properties": {"x": {"type": "number"}, "y": {"type": "number"}},
                             "required": ["x", "y"], "additionalProperties": False},
            },
            "required": ["label", "statement", "lines", "final_answer", "skipped", "position"],
            "additionalProperties": False}},
        "notes": {"type": "string"},
    },
    "required": ["book", "problems", "notes"],
    "additionalProperties": False,
}

SOLVE = """You are given math problems exactly as printed in a child's book. Solve each one yourself, carefully.

For each problem return:
- label: as given;
- skill: the one skill id from the list that the problem practises, or "other" if none fits;
- kind: the form of the answer: "value" (a number, including fractions like 3/4 or decimals), "expr" (an algebraic expression), "set" (several values, e.g. all solutions), "point" (an ordered pair), "choice" (a word or a letter, e.g. "greater", "B", "triangle");
- answer: the answer in SymPy-readable form for value/expr ("3/4", "2*x + 1"), comma-separated for set ("2, -3"), "(3, -2)" for point, the word or letter for choice;
- check: a SymPy expression whose value is the answer ("(3/4)*12", "Rational(7, 8) - Rational(1, 4)"), or an equation Eq(lhs, rhs) whose solution is the answer, written straight from the problem's numbers; or "" if the problem cannot be written that way (word answers, pictures, comparisons);
- var: the variable an equation is solved for ("x"), or "";
- sure: true only if the problem is fully readable and the answer is certain.
Do not guess at unreadable problems: set sure false."""

SOLVE_SCHEMA = {
    "type": "object",
    "properties": {"solutions": {"type": "array", "items": {
        "type": "object",
        "properties": {"label": {"type": "string"}, "skill": {"type": "string"}, "kind": {"type": "string", "enum": KINDS},
                       "answer": {"type": "string"}, "check": {"type": "string"}, "var": {"type": "string"},
                       "sure": {"type": "boolean"}},
        "required": ["label", "skill", "kind", "answer", "check", "var", "sure"],
        "additionalProperties": False}}},
    "required": ["solutions"],
    "additionalProperties": False,
}


def _client():
    import anthropic

    return anthropic.Anthropic()


def _call(content, schema, effort, client=None) -> dict:
    client = client or _client()
    with client.beta.messages.stream(
        model=MODEL, max_tokens=32000,
        betas=["server-side-fallback-2026-07-01"], fallbacks="default",
        thinking={"type": "adaptive"},
        output_config={"effort": effort, "format": {"type": "json_schema", "schema": schema}},
        messages=[{"role": "user", "content": content}],
    ) as stream:
        msg = stream.get_final_message()
    if msg.stop_reason == "refusal":
        raise RuntimeError("the model declined to read this page")
    if msg.stop_reason == "max_tokens":
        raise RuntimeError("the page was too long to read in one go")
    return json.loads(next(b.text for b in msg.content if b.type == "text"))


def read_page(photo: Path, client=None) -> dict:
    media, raw = transcribe.prepare_image(photo)
    return _call([{"type": "image", "source": {"type": "base64", "media_type": media,
                                                "data": base64.standard_b64encode(raw).decode()}},
                  {"type": "text", "text": READ}], READ_SCHEMA, "high", client)


def skill_list() -> str:
    sk = extract.skills()
    return "\n".join(f"{s}: {sk[s]['name']}" + (f" (grade {sk[s]['grade']})" if sk[s].get("grade") else "")
                     for s in extract.skill_order() if templates.for_skill(s))


def solve(statements: list[dict], client=None) -> dict[str, dict]:
    """Each problem solved from its printed statement alone (the child's work is never shown)."""
    text = (SOLVE + "\n\nSkills:\n" + skill_list() + "\n\nProblems:\n"
            + "\n".join(f"{s['label']}. {s['statement']}" for s in statements))
    out = _call(text, SOLVE_SCHEMA, "high", client)
    return {s["label"]: s for s in out["solutions"]}


def key_of(sol: dict) -> dict:
    """A solution as an answer key our checker reads."""
    k, a = sol["kind"], sol["answer"].strip()
    if k == "set":
        return {"kind": "set", "value": [x.strip() for x in a.strip("{}").split(",") if x.strip()]}
    if k == "point":
        return {"kind": "point", "value": [x.strip() for x in a.strip("()").split(",")]}
    if k == "choice":
        return {"kind": "choice", "value": a}
    return {"kind": k, "value": a}


def computed(sol: dict):
    """What SymPy makes of the problem's own check expression: a value, a list of solutions, or None."""
    c = (sol.get("check") or "").strip()
    if not c:
        return None
    try:
        e = sp.sympify(c, locals={"Eq": sp.Eq, "Rational": sp.Rational})
        if isinstance(e, sp.Equality):
            v = sp.Symbol(sol.get("var") or "x")
            return sorted(sp.solve(e, v), key=sp.default_sort_key)
        return sp.nsimplify(e) if e.is_number else sp.simplify(e)
    except Exception:  # noqa: BLE001
        return None


def agrees(sol: dict, value) -> bool:
    """The model's answer is the one SymPy computed."""
    key = key_of(sol)
    try:
        if isinstance(value, list):
            if key["kind"] == "set":
                return answers.same_set([sp.sympify(x) for x in key["value"]], value)
            return len(value) == 1 and key["kind"] == "value" and answers.equal(sp.sympify(key["value"]), value[0])
        if key["kind"] in ("value", "expr"):
            return answers.equal(sp.sympify(key["value"]), value)
    except Exception:  # noqa: BLE001
        return False
    return False


def same_answer(a: dict, b: dict) -> bool:
    if a["kind"] != b["kind"]:
        return False
    ka, kb = key_of(a), key_of(b)
    if ka["kind"] == "choice":
        return answers.norm_choice(ka["value"]) == answers.norm_choice(kb["value"])
    try:
        ok, _ = answers.grade(ka, b["answer"])
        return ok
    except Exception:  # noqa: BLE001
        return False


def verified_keys(problems: list[dict], client=None) -> dict[str, dict]:
    """label -> {"key", "skill", "how"} for the problems whose answer is certain."""
    todo = [p for p in problems if "[unreadable]" not in p["statement"]]
    if not todo:
        return {}
    first = solve(todo, client)
    sure, unsure = {}, []
    for p in todo:
        s = first.get(p["label"])
        if not s or not s["sure"]:
            continue
        val = computed(s)
        if val is not None and agrees(s, val):
            sure[p["label"]] = {"sol": s, "how": "computed"}
        else:
            unsure.append(p)
    if unsure:  # no computation to lean on: a second, independent solve must agree
        second = solve(unsure, client)
        for p in unsure:
            a, b = first[p["label"]], second.get(p["label"])
            if b and b["sure"] and same_answer(a, b) and computed(a) is None:
                sure[p["label"]] = {"sol": a, "how": "solved twice"}
    sk = extract.skills()
    return {lab: {"key": key_of(v["sol"]), "skill": v["sol"]["skill"] if v["sol"]["skill"] in sk else "other",
                  "how": v["how"]} for lab, v in sure.items()}


def _numbers(labels: list[str]) -> list[int]:
    """The printed numbers when they are plain and distinct, else 1, 2, 3, ... (used for the marks)."""
    nums = [int(x) for x in labels if re.fullmatch(r"\d{1,3}", x.strip())]
    return [int(x) for x in labels] if len(nums) == len(labels) and len(set(nums)) == len(nums) \
        else list(range(1, len(labels) + 1))


def book_title() -> str:
    from . import story

    return story.profile().get("book", "")


def check_page(db: LearnerDB, photo: Path, client=None, progress=None) -> dict:
    """Read, solve, verify and mark one photographed page; record what it shows. Returns the report
    (the same shape as our own pages' reports, so the child's book shows it the same way)."""
    say = progress or (lambda s: None)
    photo = Path(photo)
    say("Reading the page")
    doc = read_page(photo, client)
    probs = doc["problems"]
    say(f"Working out the answers to {len(probs)} problem{'s' if len(probs) != 1 else ''}")
    keys = verified_keys(probs, client)
    n = len([p for p in db.packets() if p["kind"] == "outside"]) + 1
    pid = f"B{n}"
    book = doc.get("book") or book_title()
    db.add_packet(pid, "outside", None, {"book": book, "photo": photo.name})
    with db.tx() as c:  # never an open set of pages: it is checked the moment it arrives
        c.execute("UPDATE packets SET status='graded' WHERE id=?", (pid,))
    tdoc = {"packet_code": pid, "problems": [], "notes": doc.get("notes", "")}
    report = {"photo": photo.name, "transcriber": "claude-vision", "packet": pid, "outside": True, "book": book,
              "transcript": tdoc, "problems": [], "at": now()}
    for num, p in zip(_numbers([p["label"] for p in probs]), probs):
        tp = {"number": num, "label": p["label"], "skipped": p["skipped"], "lines": p["lines"],
              "final_answer": p["final_answer"], "position": p["position"]}
        tdoc["problems"].append(transcribe.validate({"problems": [tp]})["problems"][0])
        entry = {"number": num, "label": p["label"], "statement": p["statement"]}
        k = keys.get(p["label"])
        if not k:
            entry["status"] = "not checked"
            entry["why"] = "We could not be certain of the answer, so this one is not marked or counted."
            report["problems"].append(entry)
            continue
        try:
            check = stepcheck.check(tp, k["key"])
        except Exception as e:  # noqa: BLE001 - one problem the checker can't handle must not stop the page
            print(f"check failed for {p['label']}: {type(e).__name__}: {e}")
            entry["status"] = "not checked"
            entry["why"] = "This one couldn’t be checked automatically, so it isn’t marked or counted."
            report["problems"].append(entry)
            continue
        entry.update({"correct": check["final_correct"], "stepcheck": check, "how": k["how"], "skill": k["skill"]})
        credit = 0.0 if check["skipped"] or not check["final_correct"] else 1.0
        dec = {"misconception": None, "misconception_root": None, "attempts": 1, "crossed_out_runs": 0,
               "substeps": {}, "substeps_written_fraction": 0.0, "strategy": "skipped" if check["skipped"] else "unsure"}
        if k["skill"] == "other":  # a topic outside this course: marked in the book, not counted
            entry.update({"status": "graded", "counted": False, "credit": credit, "decision": dec, "mastery_changes": {}})
            report["problems"].append(entry)
            continue
        tpl = templates.for_skill(k["skill"])[0]
        data = {"template": tpl.id, "skill": k["skill"], "requires": [k["skill"]], "prompt": p["statement"],
                "plain": p["statement"], "key": k["key"], "strategies": {}, "substeps": [], "outside": True}
        prid = db.add_problem(pid, num, data)
        changes = db.record_attempt(db.problem(prid) | {"id": prid}, {
            "correct": check["final_correct"], "credit": credit, "misconception_root": None, "photo": photo.name,
            "transcript": tp, "stepcheck": check, "evidence": {"decision": dec, "transcriber": "claude-vision",
                                                               "outside": True, "key_how": k["how"]}})
        entry.update({"status": "graded", "problem_id": prid, "credit": credit, "decision": dec,
                      "mastery_changes": {s: [round(a, 3), round(b, 3)] for s, (a, b) in changes.items()}})
        report["problems"].append(entry)
    rep_path = paths.OUT / f"report-{photo.stem}.json"
    rep_path.parent.mkdir(parents=True, exist_ok=True)
    rep_path.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    paths.PROCESSED.mkdir(parents=True, exist_ok=True)
    if photo.exists() and photo.parent != paths.PROCESSED:
        photo.rename(paths.PROCESSED / photo.name)
    return report


# ---------------------------------------------------------------------------
# when the family's own book is the main book: our pages only fill gaps

def own_book() -> bool:
    from . import story

    return story.profile().get("main") == "own"


def gaps(db: LearnerDB, k: int = 2) -> list[str]:
    """Skills the family's book shows trouble with, most recent first, that are not yet secure."""
    done = db.mastered_set()
    out = []
    for a in reversed(db.attempts()):
        s = a["pdata"]["skill"]
        if a["kind"] == "outside" and not a["correct"] and s not in done and s not in out:
            out.append(s)
    return out[:k]


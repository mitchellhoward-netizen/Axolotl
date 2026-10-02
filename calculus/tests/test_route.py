"""A route through the textbook: the book's own sections and the book's own exercises, chosen per learner,
checked against the book's own answers."""
import json

import pytest

from adaptcalc import answers, extract, flow, paths, route
from adaptcalc.learner import LearnerDB


@pytest.fixture
def prealgebra(tmp_path):
    d = tmp_path / "kid"
    d.mkdir()
    (d / "profile.json").write_text(json.dumps({"name": "Sam", "course": "prealgebra", "start": "grade6"}))
    with paths.use_learner(d, "prealgebra"):
        yield LearnerDB()


def test_the_books_own_numbering_matches_its_answer_key(prealgebra):
    exs = route.book_exercises("pa2e")
    answered = [e for e in exs if e["answer"]]
    # OpenStax answers the odd-numbered exercises: the numbering is the book's own
    assert sum(e["number"] % 2 == 1 for e in answered) / len(answered) > 0.99


def test_a_lesson_is_the_book_and_its_exercises(prealgebra):
    db = prealgebra
    known = {s: 0.99 for s in extract.skill_order()[:12]}
    db.set_mastery(known, "diagnostic posterior", None, source="diagnostic")
    db.mark_placed(known)
    flow.start_lessons(db)
    made = flow.next_pages(db, use_jev=False)
    probs = db.problems(made["packet"])
    refs = [p["data"].get("book_ref") for p in probs]
    assert probs and all(refs), "every practice problem is one of the book's own exercises"
    ex = {e["id"]: e for e in route.book_exercises("pa2e")}
    for p in probs:
        e = ex[p["data"]["exercise_id"]]
        assert e["number"] == p["data"]["book_ref"]["number"]
        assert answers.grade(p["data"]["key"], route._clean(e["answer"]))[0]  # the book's answer is right
    # the next lesson never repeats an exercise
    with db.tx() as c:
        c.execute("UPDATE packets SET status='set_aside'")
    again = flow.next_pages(db, use_jev=False)
    first = {p["data"]["exercise_id"] for p in probs}
    assert not first & {p["data"].get("exercise_id") for p in db.problems(again["packet"])}
    o = route.overview(db)
    assert o["counts"]["known"] >= 1 and o["here"]["status"] == "now"


def ex(plain, answer, instruction):
    return {"plain": plain, "answer": answer, "problem": [], "solution": [], "heading": None, "book": "pa2e",
            "section": "1.1", "instruction": {"t": "para", "inl": [{"k": "text", "s": instruction}]}}


@pytest.mark.parametrize("plain,answer,instruction,want", [
    ("45+33", "78", "Add.", {"computed"}),                                       # copying the question is not answering it
    ("86", "2*43", "In the following exercises, find the prime factorization.", {"prime_factorization"}),
    ("the difference of 14 and 9", "14-9", "Translate the phrases into algebraic expressions.", None),
    ("431,324", "7,831", "Divide.", set()),                                   # thousands, not a list
    ("A drink has 106 calories", "159 cal", "Solve the proportion problem.", None),  # a unit, not a variable
    ("(2y-9)y", "2y2 − 9y", "Multiply.", None),                                 # exponents lost in extraction
])
def test_the_books_answer_becomes_a_safe_key(prealgebra, plain, answer, instruction, want):
    k = route.key_for(ex(plain, answer, instruction))
    if want is None:
        assert k is None
    else:
        assert k is not None and ({k["form"]} if k.get("form") else set()) == want


def test_computed_answers_must_be_worked_out():
    k = {"kind": "value", "value": "78", "form": "computed"}
    assert answers.grade(k, "78")[0] and answers.grade(k, "x = 78")[0]
    assert not answers.grade(k, "45+33")[0]
    assert answers.grade({"kind": "value", "value": "7831"}, "7,831")[0]

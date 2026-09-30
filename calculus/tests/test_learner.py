import numpy as np
import pytest

from adaptcalc import diagnostic, learner, templates


def _lesson_problem(db):
    db.add_packet("L9", "lesson", None, {})
    p = templates.generate("factor_cancel.quadratic", 5).to_json()
    prid = db.add_problem("L9", 1, p)
    return db.problem(prid)


def test_update_happens_once_per_problem(db):
    prob = _lesson_problem(db)
    before = db.mastery()["factor_cancel"]
    ch = db.record_attempt(prob, {"correct": True, "credit": 1.0, "misconception_root": None})
    assert db.mastery()["factor_cancel"] > before and "factor_cancel" in ch
    with pytest.raises(learner.AlreadyGraded):
        db.record_attempt(prob, {"correct": True, "credit": 1.0, "misconception_root": None})
    assert db.conn.execute("SELECT COUNT(*) FROM attempts").fetchone()[0] == 1


def test_misconception_moves_blame_to_its_root(db):
    prob = _lesson_problem(db)
    m0 = db.mastery()
    db.record_attempt(prob, {"correct": False, "credit": 0.0, "misconception_root": "alg_factor"})
    m1 = db.mastery()
    assert m1["alg_factor"] < m0["alg_factor"] - 0.1
    assert m1["factor_cancel"] < m0["factor_cancel"]


def test_review_is_scheduled_after_success(db):
    prob = _lesson_problem(db)
    db.record_attempt(prob, {"correct": True, "credit": 1.0, "misconception_root": None})
    row = [r for r in db.skill_rows() if r["id"] == "factor_cancel"][0]
    assert row["next_review"] and row["stability_days"] >= 1


def test_batch_information_is_exact_for_one_item():
    S = np.array([[True], [False]] * 1)
    # one skill, uniform belief, deterministic item -> 1 bit
    order = diagnostic.skill_index()[0]
    S = np.zeros((2, len(order)), dtype=bool)
    S[0, :] = True
    w = np.array([0.5, 0.5])
    item = {"requires": ["alg_eval"], "guess": 0.0}
    assert abs(diagnostic.batch_mi(S, w, [item], slip=0.0) - 1.0) < 1e-9
    # two copies of the same item carry no extra information
    assert abs(diagnostic.batch_mi(S, w, [item, item], slip=0.0) - 1.0) < 1e-9


def test_diagnostic_round_and_posterior(db, monkeypatch):
    monkeypatch.setitem(learner.config()["diagnostic"], "particles", 4000)
    plan = diagnostic.next_round(db)
    assert len(plan["items"]) == learner.config()["diagnostic"]["round_sizes"][0]
    assert plan["expected_info_bits"] > 1.0
    gains = [i["gain_bits"] for i in plan["items"]]
    assert all(g > 0 for g in gains)


def test_recheck_corrects_a_diagnostic_answer(db):
    import sympy as sp

    db.add_packet("D1", "diagnostic", 1, {})
    p = templates.generate("alg_slope.two_points", 2).to_json()
    prid = db.add_problem("D1", 1, p)
    k = sp.sympify(p["key"]["value"])
    tp = {"lines": [{"text": "", "sympy": f"(a) = {k}", "crossed_out": False, "boxed": False, "continues": False}]}
    # graded before the unboxed-answer fix: stored as wrong
    db.record_attempt(db.problem(prid) | {"id": prid}, {"correct": False, "credit": 0.0, "misconception_root": None,
                                                       "transcript": tp, "evidence": {"decision": {"manual": True}}})
    before = db.mastery()["alg_slope"]
    r = db.recheck(prid)
    assert r["changed"] and r["correct"] and db.mastery()["alg_slope"] > before
    assert not db.recheck(prid)["changed"]                     # idempotent

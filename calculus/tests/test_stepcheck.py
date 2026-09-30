import sympy as sp

from adaptcalc import stepcheck


def line(sympy, text="", crossed=False, boxed=False, continues=False):
    return {"text": text or sympy, "sympy": sympy, "crossed_out": crossed, "boxed": boxed, "continues": continues}


KEY4 = {"kind": "limit", "value": sp.srepr(sp.Integer(4))}


def test_valid_factor_cancel_chain():
    tp = {"lines": [line("Limit((x**2 - 4)/(x - 2), x, 2) = Limit((x - 2)*(x + 2)/(x - 2), x, 2)"),
                    line("Limit(x + 2, x, 2)", continues=True), line("4", boxed=True, continues=True)],
          "final_answer": "4"}
    r = stepcheck.check(tp, KEY4)
    assert r["all_steps_valid"] and r["final_correct"]


def test_cancelling_terms_is_caught():
    tp = {"lines": [line("Limit((x**2 - 4)/(x - 2), x, 2) = Limit(x - 2, x, 2)"),
                    line("0", boxed=True, continues=True)], "final_answer": "0"}
    r = stepcheck.check(tp, KEY4)
    assert r["first_invalid_line"] == 1 and not r["final_correct"]


def test_crossed_out_lines_are_not_checked():
    tp = {"lines": [line("Limit((x**2 - 4)/(x - 2), x, 2) = 0", crossed=True),
                    line("Limit((x**2 - 4)/(x - 2), x, 2) = Limit(x + 2, x, 2) = 4", boxed=True)],
          "final_answer": "4"}
    r = stepcheck.check(tp, KEY4)
    assert r["all_steps_valid"] and r["lines"][0]["status"] == "crossed_out"


def test_separate_subcomputations_and_labels():
    tp = {"lines": [line("f(2) = 4 - 3 = 1"), line("f(3) = 9 - 3 = 6"), line("m = (6 - 1)/(3 - 2)"),
                    line("5", continues=True, boxed=True)], "final_answer": "5"}
    r = stepcheck.check(tp, {"kind": "value", "value": sp.srepr(sp.Integer(5))})
    assert r["all_steps_valid"] and r["final_correct"]


def test_equations_compare_solution_sets():
    tp = {"lines": [line("Eq(x**2 + 11*x + 30, 0)"), line("Eq((x + 5)*(x - 6), 0)")], "final_answer": "-5, 6"}
    r = stepcheck.check(tp, {"kind": "set", "value": ["-5", "-6"]})
    assert r["first_invalid_line"] == 2 and not r["final_correct"]


def test_skipped():
    r = stepcheck.check({"lines": [line("", text="skip")], "skipped": True}, KEY4)
    assert r["skipped"] and not r["final_correct"]


def test_unboxed_final_answer_is_read_from_the_last_line():
    tp = {"lines": [line("f(3) = 3**2 - 3 = 6"), line("f(2) = 2**2 - 3 = 1"),
                    line("(6 - 1)/(3 - 2) = 5/1 = 5")]}      # correct work, nothing boxed
    r = stepcheck.check(tp, {"kind": "value", "value": sp.srepr(sp.Integer(5))})
    assert r["final_correct"] and not r["final_boxed"] and "not boxed" in r["final_note"]

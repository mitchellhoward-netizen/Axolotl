"""'Ask about this': every tutor reply is checked before it is shown."""
import json

from adaptcalc import stepcheck, templates, tutor


class _Block:
    type = "text"

    def __init__(self, text):
        self.text = text


class FakeClaude:
    """Returns the queued replies in order; records what it was sent."""

    def __init__(self, *replies):
        self.replies, self.sent = list(replies), []
        self.beta = self
        self.messages = self

    def create(self, **kw):
        self.sent.append(kw)
        msg = type("M", (), {})()
        msg.stop_reason = "end_turn"
        msg.content = [_Block(json.dumps(self.replies.pop(0)))]
        return msg


def graded(db):
    db.add_packet("L7", "lesson", None, {})
    p = templates.generate("factor_cancel.quadratic", 3).to_json()
    prid = db.add_problem("L7", 1, p)
    tp = {"lines": [{"text": "(x^2-9)/(x-3) = x - 3", "sympy": "Limit((x**2-9)/(x-3), x, 3) = Limit(x-3, x, 3)",
                     "crossed_out": False, "boxed": False, "continues": False}], "final_answer": "0"}
    att = {"transcript": tp, "stepcheck": stepcheck.check(tp, p["key"]),
           "evidence": {"decision": {"misconception": "factor_cancel.fc_cancel_terms", "misconception_root": "alg_rational"}}}
    return db.problem(prid) | {"id": prid}, att


def jev(fake_jev, gives=0.1, asked=0.1, new=0.1):
    return fake_jev(lambda n, q: {"type": "noul", "noul": {"gives_away": gives, "asked_for_answer": asked,
                                                           "new_idea": new}[n]})


def test_checked_reply_is_shown(db, fake_jev):
    prob, att = graded(db)
    claude = FakeClaude({"reply": "Line 1 cancels terms. Factor first: [[1]]. What do you get for your numerator?",
                         "equations": [{"parts": ["x**2-4", "(x-2)*(x+2)"]}], "cites": ["Example 2.23"]})
    r = tutor.ask(prob, att, "Why is line 1 wrong?", 1, claude_client=claude, jev_client=jev(fake_jev))
    assert r["status"] == "ok" and r["tries"] == 1
    assert "$" in r["reply"] and "[[1]]" not in r["reply"]     # the verified equation is typeset by the server
    sent = json.loads(claude.sent[0]["messages"][0]["content"])
    assert sent["student_work"] and sent["textbook_passages"]        # grounded in the work and the book


def test_false_math_is_sent_back_and_fixed(db, fake_jev):
    prob, att = graded(db)
    claude = FakeClaude({"reply": "Note [[1]].", "equations": [{"parts": ["x**2-4", "(x-2)**2"]}], "cites": []},
                        {"reply": "Note [[1]].", "equations": [{"parts": ["f(2)", "2**2 - 4", "0"]}], "cites": []})
    r = tutor.ask(prob, att, "hint?", None, claude_client=claude, jev_client=jev(fake_jev))
    assert r["status"] == "ok" and r["tries"] == 2
    assert "not true" in claude.sent[1]["messages"][0]["content"]


def test_equations_typed_into_the_reply_are_rejected(db, fake_jev):
    prob, att = graded(db)
    reply = {"reply": "Note $x^2-4=(x-2)(x+2)$.", "equations": [], "cites": []}
    r = tutor.ask(prob, att, "hint?", None, claude_client=FakeClaude(*[reply] * tutor.TRIES), jev_client=jev(fake_jev))
    assert r["status"] == "fallback" and "typed into the reply" in r["rejected"][0][0]


def test_giving_away_the_answer_falls_back_to_the_book(db, fake_jev):
    prob, att = graded(db)
    reply = {"reply": "The answer is just the limit value.", "equations": [], "cites": []}
    r = tutor.ask(prob, att, "why?", None, claude_client=FakeClaude(*[reply] * tutor.TRIES), jev_client=jev(fake_jev, gives=0.9))
    assert r["status"] == "fallback" and r["canonical"] and r["canonical"].startswith("Example")


def test_notation_from_later_chapters_is_rejected(db, fake_jev):
    prob, att = graded(db)
    reply = {"reply": "Take the derivative: $f'(x)$ tells you the slope.", "equations": [], "cites": []}
    r = tutor.ask(prob, att, "why?", None, claude_client=FakeClaude(*[reply] * tutor.TRIES), jev_client=jev(fake_jev))
    assert r["status"] == "fallback"
    assert any("notation" in p for p in r["rejected"][0])


def test_formula_definitions_pass_but_bare_values_need_their_computation():
    bad, _ = tutor.check_equations([{"parts": ["m", "(y_2 - y_1)/(x_2 - x_1)"]},
                                    {"parts": ["m", "(1 - 6)/(2 - 3)", "5"]}])
    assert bad == []
    bad, _ = tutor.check_equations([{"parts": ["m", "5"]}, {"parts": ["m", "(1 - 6)/(2 - 3)", "6"]}])
    assert len(bad) == 2

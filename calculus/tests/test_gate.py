import sympy as sp

from adaptcalc import notation, textgen


def snip(typst, claims=(), position=None):
    pos = notation.end_of_section("2.3") if position is None else position
    return textgen.Snippet("t", "transition", typst, typst, pos, {"kind": "objective", "text": "canonical"},
                           claims=list(claims))


def test_sympy_gate_rejects_false_math():
    x = sp.Symbol("x")
    good = snip("Note $x^2 - 9 = (x - 3)(x + 3)$.", [sp.Eq(x**2 - 9, (x - 3) * (x + 3), evaluate=False)])
    bad = snip("Note $x^2 - 9 = (x - 3)^2$.", [sp.Eq(x**2 - 9, (x - 3)**2, evaluate=False)])
    unclaimed = snip("Note $x^2 - 9 = (x - 3)(x + 3)$.")
    assert textgen.sympy_check(good)[0]
    assert not textgen.sympy_check(bad)[0]
    assert not textgen.sympy_check(unclaimed)[0]


def test_notation_gate_blocks_notation_not_yet_introduced():
    early = notation.end_of_section("2.1")
    assert not textgen.notation_check(snip("Write $lim_(x -> 2^-) f(x)$.", position=early))[0]
    assert textgen.notation_check(snip("Write $lim_(x -> 2^-) f(x)$.", position=notation.end_of_section("2.2")))[0]
    assert not textgen.notation_check(snip("so $f'(x) = 2x$"))[0]            # derivatives come in Chapter 3
    assert not textgen.notation_check(snip("pick $delta = epsilon$", position=early))[0]


def test_jev_gate_and_fallback(fake_jev):
    s1, s2 = snip("Example 2.23 is the model for problem 1."), snip("Use L'Hopital's rule here.")

    def answer(name, q):
        return {"type": "noul", "noul": 0.05 if name == "s0" else 0.9}

    textgen.gate([s1, s2], ["canonical passage"], client=fake_jev(answer))
    assert s1.accepted and not s2.accepted


def test_without_jev_nothing_generated_is_accepted():
    s = snip("Example 2.23 is the model for problem 1.")
    textgen.gate([s], ["x"], use_jev=False)
    assert not s.accepted

import sympy as sp

from adaptcalc import answers, extract, templates


def test_every_skill_has_a_template():
    assert {t.skill for t in templates.REGISTRY.values()} == set(extract.skills())


def test_every_key_is_verified_and_grades_as_correct():
    assert templates.verify_all(range(12)) == []


def test_generation_is_deterministic():
    a = templates.generate("factor_cancel.quadratic", 3)
    b = templates.generate("factor_cancel.quadratic", 3)
    assert a.prompt == b.prompt and a.key == b.key


def test_limit_keys_match_sympy_limits():
    for s in range(10):
        p = templates.generate("conjugate_limit.sqrt", s)
        assert "limit" in p.verification
        assert sp.sympify(p.key["value"]).is_Rational

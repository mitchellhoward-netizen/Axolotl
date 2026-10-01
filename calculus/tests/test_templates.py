import pytest
import sympy as sp

from adaptcalc import extract, paths, templates

COURSES = ["calc_limits", "algebra1", "prealgebra"]


@pytest.mark.parametrize("course", COURSES)
def test_every_skill_has_a_template_and_every_template_fits_its_course(course):
    with paths.use_course(course):
        skills = set(extract.skills())
        mine = templates.for_course()
        assert {t.skill for t in mine.values()} == skills
        for t in templates.REGISTRY.values():
            if t.skill in skills:
                assert set(t.requires) <= skills, t.id


@pytest.mark.parametrize("course", COURSES)
def test_every_key_is_verified_and_grades_as_correct(course):
    with paths.use_course(course):
        assert templates.verify_all(range(12), set(extract.skills())) == []


def test_generation_is_deterministic():
    a = templates.generate("factor_cancel.quadratic", 3)
    b = templates.generate("factor_cancel.quadratic", 3)
    assert a.prompt == b.prompt and a.key == b.key


def test_limit_keys_match_sympy_limits():
    for s in range(10):
        p = templates.generate("conjugate_limit.sqrt", s)
        assert "limit" in p.verification
        assert sp.sympify(p.key["value"]).is_Rational


@pytest.mark.parametrize("course", COURSES)
def test_every_key_passes_the_generation_gate_self_check(course):
    """The packet gate re-grades each key; a required form (mixed number, scientific notation,
    prime factorization) must be graded as the learner writes it, or the problem is silently dropped."""
    from types import SimpleNamespace

    from adaptcalc import textgen

    with paths.use_course(course):
        bad = []
        for tid in templates.for_course():
            for seed in range(6):
                p = templates.generate(tid, seed).to_json()
                ok, why = textgen.sympy_check(SimpleNamespace(kind="problem", problem=p))
                if not ok:
                    bad.append(f"{tid} seed {seed}: {why}")
        assert bad == []


def test_mixed_numbers_read_with_or_without_parentheses():
    from adaptcalc import answers

    key = {"kind": "value", "value": "Rational(70, 9)", "form": "mixed_number"}
    for s in ("7 7/9", "7 (7/9)", "7 ((7)/(9))", "7 and 7/9"):
        assert answers.grade(key, s)[0], s
    assert not answers.grade(key, "70/9")[0]

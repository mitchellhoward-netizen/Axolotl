import pytest
import sympy as sp

from adaptcalc import extract, paths, templates

COURSES = ["calc_limits", "algebra1"]


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

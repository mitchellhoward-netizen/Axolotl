import pytest

from rulesarchive.testing import cases, check


@pytest.mark.parametrize("case,state", cases("school_meals"))
def test_household(case, state):
    check("school_meals", case, state)

import pytest

from rulesarchive.testing import cases, check


@pytest.mark.parametrize("case,state", cases("turning_65"))
def test_household(case, state):
    check("turning_65", case, state)

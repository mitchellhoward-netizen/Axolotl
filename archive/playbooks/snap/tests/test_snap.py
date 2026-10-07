import pytest

from rulesarchive.testing import cases, check


@pytest.mark.parametrize("case,state", cases("snap"))
def test_household(case, state):
    check("snap", case, state)

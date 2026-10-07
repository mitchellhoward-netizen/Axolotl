import pytest

from rulesarchive.testing import cases, check


@pytest.mark.parametrize("case,state", cases("disability"))
def test_household(case, state):
    check("disability", case, state)

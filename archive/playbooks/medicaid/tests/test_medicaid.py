import pytest

from rulesarchive.testing import cases, check


@pytest.mark.parametrize("case,state", cases("medicaid"))
def test_household(case, state):
    check("medicaid", case, state)

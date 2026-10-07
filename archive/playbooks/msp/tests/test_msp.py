import pytest

from rulesarchive.testing import cases, check


@pytest.mark.parametrize("case,state", cases("msp"))
def test_household(case, state):
    check("msp", case, state)

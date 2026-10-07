import pytest

from rulesarchive.testing import cases, check


@pytest.mark.parametrize("case,state", cases("ltc_medicaid"))
def test_household(case, state):
    check("ltc_medicaid", case, state)

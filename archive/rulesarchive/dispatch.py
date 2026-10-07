"""Shared ``evaluate(household, state, as_of)`` entry point for playbooks.

Each playbook package (``playbooks/<program>/__init__.py``) exposes
``evaluate`` by calling :func:`evaluate_state`, which imports
``playbooks.<program>.states.<state>.rules`` and calls its
``evaluate(household, as_of)``. A number the archive does not have for that
date turns into an ``undetermined`` result that names it, never a guess.
"""

from __future__ import annotations

import importlib
from datetime import date

from . import STATES, params
from .determination import UNDETERMINED, Determination
from .household import Household


def evaluate_state(program: str, hh: Household, state: str, as_of: date) -> Determination:
    if state not in STATES:
        raise ValueError(f"state {state!r} is not in the archive ({', '.join(STATES)})")
    mod = importlib.import_module(f"playbooks.{program}.states.{state}.rules")
    try:
        return mod.evaluate(hh, as_of)
    except params.ParameterUnresolved as e:
        det = Determination(program, state, as_of, status=UNDETERMINED)
        det.note("PARAMETER", str(e) if e.open_question else f"no sourced value of {e.pid} for {e.as_of}", None)
        if e.open_question:
            det.unresolved(e.open_question)
        return det

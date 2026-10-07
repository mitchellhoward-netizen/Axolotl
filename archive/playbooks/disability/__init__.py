"""Disability playbook (SSI + state supplements, Social Security disability). ``evaluate(household, state, as_of)``."""

from .federal.rules import evaluate, evaluate_ssdi  # noqa: F401

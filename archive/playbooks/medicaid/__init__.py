"""Medicaid (enrollment and renewal) playbook. ``evaluate(household, state, as_of)``."""

from .federal.rules import evaluate, federal_adult_minimum  # noqa: F401

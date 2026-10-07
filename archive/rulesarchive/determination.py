"""The result every playbook ``evaluate`` function returns.

A determination is never a bare boolean. It names the rule statements that
decided it (by stable rule ID) and the parameter values it used (by ID and
effective date), so a reviewer or the checking model can trace any answer
back to sources.

``status`` is three-valued on purpose: ``undetermined`` is the honest answer
when a rule or number the decision needs is unresolved in the archive.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any

ELIGIBLE = "eligible"
INELIGIBLE = "ineligible"
UNDETERMINED = "undetermined"


@dataclass
class Reason:
    rule: str            # stable rule ID, e.g. MSP-NY-QMB-INCOME
    text: str            # what happened, with the numbers
    passed: bool | None  # True = test met, False = failed, None = informational / not decidable


@dataclass
class Determination:
    program: str
    state: str
    as_of: date
    status: str = UNDETERMINED
    tier: str | None = None
    reasons: list[Reason] = field(default_factory=list)
    parameters_used: dict[str, dict[str, Any]] = field(default_factory=dict)
    open_questions: list[str] = field(default_factory=list)
    amounts: dict[str, float] = field(default_factory=dict)
    links: list[str] = field(default_factory=list)   # cross-playbook effects, e.g. "extra_help:deemed"

    # ------------------------------------------------------------ building
    def note(self, rule: str, text: str, passed: bool | None = None) -> None:
        self.reasons.append(Reason(rule, text, passed))

    def used(self, pid: str, effective: date, value: Any) -> None:
        self.parameters_used[pid] = {"effective_from": effective.isoformat(), "value": value}

    def unresolved(self, oq: str) -> None:
        if oq not in self.open_questions:
            self.open_questions.append(oq)

    # ------------------------------------------------------------- reading
    @property
    def eligible(self) -> bool | None:
        if self.status == ELIGIBLE:
            return True
        if self.status == INELIGIBLE:
            return False
        return None

    def rule_ids(self) -> list[str]:
        return [r.rule for r in self.reasons]

    def explain(self) -> str:
        lines = [f"{self.program} [{self.state}] as of {self.as_of}: {self.status}"
                 + (f" ({self.tier})" if self.tier else "")]
        for r in self.reasons:
            mark = {True: "+", False: "-", None: "·"}[r.passed]
            lines.append(f"  {mark} {r.rule}: {r.text}")
        for oq in self.open_questions:
            lines.append(f"  ? {oq}")
        return "\n".join(lines)

    def to_dict(self) -> dict[str, Any]:
        return {
            "program": self.program,
            "state": self.state,
            "as_of": self.as_of.isoformat(),
            "status": self.status,
            "tier": self.tier,
            "reasons": [r.__dict__ for r in self.reasons],
            "parameters_used": self.parameters_used,
            "open_questions": self.open_questions,
            "amounts": self.amounts,
            "links": self.links,
        }

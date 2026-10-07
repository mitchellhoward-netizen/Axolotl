"""Synthetic household model.

One model serves every playbook. Fields that only one program cares about
go in ``facts`` (household level) or ``Person.facts`` so the core stays
small. All money is in US dollars; income is *monthly* unless a field name
says otherwise; assets are current countable-or-not values (each playbook
decides what counts).

Only synthetic data belongs here. Test households are written in YAML and
loaded with :func:`Household.from_dict`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

# Income kinds. Playbooks decide which are earned/unearned and which are
# excluded; the vocabulary is shared so households are portable.
INCOME_KINDS = {
    "earned",               # wages, salary
    "self_employment",      # net self-employment
    "social_security",      # Title II retirement/survivor/disability (gross, before Part B deduction)
    "ssi",                  # federal SSI payment (Title XVI)
    "ssp",                  # state supplementary payment
    "pension",              # private or public pension, annuity
    "railroad_retirement",
    "veterans",             # VA pension/compensation
    "unemployment",
    "child_support",
    "alimony",
    "interest",
    "dividends",
    "rental",
    "workers_comp",
    "tanf",
    "other_unearned",
}

EARNED_KINDS = {"earned", "self_employment"}

ASSET_KINDS = {
    "cash",            # checking, savings, cash on hand
    "investments",     # stocks, bonds, mutual funds, CDs
    "retirement",      # IRA, 401(k) (treatment varies by program)
    "home",            # primary residence
    "vehicle",
    "real_estate",     # other real property
    "life_insurance_cash_value",
    "burial_fund",
    "burial_space",
    "other",
}

# Benefits a person may already receive. Used for categorical eligibility
# and cross-playbook links.
BENEFIT_KINDS = {
    "ssi", "ssp", "ssdi", "social_security_retirement", "medicaid", "medicaid_ltc",
    "qmb", "slmb", "qi", "qdwi", "extra_help", "snap", "tanf", "wic",
    "school_meals_free", "school_meals_reduced", "medicare_part_a",
    "medicare_part_b", "medicare_part_d", "va_pension", "liheap",
    "fdpir", "head_start", "foster_care", "homeless_liaison",
}


@dataclass
class Income:
    kind: str
    monthly: float
    owner: str | None = None   # person id; None = household
    note: str = ""

    def __post_init__(self) -> None:
        if self.kind not in INCOME_KINDS:
            raise ValueError(f"unknown income kind {self.kind!r}")

    @property
    def earned(self) -> bool:
        return self.kind in EARNED_KINDS


@dataclass
class Asset:
    kind: str
    value: float
    owner: str | None = None
    note: str = ""

    def __post_init__(self) -> None:
        if self.kind not in ASSET_KINDS:
            raise ValueError(f"unknown asset kind {self.kind!r}")


@dataclass
class Person:
    id: str
    age: int
    relationship: str = "self"          # self | spouse | child | parent | other
    disabled: bool = False              # meets SSA disability definition (as asserted by the test)
    blind: bool = False
    medicare_part_a: bool = False       # entitled to Part A
    medicare_part_b: bool = False       # enrolled in Part B
    citizen_or_qualified: bool = True   # citizenship / qualified immigrant status satisfied
    student: bool = False
    pregnant: bool = False
    benefits: set[str] = field(default_factory=set)
    facts: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        unknown = set(self.benefits) - BENEFIT_KINDS
        if unknown:
            raise ValueError(f"unknown benefit kinds {sorted(unknown)}")
        self.benefits = set(self.benefits)

    def receives(self, benefit: str) -> bool:
        return benefit in self.benefits


@dataclass
class Household:
    state: str                          # ny | ca | il
    members: list[Person]
    incomes: list[Income] = field(default_factory=list)
    assets: list[Asset] = field(default_factory=list)
    county: str | None = None
    # Monthly expenses, by kind: rent, mortgage, property_tax, homeowners_insurance,
    # utilities, heating_cooling, phone, medical, dependent_care, child_support_paid.
    expenses: dict[str, float] = field(default_factory=dict)
    facts: dict[str, Any] = field(default_factory=dict)

    # ---------------------------------------------------------------- build
    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Household":
        members = [Person(**{**m, "benefits": set(m.get("benefits", []))}) for m in d["members"]]
        return cls(
            state=d["state"],
            members=members,
            incomes=[Income(**i) for i in d.get("incomes", [])],
            assets=[Asset(**a) for a in d.get("assets", [])],
            county=d.get("county"),
            expenses=dict(d.get("expenses", {})),
            facts=dict(d.get("facts", {})),
        )

    # -------------------------------------------------------------- helpers
    def person(self, pid: str) -> Person:
        for m in self.members:
            if m.id == pid:
                return m
        raise KeyError(pid)

    @property
    def applicant(self) -> Person:
        """The person the question is about: ``facts.applicant`` or the first member."""
        pid = self.facts.get("applicant")
        return self.person(pid) if pid else self.members[0]

    @property
    def spouse(self) -> Person | None:
        """The applicant's spouse, if one lives in the household."""
        for m in self.members:
            if m.relationship == "spouse" and m is not self.applicant:
                return m
        if self.applicant.relationship == "spouse":
            for m in self.members:
                if m.relationship == "self":
                    return m
        return None

    @property
    def married_couple(self) -> bool:
        return self.spouse is not None

    @property
    def size(self) -> int:
        return len(self.members)

    def income_of(self, owners: set[str] | None = None, kinds: set[str] | None = None) -> float:
        """Sum monthly income, optionally filtered by owner ids and kinds.

        Household-level income (owner None) is included only when ``owners`` is None.
        """
        total = 0.0
        for inc in self.incomes:
            if owners is not None and inc.owner not in owners:
                continue
            if kinds is not None and inc.kind not in kinds:
                continue
            total += inc.monthly
        return total

    def assets_of(self, owners: set[str] | None = None, exclude_kinds: set[str] | None = None) -> float:
        total = 0.0
        for a in self.assets:
            if owners is not None and a.owner not in owners:
                continue
            if exclude_kinds and a.kind in exclude_kinds:
                continue
            total += a.value
        return total

    def anyone_receives(self, benefit: str) -> bool:
        return any(benefit in m.benefits for m in self.members)

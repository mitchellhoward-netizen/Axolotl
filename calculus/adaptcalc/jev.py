"""Thin TypeSafe (Jev) client: loads jev_questions.yaml, builds typed questions, logs calls.

The API key comes from TYPESAFE_API_KEY (the SDK reads it). Answers are
returned as plain dicts so callers never depend on SDK response classes.
"""
from __future__ import annotations

import os
from functools import lru_cache
from typing import Callable

import yaml
from typesafe_sdk import Choice, Noul, TypeSafeClient

from . import paths


@lru_cache(maxsize=1)
def spec() -> dict:
    return yaml.safe_load(paths.JEV_YAML.read_text(encoding="utf-8"))


def noul(instructions: str, criteria: dict | None = None) -> Noul:
    return Noul(instructions=instructions, criteria=dict(criteria) if criteria else None)


def choice(instructions: str, options: dict[str, str]) -> Choice:
    return Choice(instructions=instructions, criteria=dict(options))


class Jev:
    """One client per purpose. `log(purpose, request, response)` is optional."""

    def __init__(self, purpose: str, log: Callable[[str, dict, dict], None] | None = None,
                 client: TypeSafeClient | None = None):
        if client is None and not os.environ.get("TYPESAFE_API_KEY"):
            raise RuntimeError("TYPESAFE_API_KEY is not set")
        self.purpose = purpose
        self.log = log
        self.model = spec()["model"]
        self.client = client or TypeSafeClient(model=self.model)

    def ask(self, state: dict, questions: dict) -> dict:
        resp = self.client.system_one(state, questions)
        out = {"model": resp.model, "answers": {}, "usage": {"input_tokens": resp.usage.input_tokens}}
        for name, ans in resp.answers.items():
            a = ans.model_dump() if hasattr(ans, "model_dump") else dict(ans)
            out["answers"][name] = a
        if self.log:
            req = {"model": self.model, "state": state,
                   "questions": {k: (q.model_dump() if hasattr(q, "model_dump") else repr(q)) for k, q in questions.items()}}
            self.log(self.purpose, req, out)
        return out

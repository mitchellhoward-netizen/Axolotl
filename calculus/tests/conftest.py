import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


@pytest.fixture
def db(tmp_path, monkeypatch):
    from adaptcalc import learner

    return learner.LearnerDB(tmp_path / "learner.db")


class _Ans:
    def __init__(self, d):
        self.d = d

    def model_dump(self):
        return dict(self.d)


class _Usage:
    input_tokens = 0


class FakeJev:
    """Stands in for TypeSafeClient. `answer(name, question)` returns the answer dict."""

    def __init__(self, answer):
        self.answer = answer
        self.calls = []

    def system_one(self, state, questions):
        self.calls.append((state, questions))
        r = type("R", (), {})()
        r.model = "fake-jev"
        r.usage = _Usage()
        r.answers = {k: _Ans(self.answer(k, q)) for k, q in questions.items()}
        return r


@pytest.fixture
def fake_jev():
    return FakeJev


def jev_live() -> bool:
    return bool(os.environ.get("TYPESAFE_API_KEY"))

"""The agent's worker (rulesarchive.serve) answers exactly as the archive's own tests do."""

import json
import subprocess
import sys
from pathlib import Path

from rulesarchive import serve
from rulesarchive.testing import evaluate_case, load_cases

ARCHIVE = Path(__file__).resolve().parents[1]


def test_every_case_through_the_worker_matches_the_archive():
    for program in serve.PROGRAMS:
        for case in load_cases(program):
            reply = serve.handle(json.dumps({"id": case["id"], "op": "evaluate", "args": {
                "program": program, "household": case["household"], "as_of": str(case["as_of"])}}))
            assert reply["ok"], reply
            assert reply["result"] == json.loads(json.dumps(evaluate_case(program, case).to_dict(), default=str)), case["id"]


def test_bad_requests_are_errors_not_crashes():
    assert serve.handle("not json")["ok"] is False
    assert serve.handle(json.dumps({"id": 1, "op": "evaluate", "args": {"program": "lottery"}}))["error"].startswith("ValueError")
    assert serve.handle(json.dumps({"id": 2, "op": "nope"}))["id"] == 2


def test_the_worker_process_answers_one_line_per_request():
    lines = [json.dumps({"id": i, "op": "ping"}) for i in range(3)] + ["garbage"]
    out = subprocess.run([sys.executable, "-m", "rulesarchive.serve"], cwd=ARCHIVE, input="\n".join(lines) + "\n",
                         capture_output=True, text=True, timeout=60).stdout.splitlines()
    replies = [json.loads(x) for x in out]
    assert [r["id"] for r in replies] == [0, 1, 2, None]
    assert [r["ok"] for r in replies] == [True, True, True, False]

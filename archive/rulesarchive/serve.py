"""The agent's way in: a long-lived worker that answers JSON requests on stdin.

    python3 -m rulesarchive.serve          # from archive/, one JSON object per line

Each request is ``{"id": ..., "op": ..., "args": {...}}`` and gets exactly one reply line,
``{"id": ..., "ok": true, "result": ...}`` or ``{"id": ..., "ok": false, "error": "..."}``.
The process stays up so the rules load once (a cold start is about 0.6 s; a warm call is
milliseconds). The TypeScript side is ``src/archive/client.ts``.

Ops:
- ``ping`` → ``{"version": ...}``
- ``evaluate`` ``{program, household, as_of}`` → a Determination dict. The household is the
  same shape as the test cases (``rulesarchive.household.Household.from_dict``); its
  ``state`` picks the rules.
- ``cases`` ``{program, state?}`` → the program's synthetic household cases, for the harness.

Nothing here guesses. A bad request is an error; a rule the archive can't decide is an
``undetermined`` determination that names what is missing.
"""

from __future__ import annotations

import importlib
import json
import sys
import traceback
from datetime import date
from typing import Any, Callable

from .household import Household
from .testing import load_cases

VERSION = 1
PROGRAMS = ("school_meals", "snap", "medicaid", "msp", "ltc_medicaid", "disability", "turning_65")


def _program(name: Any) -> str:
    if name not in PROGRAMS:
        raise ValueError(f"unknown program {name!r}; one of {', '.join(PROGRAMS)}")
    return str(name)


def _jsonable(v: Any) -> Any:
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, dict):
        return {str(k): _jsonable(x) for k, x in v.items()}
    if isinstance(v, (list, tuple, set)):
        return [_jsonable(x) for x in v]
    return v


def op_ping(_: dict[str, Any]) -> Any:
    return {"version": VERSION, "programs": list(PROGRAMS)}


def op_evaluate(args: dict[str, Any]) -> Any:
    program = _program(args.get("program"))
    hh = Household.from_dict(dict(args["household"]))
    as_of = date.fromisoformat(str(args["as_of"]))
    mod = importlib.import_module(f"playbooks.{program}")
    return mod.evaluate(hh, hh.state, as_of).to_dict()


def op_cases(args: dict[str, Any]) -> Any:
    program = _program(args.get("program"))
    state = args.get("state")
    out = []
    for c in load_cases(program):
        if state and c.get("household", {}).get("state") != state:
            continue
        out.append({k: v for k, v in c.items() if k != "_file"} | {"file": c.get("_file")})
    return out


OPS: dict[str, Callable[[dict[str, Any]], Any]] = {"ping": op_ping, "evaluate": op_evaluate, "cases": op_cases}


def handle(line: str) -> dict[str, Any]:
    rid = None
    try:
        req = json.loads(line)
        rid = req.get("id")
        op = OPS.get(req.get("op"))
        if op is None:
            raise ValueError(f"unknown op {req.get('op')!r}")
        return {"id": rid, "ok": True, "result": _jsonable(op(req.get("args") or {}))}
    except Exception as e:  # one bad request never takes the worker down
        print(traceback.format_exc(), file=sys.stderr, flush=True)
        return {"id": rid, "ok": False, "error": f"{type(e).__name__}: {e}"}


def main() -> None:
    for line in sys.stdin:
        if line.strip():
            sys.stdout.write(json.dumps(handle(line)) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()

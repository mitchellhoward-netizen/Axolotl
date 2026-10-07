"""Cross-check archive results against PolicyEngine US.

    <pe-venv>/bin/python -m crosscheck.run --program msp [--state ny]

Runs every test household marked ``crosscheck: {policyengine: true}``
through the playbook and through PolicyEngine US, writes
``crosscheck/results/<program>.md`` and ``.yaml``, and exits 1 if any
difference is not explained in ``crosscheck/explanations/<program>.yaml``.

PolicyEngine US is AGPL-3.0. It is used here only as a local, development-time
comparison tool installed in a separate virtualenv; none of its code is copied
into this repository and the service does not import it. See crosscheck/README.md.
"""

from __future__ import annotations

import argparse
import importlib
import sys
from datetime import date
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from crosscheck.pe_situation import build  # noqa: E402
from rulesarchive.household import Household  # noqa: E402
from rulesarchive.testing import _as_date, evaluate_case, load_cases  # noqa: E402


def explanation_for(expl: list[dict], case: dict, state: str, o: dict, p: dict) -> str | None:
    for e in expl:
        if "cases" in e and case["id"] not in e["cases"]:
            continue
        m = e.get("match", {})
        if m.get("state") and m["state"] != state:
            continue
        if "ours" in m and any(o.get(k) != v for k, v in m["ours"].items()):
            continue
        if "pe" in m and any(p.get(k) != v for k, v in m["pe"].items()):
            continue
        if "cases" not in e and not m:
            continue
        return e["reason"]
    return None


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--program", required=True)
    ap.add_argument("--state")
    args = ap.parse_args(argv)

    from policyengine_us import Simulation
    import policyengine_us
    from importlib.metadata import version

    adapter = importlib.import_module(f"crosscheck.adapters.{args.program}")
    expl_file = ROOT / "crosscheck" / "explanations" / f"{args.program}.yaml"
    expl = (yaml.safe_load(expl_file.read_text()) or {}).get("explanations", []) if expl_file.exists() else []

    rows = []
    for case in load_cases(args.program):
        if not (case.get("crosscheck") or {}).get("policyengine"):
            continue
        states = [case["household"]["state"]] + list((case.get("compare_states") or {}).keys())
        for st in states:
            if args.state and st != args.state:
                continue
            det = evaluate_case(args.program, case, st if st != case["household"]["state"] else None)
            hh_d = dict(case["household"], state=st)
            hh = Household.from_dict(hh_d)
            as_of = _as_date(case["as_of"])
            extra = adapter.pe_inputs(hh, as_of)
            sim = Simulation(situation=build(hh, as_of, **extra))
            p = adapter.read(sim, hh, as_of)
            o = adapter.ours(det)
            agree = adapter.same(o, p)
            why = None if agree else explanation_for(expl, case, st, o, p)
            row = {"case": case["id"], "state": st, "title": case["title"], "ours": o, "policyengine": p,
                   "agree": agree, "explanation": why}
            if hasattr(adapter, "federal_minimum"):
                fm = adapter.federal_minimum(hh, as_of)
                row["ours_federal_minimum"] = fm
                row["federal_minimum_agrees"] = adapter.same(fm, p)
            rows.append(row)

    pe_version = version("policyengine-us")
    out_dir = ROOT / "crosscheck" / "results"
    out_dir.mkdir(exist_ok=True)
    suffix = f"-{args.state}" if args.state else ""
    (out_dir / f"{args.program}{suffix}.yaml").write_text(yaml.safe_dump(
        {"program": args.program, "policyengine_us_version": pe_version, "run_on": date.today().isoformat(), "rows": rows},
        sort_keys=False, width=140))
    lines = [f"# PolicyEngine US cross-check: {args.program}", "",
             f"PolicyEngine US {pe_version}, run {date.today().isoformat()}. "
             f"{sum(r['agree'] for r in rows)} of {len(rows)} households agree.", "",
             "\"Ours (federal minimum)\" reruns our shared federal logic without the state's own rules; where "
             "PolicyEngine models only federal rules, that column isolates logic errors from policy differences.", "",
             "| Case | State | Ours | PolicyEngine | Agree | Ours (federal minimum) | Fed. min. agrees | Why they differ |",
             "|---|---|---|---|---|---|---|---|"]
    fmt = lambda d: (f"{d['status']}" + (f" ({d['tier']})" if d.get("tier") else "")) if d else "—"
    for r in rows:
        fm = r.get("ours_federal_minimum")
        fma = "—" if fm is None else ("yes" if r["federal_minimum_agrees"] else "NO")
        lines.append(f"| {r['case']} | {r['state']} | {fmt(r['ours'])} | {fmt(r['policyengine'])} | "
                     f"{'yes' if r['agree'] else 'NO'} | {fmt(fm)} | {fma} | "
                     f"{r['explanation'] or ('' if r['agree'] else '**UNEXPLAINED**')} |")
    (out_dir / f"{args.program}{suffix}.md").write_text("\n".join(lines) + "\n")
    by_state: dict[str, int] = {}
    for r in rows:
        by_state[r["state"]] = by_state.get(r["state"], 0) + 1
    unexplained = [r for r in rows if not r["agree"] and not r["explanation"]]
    print(f"{args.program}: {len(rows)} compared ({by_state}), {sum(not r['agree'] for r in rows)} differ, "
          f"{len(unexplained)} unexplained")
    for r in unexplained:
        print(f"  UNEXPLAINED {r['case']}@{r['state']}: ours={r['ours']} pe={r['policyengine']}")
    return 1 if unexplained else 0


if __name__ == "__main__":
    raise SystemExit(main())

# PolicyEngine US cross-check

`crosscheck/run.py` runs the archive's synthetic households through
[PolicyEngine US](https://github.com/PolicyEngine/policyengine-us) and records
every difference with an explanation.

## Licenses (checked 2026-10-07)

| Project | License | How we use it |
|---|---|---|
| PolicyEngine US (`policyengine-us` 2.29.14 on PyPI) | **AGPL-3.0** (LICENSE in the GitHub repo) | Installed in a separate virtualenv and run locally by a developer as a comparison tool. None of its code or parameter files are copied into this repository. The rules archive and the Mycelium service never import it. |
| Federal Reserve Bank of Atlanta, Policy Rules Database (`Research-Division/policy-rules-database`) | **GPL-3.0** (LICENSE in the repo; README: "terms of the PRD use are defined by the GNU General Public License v3.0. If you are interested in alternative licensing arrangements, please contact" the Atlanta Fed) | Not used in code. It could be used the same way, for cross-checks only. |

Neither license clearly allows copying code into a closed commercial service.
AGPL-3.0 in particular reaches software offered to users over a network. So
the rule is: compare against these projects, never vendor them. A dependency
from the service on either project needs legal review first.

`crosscheck/pe_situation.py` and `crosscheck/adapters/*.py` are our own code.
They build PolicyEngine's documented input format and read its outputs by
variable name.

## Running

```sh
python3 -m venv /path/to/pe-venv
/path/to/pe-venv/bin/pip install policyengine-us pyyaml jsonschema
cd archive
/path/to/pe-venv/bin/python -m crosscheck.run --program msp
```

Results are written to `crosscheck/results/<program>.md` (table) and `.yaml`.
The run exits 1 if a difference is not explained in
`crosscheck/explanations/<program>.yaml`.

## Adding a program

Write `crosscheck/adapters/<program>.py` with:

- `pe_inputs(hh, as_of) -> dict` with extra situation inputs
  (`extra_person`, `extra_household`, `extra_spm`), or `{}`;
- `read(sim, hh, as_of) -> {"status", "tier", ...}` from PolicyEngine;
- `ours(det) -> {"status", "tier"}` from our Determination;
- `same(ours, pe) -> bool`;
- optionally `federal_minimum(hh, as_of)`, our own federal-only result. Where
  PolicyEngine models only federal rules, this separates logic errors from
  policy differences.

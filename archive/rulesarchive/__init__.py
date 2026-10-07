"""Core library for the Mycelium rules archive.

The archive holds benefit rules as data (YAML parameters, sources, rule
statements) plus small pieces of Python logic. This package is the glue:

- ``household``     the synthetic household model every playbook evaluates
- ``params``        effective-dated parameter lookup across the whole archive
- ``determination`` the result type every ``evaluate`` function returns
- ``registry``      loads playbooks, sources and rule statements for tooling
"""

from pathlib import Path

ARCHIVE_ROOT = Path(__file__).resolve().parent.parent
STATES = ("ny", "ca", "il")

# Puts the archive root on sys.path so tests import `rulesarchive` and `playbooks.*`.
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

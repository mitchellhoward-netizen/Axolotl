"""Family accounts: a parent signs in; each child is a learner with their own course and data.

Storage: one SQLite file (paths.ACCOUNTS_DB). A learner's mastery, packets and photos live in
their own directory (paths.LEARNERS / <learner id>), so deleting a child or a family removes
exactly their files.

Security
  - passwords: scrypt (n=2^14, r=8, p=1) with a 16-byte salt, compared in constant time
  - sessions: a random 32-byte token in an HttpOnly, SameSite=Lax cookie; only its SHA-256
    is stored, so a copy of the database does not hold usable sessions
  - sign-up needs an access code while the program is a pilot
"""
from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import json
import os
import re
import secrets
import shutil
import sqlite3
from pathlib import Path

from . import paths

SCHEMA = """
CREATE TABLE IF NOT EXISTS families (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  pw TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'family',      -- 'owner' may use personal-study courses
  created TEXT NOT NULL,
  code TEXT
);
CREATE TABLE IF NOT EXISTS learners (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  course TEXT NOT NULL,
  start TEXT NOT NULL DEFAULT 'unsure',
  created TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  created TEXT NOT NULL,
  expires TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS access_codes (
  code TEXT PRIMARY KEY,
  uses_left INTEGER NOT NULL,
  note TEXT,
  created TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS resets (
  token_hash TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  expires TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS usage (
  learner_id TEXT NOT NULL,
  day TEXT NOT NULL,
  kind TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (learner_id, day, kind)
);
"""

SESSION_DAYS = 30
RESET_MINUTES = 60
FAMILY_COLUMNS = {
    "weekly": "INTEGER NOT NULL DEFAULT 1",       # weekly progress email
    "last_weekly": "TEXT",
    "plan": "TEXT NOT NULL DEFAULT 'none'",       # none | trialing | active | past_due | canceled | comp
    "plan_until": "TEXT",
    "stripe_customer": "TEXT",
    "stripe_subscription": "TEXT",
}
# access codes that start with this prefix give the family the book free (pilot families)
COMP_PREFIX = "COMP-"
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class AuthError(Exception):
    pass


def now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def iso(t: dt.datetime) -> str:
    return t.isoformat(timespec="seconds")


def hash_password(pw: str) -> str:
    salt = secrets.token_bytes(16)
    h = hashlib.scrypt(pw.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return f"scrypt$16384$8$1${salt.hex()}${h.hex()}"


def check_password(pw: str, stored: str) -> bool:
    try:
        _, n, r, p, salt, h = stored.split("$")
        got = hashlib.scrypt(pw.encode(), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p), dklen=32)
        return hmac.compare_digest(got.hex(), h)
    except (ValueError, TypeError):
        return False


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def learner_dir(learner_id: str) -> Path:
    if not re.fullmatch(r"[a-z0-9]{8,32}", learner_id):
        raise ValueError("bad learner id")
    return paths.LEARNERS / learner_id


class Accounts:
    def __init__(self, path: Path | None = None):
        self.path = Path(path or paths.ACCOUNTS_DB)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(self.path, timeout=15)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON")
        self.conn.executescript(SCHEMA)
        cols = {r["name"] for r in self.conn.execute("PRAGMA table_info(families)")}
        for col, decl in FAMILY_COLUMNS.items():
            if col not in cols:  # databases from before email and billing
                self.conn.execute(f"ALTER TABLE families ADD COLUMN {col} {decl}")
        self.conn.commit()

    def close(self):
        self.conn.close()

    # ---------------- families ----------------
    def has_access(self, fam: dict) -> bool:
        """May this family make new packets and send in work? Billing off: everyone. On: the owner,
        pilot (comp) families, and active or trialing subscriptions."""
        from . import billing

        if not billing.enabled() or fam.get("role") == "owner" or fam.get("plan") == "comp":
            return True
        return fam.get("plan") in ("active", "trialing")

    def family_count(self) -> int:
        return self.conn.execute("SELECT COUNT(*) FROM families").fetchone()[0]

    def create_family(self, email: str, password: str, name: str = "", role: str = "family",
                      code: str | None = None) -> str:
        email = email.strip().lower()
        if not EMAIL.match(email):
            raise AuthError("Enter a valid email address.")
        if len(password) < 10:
            raise AuthError("Use a password of at least 10 characters.")
        if self.conn.execute("SELECT 1 FROM families WHERE email=?", (email,)).fetchone():
            raise AuthError("There is already an account with that email. Sign in instead.")
        fid = secrets.token_hex(8)
        with self.conn:
            self.conn.execute("INSERT INTO families (id, email, name, pw, role, created, code) VALUES (?,?,?,?,?,?,?)",
                              (fid, email, name.strip()[:80], hash_password(password), role, iso(now()), code))
        return fid

    def sign_up(self, email: str, password: str, name: str, code: str) -> str:
        code = (code or "").strip().upper()
        row = self.conn.execute("SELECT uses_left FROM access_codes WHERE code=?", (code,)).fetchone()
        env_codes = {c.strip().upper() for c in os.environ.get("ADAPTCALC_ACCESS_CODES", "").split(",") if c.strip()}
        if not (row and row["uses_left"] > 0) and code not in env_codes:
            raise AuthError("That access code isn't valid. The program is in a small pilot; ask for a code.")
        fid = self.create_family(email, password, name, code=code)
        if code.startswith(COMP_PREFIX):
            self.update_family(fid, plan="comp")
        if row:
            with self.conn:
                self.conn.execute("UPDATE access_codes SET uses_left = uses_left - 1 WHERE code=?", (code,))
        return fid

    def authenticate(self, email: str, password: str) -> str:
        row = self.conn.execute("SELECT id, pw FROM families WHERE email=?", (email.strip().lower(),)).fetchone()
        # hash even when the email is unknown, so timing does not reveal which emails exist
        ok = check_password(password, row["pw"] if row else hash_password("x" * 12))
        if not (row and ok):
            raise AuthError("That email and password don't match.")
        return row["id"]

    def family(self, fid: str) -> dict | None:
        r = self.conn.execute("SELECT id, email, name, role, created, weekly, last_weekly, plan, plan_until, "
                              "stripe_customer, stripe_subscription, code FROM families WHERE id=?", (fid,)).fetchone()
        return dict(r) if r else None

    def families(self) -> list[dict]:
        return [self.family(r["id"]) for r in self.conn.execute("SELECT id FROM families ORDER BY created")]

    def family_by(self, column: str, value: str) -> dict | None:
        assert column in ("email", "stripe_customer", "stripe_subscription")
        r = self.conn.execute(f"SELECT id FROM families WHERE {column}=?", (value,)).fetchone()
        return self.family(r["id"]) if r else None

    def update_family(self, fid: str, **fields) -> None:
        allowed = {"weekly", "last_weekly", "plan", "plan_until", "stripe_customer", "stripe_subscription", "name"}
        assert set(fields) <= allowed, fields
        if fields:
            sets = ", ".join(f"{k}=?" for k in fields)
            with self.conn:
                self.conn.execute(f"UPDATE families SET {sets} WHERE id=?", (*fields.values(), fid))

    # ---------------- password resets ----------------
    def start_reset(self, email: str) -> str | None:
        """A one-hour reset token for this email, or None when there is no such account (the caller
        answers the same either way, so the form does not reveal which emails have accounts)."""
        row = self.conn.execute("SELECT id FROM families WHERE email=?", (email.strip().lower(),)).fetchone()
        if not row:
            return None
        token = secrets.token_urlsafe(32)
        with self.conn:
            self.conn.execute("INSERT INTO resets (token_hash, family_id, expires) VALUES (?,?,?)",
                              (_token_hash(token), row["id"], iso(now() + dt.timedelta(minutes=RESET_MINUTES))))
        return token

    def finish_reset(self, token: str, password: str) -> str:
        r = self.conn.execute("SELECT family_id, expires, used FROM resets WHERE token_hash=?", (_token_hash(token or ""),)).fetchone()
        if not r or r["used"] or r["expires"] < iso(now()):
            raise AuthError("That reset link has expired or was already used. Ask for a new one.")
        self.set_password(r["family_id"], password)
        with self.conn:
            self.conn.execute("UPDATE resets SET used=1 WHERE token_hash=?", (_token_hash(token),))
        return r["family_id"]

    # ---------------- settings (e.g. billing objects created on first start) ----------------
    def setting(self, key: str) -> str | None:
        r = self.conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
        return r["value"] if r else None

    def set_setting(self, key: str, value: str) -> None:
        with self.conn:
            self.conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)", (key, value))

    def set_password(self, fid: str, password: str) -> None:
        if len(password) < 10:
            raise AuthError("Use a password of at least 10 characters.")
        with self.conn:
            self.conn.execute("UPDATE families SET pw=? WHERE id=?", (hash_password(password), fid))
            self.conn.execute("DELETE FROM sessions WHERE family_id=?", (fid,))

    def delete_family(self, fid: str) -> None:
        for lr in self.learners(fid):
            shutil.rmtree(learner_dir(lr["id"]), ignore_errors=True)
        with self.conn:
            self.conn.execute("DELETE FROM usage WHERE learner_id IN (SELECT id FROM learners WHERE family_id=?)", (fid,))
            self.conn.execute("DELETE FROM families WHERE id=?", (fid,))

    # ---------------- sessions ----------------
    def new_session(self, fid: str) -> str:
        token = secrets.token_urlsafe(32)
        with self.conn:
            self.conn.execute("INSERT INTO sessions (token_hash, family_id, created, expires) VALUES (?,?,?,?)",
                              (_token_hash(token), fid, iso(now()), iso(now() + dt.timedelta(days=SESSION_DAYS))))
            self.conn.execute("DELETE FROM sessions WHERE expires < ?", (iso(now()),))
        return token

    def session_family(self, token: str | None) -> str | None:
        if not token:
            return None
        r = self.conn.execute("SELECT family_id, expires FROM sessions WHERE token_hash=?", (_token_hash(token),)).fetchone()
        if not r or r["expires"] < iso(now()):
            return None
        return r["family_id"]

    def end_session(self, token: str | None) -> None:
        if token:
            with self.conn:
                self.conn.execute("DELETE FROM sessions WHERE token_hash=?", (_token_hash(token),))

    # ---------------- learners ----------------
    def learners(self, fid: str) -> list[dict]:
        return [dict(r) for r in self.conn.execute(
            "SELECT * FROM learners WHERE family_id=? ORDER BY created", (fid,))]

    def learner_by_id(self, lid: str) -> dict | None:
        """A learner without knowing the family (scan links carry only the learner id, signed)."""
        r = self.conn.execute("SELECT * FROM learners WHERE id=?", (lid,)).fetchone()
        return dict(r) if r else None

    def learner(self, fid: str, lid: str) -> dict | None:
        r = self.conn.execute("SELECT * FROM learners WHERE id=? AND family_id=?", (lid, fid)).fetchone()
        return dict(r) if r else None

    def add_learner(self, fid: str, name: str, course: str, start: str = "unsure") -> str:
        name = " ".join(name.split())[:40]
        if not name:
            raise AuthError("Give the learner a name (a first name is enough).")
        if len(self.learners(fid)) >= 8:
            raise AuthError("An account can have up to 8 learners.")
        lid = secrets.token_hex(8)
        d = learner_dir(lid)
        d.mkdir(parents=True, exist_ok=True)
        (d / "profile.json").write_text(json.dumps({"name": name, "course": course, "start": start}), encoding="utf-8")
        with self.conn:
            self.conn.execute("INSERT INTO learners (id, family_id, name, course, start, created) VALUES (?,?,?,?,?,?)",
                              (lid, fid, name, course, start, iso(now())))
        return lid

    def remove_learner(self, fid: str, lid: str) -> None:
        if not self.learner(fid, lid):
            raise AuthError("No such learner.")
        shutil.rmtree(learner_dir(lid), ignore_errors=True)
        with self.conn:
            self.conn.execute("DELETE FROM learners WHERE id=? AND family_id=?", (lid, fid))
            self.conn.execute("DELETE FROM usage WHERE learner_id=?", (lid,))

    # ---------------- usage limits ----------------
    def use(self, lid: str, kind: str, limit: int) -> None:
        """Count one use of `kind` today; refuse past the daily limit."""
        day = now().date().isoformat()
        with self.conn:
            r = self.conn.execute("SELECT n FROM usage WHERE learner_id=? AND day=? AND kind=?", (lid, day, kind)).fetchone()
            if r and r["n"] >= limit:
                raise AuthError(f"That's the daily limit ({limit}) for this learner. It resets at midnight UTC.")
            self.conn.execute("INSERT INTO usage (learner_id, day, kind, n) VALUES (?,?,?,1) "
                              "ON CONFLICT(learner_id, day, kind) DO UPDATE SET n = n + 1", (lid, day, kind))

    # ---------------- access codes ----------------
    def add_code(self, code: str, uses: int, note: str = "") -> str:
        code = code.strip().upper() or secrets.token_hex(4).upper()
        with self.conn:
            self.conn.execute("INSERT OR REPLACE INTO access_codes (code, uses_left, note, created) VALUES (?,?,?,?)",
                              (code, uses, note, iso(now())))
        return code

    def codes(self) -> list[dict]:
        return [dict(r) for r in self.conn.execute("SELECT * FROM access_codes ORDER BY created")]


def adopt_legacy(acc: Accounts) -> str | None:
    """Move a single-learner install (DATA/state, out, inbox) into an owner account.

    Runs once, when there are no accounts yet and ADAPTCALC_OWNER_EMAIL is set. The owner's
    password is ADAPTCALC_OWNER_PASSWORD, or the old ADAPTCALC_PASSWORD."""
    email = os.environ.get("ADAPTCALC_OWNER_EMAIL")
    pw = os.environ.get("ADAPTCALC_OWNER_PASSWORD") or os.environ.get("ADAPTCALC_PASSWORD")
    if not email or not pw or acc.family_count():
        return None
    if len(pw) < 10:
        print("ADAPTCALC_OWNER_PASSWORD must be at least 10 characters; the owner account was not created")
        return None
    fid = acc.create_family(email, pw, name="Owner", role="owner")
    legacy_db = paths.DATA / "state" / "learner.db"
    if legacy_db.exists():
        lid = acc.add_learner(fid, "Me", "calc_limits", "unsure")
        dest = learner_dir(lid)
        for sub in ("state", "out", "inbox"):
            src = paths.DATA / sub
            if src.exists():
                shutil.move(str(src), str(dest / sub))
    return fid

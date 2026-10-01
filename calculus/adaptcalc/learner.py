"""Learner model: per-skill mastery probability + review schedule, in SQLite.

Tables
  skills    one row per skill: p_mastery, stability_days, next_review, ...
  packets   printed packets (diagnostic rounds, lessons)
  problems  every problem printed on a packet, with its verified key
  attempts  one row per graded problem (PRIMARY KEY problem_id) -> the model
            is updated exactly once per problem
  updates   audit log of every mastery change
  jev_log   every TypeSafe/Jev request and response (for audit)
"""
from __future__ import annotations

import datetime as dt
import itertools
import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path

import yaml

from . import extract, paths

SCHEMA = """
CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  p_mastery REAL NOT NULL,
  n_obs INTEGER NOT NULL DEFAULT 0,
  stability_days REAL NOT NULL DEFAULT 1.0,
  last_practiced TEXT,
  next_review TEXT,
  source TEXT NOT NULL DEFAULT 'prior',
  placed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS packets (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  round INTEGER,
  created TEXT NOT NULL,
  pdf TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  meta TEXT
);
CREATE TABLE IF NOT EXISTS problems (
  id TEXT PRIMARY KEY,
  packet_id TEXT NOT NULL REFERENCES packets(id),
  number INTEGER NOT NULL,
  template TEXT NOT NULL,
  skill TEXT NOT NULL,
  data TEXT NOT NULL,
  info_gain REAL,
  UNIQUE(packet_id, number)
);
CREATE TABLE IF NOT EXISTS attempts (
  problem_id TEXT PRIMARY KEY REFERENCES problems(id),
  photo TEXT,
  transcript TEXT,
  stepcheck TEXT,
  evidence TEXT,
  correct INTEGER NOT NULL,
  credit REAL NOT NULL,
  graded_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id TEXT,
  skill TEXT NOT NULL,
  before REAL,
  after REAL,
  reason TEXT,
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id TEXT NOT NULL REFERENCES problems(id),
  line INTEGER,
  question TEXT NOT NULL,
  reply TEXT NOT NULL,
  status TEXT NOT NULL,
  detail TEXT,
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jev_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purpose TEXT NOT NULL,
  request TEXT NOT NULL,
  response TEXT,
  at TEXT NOT NULL
);
"""


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def config() -> dict:
    """config.yaml, with the active course's `course_overrides` merged in."""
    cfg = yaml.safe_load(paths.CONFIG_YAML.read_text(encoding="utf-8"))
    over = (cfg.get("course_overrides") or {}).get(paths.course()) or {}
    for sec, vals in over.items():
        cfg[sec] = {**cfg.get(sec, {}), **vals} if isinstance(vals, dict) else vals
    return cfg


class LearnerDB:
    def __init__(self, path: Path | None = None):
        self.path = Path(path or paths.DB_PATH)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(self.path)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)
        cols = {r["name"] for r in self.conn.execute("PRAGMA table_info(skills)")}
        if "placed" not in cols:  # databases from before the minimum-practice rule
            self.conn.execute("ALTER TABLE skills ADD COLUMN placed INTEGER NOT NULL DEFAULT 0")
            self.conn.commit()
        self._seed_skills()

    @contextmanager
    def tx(self):
        try:
            yield self.conn
            self.conn.commit()
        except Exception:
            self.conn.rollback()
            raise

    def _seed_skills(self) -> None:
        """Start every skill at the diagnostic's graph-structured prior marginal, so the
        first diagnostic update moves mastery only because of evidence."""
        have = {r["id"] for r in self.conn.execute("SELECT id FROM skills")}
        missing = [sid for sid in extract.skills() if sid not in have]
        if not missing:
            return
        from . import diagnostic  # local: diagnostic imports this module

        prior = diagnostic.marginals(*diagnostic.prior_particles())
        with self.tx() as c:
            for sid in missing:
                c.execute("INSERT INTO skills (id, p_mastery) VALUES (?, ?)", (sid, prior[sid]))

    # ---------------- skills ----------------
    def mastery(self) -> dict[str, float]:
        return {r["id"]: r["p_mastery"] for r in self.conn.execute("SELECT id, p_mastery FROM skills")}

    def skill_rows(self) -> list[sqlite3.Row]:
        return list(self.conn.execute("SELECT * FROM skills"))

    def set_mastery(self, values: dict[str, float], reason: str, problem_id: str | None = None,
                    source: str | None = None) -> None:
        with self.tx() as c:
            for sid, p in values.items():
                before = c.execute("SELECT p_mastery FROM skills WHERE id=?", (sid,)).fetchone()[0]
                c.execute("UPDATE skills SET p_mastery=?, source=COALESCE(?, source) WHERE id=?",
                          (float(p), source, sid))
                c.execute("INSERT INTO updates (problem_id, skill, before, after, reason, at) VALUES (?,?,?,?,?,?)",
                          (problem_id, sid, before, float(p), reason, now()))

    # ---------------- packets/problems ----------------
    def add_packet(self, pid: str, kind: str, round_: int | None, meta: dict) -> None:
        with self.tx() as c:
            c.execute("INSERT INTO packets (id, kind, round, created, meta) VALUES (?,?,?,?,?)",
                      (pid, kind, round_, now(), json.dumps(meta)))

    def set_packet_pdf(self, pid: str, pdf: str) -> None:
        with self.tx() as c:
            c.execute("UPDATE packets SET pdf=? WHERE id=?", (pdf, pid))

    def add_problem(self, packet_id: str, number: int, problem: dict, info_gain: float | None = None) -> str:
        prid = f"{packet_id}-{number:02d}"
        with self.tx() as c:
            c.execute("INSERT INTO problems (id, packet_id, number, template, skill, data, info_gain) VALUES (?,?,?,?,?,?,?)",
                      (prid, packet_id, number, problem["template"], problem["skill"], json.dumps(problem), info_gain))
        return prid

    def packets(self, kind: str | None = None) -> list[sqlite3.Row]:
        q = "SELECT * FROM packets" + (" WHERE kind=?" if kind else "") + " ORDER BY created, id"
        return list(self.conn.execute(q, (kind,) if kind else ()))

    def packet(self, pid: str):
        return self.conn.execute("SELECT * FROM packets WHERE id=?", (pid,)).fetchone()

    def problems(self, packet_id: str) -> list[dict]:
        rows = self.conn.execute("SELECT * FROM problems WHERE packet_id=? ORDER BY number", (packet_id,))
        return [dict(r) | {"data": json.loads(r["data"])} for r in rows]

    def problem(self, prid: str) -> dict | None:
        r = self.conn.execute("SELECT * FROM problems WHERE id=?", (prid,)).fetchone()
        return dict(r) | {"data": json.loads(r["data"])} if r else None

    def open_packet(self) -> sqlite3.Row | None:
        return self.conn.execute("SELECT * FROM packets WHERE status='open' ORDER BY created DESC, id DESC LIMIT 1").fetchone()

    def attempts(self, packet_kind: str | None = None) -> list[dict]:
        q = ("SELECT a.*, p.data AS pdata, p.packet_id, k.kind FROM attempts a JOIN problems p ON p.id=a.problem_id "
             "JOIN packets k ON k.id=p.packet_id")
        rows = self.conn.execute(q + (" WHERE k.kind=?" if packet_kind else "") + " ORDER BY a.graded_at",
                                 (packet_kind,) if packet_kind else ())
        return [dict(r) | {"pdata": json.loads(r["pdata"]),
                           "evidence": json.loads(r["evidence"]) if r["evidence"] else None} for r in rows]

    def attempt(self, prid: str) -> dict | None:
        r = self.conn.execute("SELECT * FROM attempts WHERE problem_id=?", (prid,)).fetchone()
        if r is None:
            return None
        d = dict(r)
        for k in ("transcript", "stepcheck", "evidence"):
            d[k] = json.loads(d[k]) if d[k] else None
        return d

    def recheck(self, prid: str) -> dict:
        """Re-run the SymPy check on a stored transcript with the current grader.

        Diagnostic answers only: the diagnostic belief is recomputed from all stored
        answers, so correcting one answer is exact. (Lesson updates are sequential,
        so they are not rewritten.)
        """
        from . import diagnostic, stepcheck
        from .pipeline import credit_from

        prob, att = self.problem(prid), self.attempt(prid)
        if prob is None or att is None:
            raise KeyError(prid)
        if self.packet(prob["packet_id"])["kind"] != "diagnostic":
            return {"changed": False, "note": "Only diagnostic answers can be rechecked."}
        tp = att["transcript"]
        if not tp:
            return {"changed": False, "note": "No transcript stored for this problem."}
        check = stepcheck.check(tp, prob["data"]["key"])
        decision = (att["evidence"] or {}).get("decision") or {}
        if decision.get("manual") or "attempts" not in decision:
            decision = {"attempts": 1, "substeps_written_fraction": 1.0, "strategy": "unsure"} | decision
        credit = credit_from(check, decision, prob["data"]["strategies"])
        before = {"correct": bool(att["correct"]), "credit": att["credit"]}
        if bool(check["final_correct"]) == before["correct"] and abs(credit - before["credit"]) < 1e-9:
            return {"changed": False, "correct": before["correct"], "note": check["final_note"]}
        with self.tx() as c:
            c.execute("UPDATE attempts SET correct=?, credit=?, stepcheck=? WHERE problem_id=?",
                      (int(bool(check["final_correct"])), credit, json.dumps(check), prid))
        post = diagnostic.posterior_marginals(self)
        self.set_mastery(post, f"recheck {prid}: correct {before['correct']} -> {check['final_correct']}", prid,
                         source="diagnostic")
        self.mark_placed(post)
        return {"changed": True, "before": before, "correct": bool(check["final_correct"]), "credit": credit,
                "note": check["final_note"]}

    def add_question(self, prid: str, line: int | None, question: str, result: dict) -> int:
        with self.tx() as c:
            cur = c.execute("INSERT INTO questions (problem_id, line, question, reply, status, detail, at) VALUES (?,?,?,?,?,?,?)",
                            (prid, line, question, result["reply"], result["status"], json.dumps(result), now()))
            return cur.lastrowid

    def questions(self, prid: str | None = None) -> list[dict]:
        q = "SELECT * FROM questions" + (" WHERE problem_id=?" if prid else "") + " ORDER BY id"
        return [dict(r) | {"detail": json.loads(r["detail"] or "{}")} for r in self.conn.execute(q, (prid,) if prid else ())]

    def is_graded(self, prid: str) -> bool:
        return self.conn.execute("SELECT 1 FROM attempts WHERE problem_id=?", (prid,)).fetchone() is not None

    def close_packet_if_done(self, pid: str) -> bool:
        n = self.conn.execute("SELECT COUNT(*) FROM problems WHERE packet_id=?", (pid,)).fetchone()[0]
        g = self.conn.execute("SELECT COUNT(*) FROM attempts a JOIN problems p ON p.id=a.problem_id WHERE p.packet_id=?",
                              (pid,)).fetchone()[0]
        if n and g >= n:
            with self.tx() as c:
                c.execute("UPDATE packets SET status='graded' WHERE id=?", (pid,))
            return True
        return False

    def log_jev(self, purpose: str, request: dict, response: dict | None) -> None:
        with self.tx() as c:
            c.execute("INSERT INTO jev_log (purpose, request, response, at) VALUES (?,?,?,?)",
                      (purpose, json.dumps(request, default=str), json.dumps(response, default=str), now()))

    # ---------------- the once-per-problem update ----------------
    def record_attempt(self, problem: dict, outcome: dict) -> dict:
        """Record a graded problem and update the learner model exactly once.

        `outcome` has: correct (bool), credit (0..1), misconception_root
        (skill id or None), photo, transcript, stepcheck, evidence.
        Returns {skill: (before, after)}.
        """
        prid = problem["id"]
        if self.is_graded(prid):
            raise AlreadyGraded(prid)
        packet = self.packet(problem["packet_id"])
        changes: dict = {}
        with self.tx() as c:
            c.execute("INSERT INTO attempts (problem_id, photo, transcript, stepcheck, evidence, correct, credit, graded_at) "
                      "VALUES (?,?,?,?,?,?,?,?)",
                      (prid, outcome.get("photo"), json.dumps(outcome.get("transcript")), json.dumps(outcome.get("stepcheck")),
                       json.dumps(outcome.get("evidence")), int(bool(outcome["correct"])), float(outcome["credit"]), now()))
        if packet["kind"] == "diagnostic":
            from . import diagnostic  # the diagnostic posterior is recomputed from all attempts
            post = diagnostic.posterior_marginals(self)
            before = self.mastery()
            self.set_mastery(post, "diagnostic posterior", prid, source="diagnostic")
            self.mark_placed(post)
            changes = {k: (before[k], post[k]) for k in post if abs(before[k] - post[k]) > 1e-4}
        else:
            changes = self._bkt_update(problem, outcome)
        self.close_packet_if_done(problem["packet_id"])
        return changes

    def _bkt_update(self, problem: dict, outcome: dict) -> dict:
        cfg = config()["learner"]
        pol = config()["evidence_policy"]
        data = problem["data"]
        from .templates import REGISTRY
        guess = REGISTRY[data["template"]].guess
        req = list(data["requires"])
        root = outcome.get("misconception_root")
        involved = req + ([root] if root and root not in req else [])
        m = self.mastery()
        c = float(outcome["credit"])
        slip = cfg["slip"]
        # exact posterior over the involved skills (independent priors from the marginals)
        post = {s: 0.0 for s in involved}
        z = 0.0
        for bits in itertools.product([0, 1], repeat=len(involved)):
            st = dict(zip(involved, bits))
            prior = 1.0
            for s in involved:
                prior *= m[s] if st[s] else 1 - m[s]
            p_correct = (1 - slip) if all(st[s] for s in req) else guess
            like = c * p_correct + (1 - c) * (1 - p_correct)
            if root:
                like *= pol["misconception_likelihood"] if st[root] else 1.0
            w = prior * like
            z += w
            for s in involved:
                post[s] += w * st[s]
        new = {s: post[s] / z for s in involved}
        # learning from the practice opportunity itself (main skill only)
        main = data["skill"]
        # foundations are usually relearned, not learned from scratch: they come back faster
        learn = cfg["learn_foundation"] if extract.skills()[main]["kind"] == "foundation" else cfg["learn"]
        new[main] = new[main] + (1 - new[main]) * learn * c
        self.set_mastery(new, f"problem {problem['id']} credit={c:.2f}" + (f" misconception root={root}" if root else ""),
                         problem["id"], source="practice")
        self._schedule(main, c)
        return {s: (m[s], new[s]) for s in involved}

    def _schedule(self, skill: str, credit: float) -> None:
        rv = config()["learner"]["review"]
        row = self.conn.execute("SELECT stability_days, n_obs FROM skills WHERE id=?", (skill,)).fetchone()
        stab = row["stability_days"]
        if credit >= rv["min_credit_for_growth"]:
            stab = min(rv["max_interval_days"], max(rv["first_interval_days"], stab * rv["growth"] * credit))
        else:
            stab = rv["first_interval_days"]
        t = dt.datetime.now(dt.timezone.utc)
        with self.tx() as c:
            c.execute("UPDATE skills SET stability_days=?, n_obs=n_obs+1, last_practiced=?, next_review=? WHERE id=?",
                      (stab, t.isoformat(timespec="seconds"), (t + dt.timedelta(days=stab)).isoformat(timespec="seconds"), skill))

    def mark_placed(self, post: dict[str, float]) -> None:
        """Skills the diagnostic places as mastered need no minimum practice to count as mastered."""
        thr = config()["learner"]["mastery_threshold"]
        with self.tx() as c:
            for sid, p in post.items():
                c.execute("UPDATE skills SET placed=? WHERE id=?", (int(p >= thr), sid))

    def mastered_set(self) -> set[str]:
        """Mastered: probability at the threshold, and either placed there by the diagnostic or
        practiced at least `min_practice_for_mastery` times (one right answer is not mastery)."""
        cfg = config()["learner"]
        thr, need = cfg["mastery_threshold"], cfg.get("min_practice_for_mastery", 1)
        # an untouched skill counts only once the diagnostic has spoken: a parent's starting point
        # (the prior) is a guess about where to begin, not evidence that anything is learned
        return {r["id"] for r in self.skill_rows()
                if r["p_mastery"] >= thr and (r["placed"] or (r["n_obs"] == 0 and r["source"] != "prior")
                                              or r["n_obs"] >= need)}

    def due_reviews(self, at: dt.datetime | None = None) -> list[str]:
        at = at or dt.datetime.now(dt.timezone.utc)
        done = self.mastered_set()
        out = []
        for r in self.skill_rows():
            if r["next_review"] and r["id"] in done and dt.datetime.fromisoformat(r["next_review"]) <= at:
                out.append(r["id"])
        return out

    def frontier(self) -> list[str]:
        """Unmastered skills whose prerequisites are all mastered, in graph order."""
        done = self.mastered_set()
        sk = extract.skills()
        return [s for s in extract.skill_order()
                if s not in done and all(p in done for p in sk[s]["prerequisites"])]


class AlreadyGraded(Exception):
    pass

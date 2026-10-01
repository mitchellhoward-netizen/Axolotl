"""Adaptive diagnostic: choose questions that split the remaining uncertainty over the skill graph.

Model. The learner's state is a binary mastery vector over all skills. The
prior respects the graph: a skill is likely mastered only if its
prerequisites are (config.yaml learner.prior). We represent the belief with
weighted particles (unique mastery vectors). A question requires a set of
skills (its template's q-vector); the response model is DINA:
P(correct) = 1 - slip if every required skill is mastered, else the
template's guess rate. Graded work gives a credit c in [0, 1]; the
likelihood of the observation is c*P(correct) + (1-c)*P(wrong). A
misconception identified by Jev multiplies in evidence against its root skill.

Selection. Answers are on paper, so questions go out in printed rounds. Each
round is chosen greedily to maximise the mutual information between the
round's (unknown) answers and the learner state, I(Y_round; S) =
H(Y_round) - sum_j H(Y_j | S), computed exactly by enumerating the 2^k answer
patterns of the round. That is the expected reduction in entropy of the belief
over the whole graph from grading the round.
"""
from __future__ import annotations

import math

import numpy as np

from . import extract, templates
from .learner import LearnerDB, config


def _cfg():
    return config()


def learner_prior(cfg: dict | None = None) -> dict:
    """The graph prior, shifted by the starting point chosen for this learner (profile.json)."""
    import json

    from . import paths

    cfg = cfg or _cfg()
    pr = dict(cfg["learner"]["prior"])
    prof = paths.learner_dir() / "profile.json"
    if prof.exists():
        try:
            start = json.loads(prof.read_text(encoding="utf-8")).get("start")
        except ValueError:
            start = None
        sp_ = cfg.get("starting_points", {}).get(paths.course(), {}).get(start or "", {})
        pr.update(sp_.get("prior", {}))
    return pr


def skill_index() -> tuple[list[str], dict[str, int]]:
    order = extract.skill_order()
    return order, {s: i for i, s in enumerate(order)}


def prior_particles(n: int | None = None, seed: int | None = None) -> tuple[np.ndarray, np.ndarray]:
    cfg = _cfg()
    n = n or cfg["diagnostic"]["particles"]
    seed = cfg["diagnostic"]["seed"] if seed is None else seed
    pr = learner_prior(cfg)
    order, idx = skill_index()
    sk = extract.skills()
    rng = np.random.default_rng(seed)
    S = np.zeros((n, len(order)), dtype=bool)
    for j, s in enumerate(order):
        pre = [idx[p] for p in sk[s]["prerequisites"]]
        ok = S[:, pre].all(axis=1) if pre else np.ones(n, dtype=bool)
        p = np.where(ok, pr[sk[s]["kind"]], pr["prerequisites_missing"])
        S[:, j] = rng.random(n) < p
    uniq, counts = np.unique(S, axis=0, return_counts=True)
    return uniq, counts / counts.sum()


def p_correct(S: np.ndarray, requires: list[str], guess: float, slip: float) -> np.ndarray:
    _, idx = skill_index()
    cols = [idx[s] for s in requires]
    ok = S[:, cols].all(axis=1)
    return np.where(ok, 1 - slip, guess)


def evidence(db: LearnerDB) -> list[dict]:
    out = []
    for a in db.attempts("diagnostic"):
        d = a["pdata"]
        ev = a["evidence"] or {}
        out.append({"requires": d["requires"], "guess": templates.REGISTRY[d["template"]].guess,
                    "credit": a["credit"], "root": (ev.get("decision") or {}).get("misconception_root")})
    return out


def posterior(db: LearnerDB) -> tuple[np.ndarray, np.ndarray]:
    S, w = prior_particles()
    slip = _cfg()["learner"]["slip"]
    pen = _cfg()["evidence_policy"]["misconception_likelihood"]
    _, idx = skill_index()
    logw = np.log(w)
    for e in evidence(db):
        pc = p_correct(S, e["requires"], e["guess"], slip)
        logw += np.log(e["credit"] * pc + (1 - e["credit"]) * (1 - pc))
        if e["root"]:
            logw += np.log(np.where(S[:, idx[e["root"]]], pen, 1.0))
    logw -= logw.max()
    w = np.exp(logw)
    return S, w / w.sum()


def marginals(S: np.ndarray, w: np.ndarray) -> dict[str, float]:
    order, _ = skill_index()
    m = (S * w[:, None]).sum(axis=0)
    return {s: float(np.clip(m[i], 1e-4, 1 - 1e-4)) for i, s in enumerate(order)}


def posterior_marginals(db: LearnerDB) -> dict[str, float]:
    return marginals(*posterior(db))


def h2(p):
    p = np.clip(p, 1e-12, 1 - 1e-12)
    return -(p * np.log2(p) + (1 - p) * np.log2(1 - p))


def entropy_report(S, w) -> dict:
    m = np.array(list(marginals(S, w).values()))
    nz = w[w > 0]
    return {"joint_bits": float(-(nz * np.log2(nz)).sum()), "sum_marginal_bits": float(h2(m).sum()),
            "max_marginal_bits": float(h2(m).max())}


def ok_column(S: np.ndarray, requires: list[str]) -> np.ndarray:
    """For each particle: are all the skills an item requires mastered?"""
    _, idx = skill_index()
    return S[:, [idx[s] for s in requires]].all(axis=1)


def batch_mi(S, w, items: list[dict], slip: float, ok_cache: dict | None = None) -> float:
    """Exact I(Y_batch; S) for a batch of conditionally independent binary items.

    Under DINA an item's correctness probability is one of two values (1 - slip or guess),
    so a particle's pattern over the batch is a bit pattern: particles are collapsed by an
    integer code (fast), not by comparing float rows."""
    if not items:
        return 0.0
    cols = []
    for it in items:
        key = it.get("template") or tuple(it["requires"])
        if ok_cache is not None and key in ok_cache:
            cols.append(ok_cache[key])
        else:
            c = ok_column(S, it["requires"])
            if ok_cache is not None:
                ok_cache[key] = c
            cols.append(c)
    OK = np.stack(cols, axis=1)
    k = OK.shape[1]
    codes = OK.astype(np.int64) @ (np.int64(1) << np.arange(k, dtype=np.int64))
    uniq, inv = np.unique(codes, return_inverse=True)
    W = np.bincount(inv.ravel(), weights=w, minlength=len(uniq))
    bits = ((uniq[:, None] >> np.arange(k)) & 1).astype(bool)
    guess = np.array([it["guess"] for it in items])
    pats = np.where(bits, 1 - slip, guess[None, :])
    Y = ((np.arange(2 ** k)[:, None] >> np.arange(k)[None, :]) & 1).astype(float)  # 2^k x k
    lp = np.clip(pats, 1e-12, 1 - 1e-12)
    logp = Y @ np.log(lp).T + (1 - Y) @ np.log(1 - lp).T  # 2^k x npat
    py = np.exp(logp) @ W
    py = py[py > 0]
    h_y = float(-(py * np.log2(py)).sum())
    h_y_given_s = float((W[:, None] * h2(pats)).sum())
    return h_y - h_y_given_s


def used_templates(db: LearnerDB) -> set[str]:
    return {p["template"] for pk in db.packets("diagnostic") for p in db.problems(pk["id"])}


def next_round(db: LearnerDB) -> dict | None:
    """Pick the next printed round. Returns None when the diagnostic is finished."""
    cfg = _cfg()["diagnostic"]
    rounds = db.packets("diagnostic")
    if any(r["status"] == "open" for r in rounds):
        raise RuntimeError("the previous diagnostic round has not been graded yet")
    asked = sum(len(db.problems(r["id"])) for r in rounds)
    S, w = posterior(db)
    rep = entropy_report(S, w)
    if asked >= cfg["max_questions"]:
        return None
    if asked >= cfg["min_questions"] and rep["max_marginal_bits"] <= cfg["stop_max_marginal_entropy_bits"]:
        return None
    size = cfg["round_sizes"][min(len(rounds), len(cfg["round_sizes"]) - 1)]
    size = min(size, cfg["max_questions"] - asked)
    slip = _cfg()["learner"]["slip"]
    used = used_templates(db)
    cands = []
    for tid, tpl in templates.for_course().items():
        if tid in used:
            continue
        cands.append({"template": tid, "requires": tpl.requires, "guess": tpl.guess})
    chosen: list[dict] = []
    gains = []
    base = 0.0
    cache: dict = {}
    for _ in range(min(size, len(cands))):
        best, best_mi = None, -1.0
        for c in cands:
            if c in chosen:
                continue
            mi = batch_mi(S, w, chosen + [c], slip, cache)
            if mi > best_mi + 1e-12:
                best, best_mi = c, mi
        chosen.append(best)
        gains.append(best_mi - base)
        base = best_mi
    # print in graph order (foundations first) so the round reads like a worksheet
    order, idx = skill_index()
    paired = sorted(zip(chosen, gains), key=lambda cg: idx[templates.REGISTRY[cg[0]["template"]].skill])
    return {"round": len(rounds) + 1, "asked_before": asked, "entropy_before": rep,
            "expected_info_bits": base, "items": [{"template": c["template"], "gain_bits": g} for c, g in paired]}


def create_round(db: LearnerDB) -> str | None:
    plan = next_round(db)
    if plan is None:
        return None
    pid = f"D{plan['round']}"
    db.add_packet(pid, "diagnostic", plan["round"], {k: v for k, v in plan.items() if k != "items"})
    seed_base = _cfg()["diagnostic"]["seed"] + 101 * plan["round"]
    for n, it in enumerate(plan["items"], 1):
        p = templates.generate(it["template"], seed_base + n)
        db.add_problem(pid, n, p.to_json(), it["gain_bits"])
    return pid


def summary(db: LearnerDB) -> dict:
    S, w = posterior(db)
    return {"entropy": entropy_report(S, w), "marginals": marginals(S, w),
            "answered": len(evidence(db)),
            "asked": sum(len(db.problems(r["id"])) for r in db.packets("diagnostic"))}


def fmt_bits(b: float) -> str:
    return f"{b:.2f} bits" if not math.isnan(b) else "-"

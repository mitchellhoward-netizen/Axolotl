# Memory: Instinct (as reverse-engineered by supermemory) vs what we built

**What this is.** A technical diff between the memory system described in
[supermemory's teardown of Instinct](https://supermemory.ai/blog/reverse-engineering-instinct-memory/)
and the memory we actually have in this repo. **Documentation only — nothing here is implemented,
and no recommendation below should be acted on without the verification step named with it.**

**How to read the source.** The post is a **competitor teardown published by a memory vendor**
(supermemory), whose founder wrote it and who sells an alternative at the end. Credibility is not
uniform across it, so every claim below carries one of three labels:

- **[OBS]** — an observation the author reports making (probe results, file structures, commit
  messages). These are falsifiable and therefore the most useful part, even though we cannot
  independently reproduce them.
- **[INF]** — the author's inference, often explicitly hedged (`"likely"`, `"I'm assuming"`,
  `"mechanism unknown"`).
- **[MKT]** — vendor claim or positioning, including everything about supermemory itself.

The author's own caveat is worth keeping in view: *"We reconstructed this by a lot of probing… Most
of it should be correct, but because I haven't seen their code, some things may be wrong."*

---

## 1. What the post says Instinct does

**Storage.** Memory is **git-tracked markdown files on a filesystem** [OBS]. Folders:
`entities/people`, `entities/orgs`, `knowledge/facts`, `knowledge/preferences`,
`knowledge/decisions`, `comms/phone`, `timeline/daily`, `timeline/weekly`, `workstreams/active`,
`workstreams/completed` [OBS]. Files have front-matter with `id`, `type`, `aliases`, then prose and
bullets; facts are list items with dates in the text; `[[links]]` connect records by id [OBS]. Types
seen: preference, person, organization, conversation [OBS]. The author notes "a lot of redundant,
stale or duplicate information" and guesses that redundancy helps retrieval [OBS + INF].

**Injected per turn.** An identity profile (name, timezone, email — tiny), a **memory one-pager**
(~4,250 tokens: life context, autonomy calibration, channel communication style), an **active todo
board** (~25 pending / 7 in progress), a **compaction recap** (~8,750 tokens of anchors, open loops,
identifiers, completed work), and a session id [OBS]. That is roughly **13k tokens of memory injected
on every turn** before any tool call.

**Retrieval is grep, not vectors.** [OBS] The author states plainly: *"There's no vector indexing, or
BM25 search… Instinct quite literally just uses keyword matching / grep-style queries."* The
`aliases` field exists precisely so records surface under different words. The probe table is the
sharpest evidence in the post:

| Query | Result |
|---|---|
| `pasta` | Dining ranked first |
| `takeout` | Dining ranked first |
| `Italian noodles I enjoy` | **No hits at limits 5 and 50** |
| `pazta` (typo) | **No hits** |
| Known person's name / `my gf` / `romantic partner` | Same person first |
| Person's name with an extra character | Same person first |

So: **literal token matching, extended by hand-curated aliases.** Semantic paraphrase fails;
approximate spelling fails; aliases carry the load.

**Writing.** A **background process** does the consolidation, on a cycle of roughly **24 hours**
[INF — inferred from a single 23h16m lag between a message and its commit]. The answering agent's
memory is **read-only** [OBS] — the author calls this a deliberate belief of his. Revision commits
move temporary detail into workstreams, compress and generalize, remove incidentals, and replace
wrong facts with dated corrections [OBS from commit messages]. Old versions remain in **git history**
and are recoverable "only if the model explicitly looks for older versions" [OBS + INF].

**Forgetting is not automatic.** In the author's words: *"Instinct does forget things based on when
the ingestion runs, but this is not 'automatic' right now."* An explicit "this is not happening" gets
forgotten; a transient ("I have exams this weekend") remains until a model removes it [OBS].

**Their own scorecard** [OBS, "vibe test"]: single-fact recall ✅, temporal ✅, update/contradiction ✅,
abstention ✅, multi-hop **weak**, forgetting **partial**, >1M tokens **untested**, procedural/skill
memory **absent**, implicit personalization **absent**, multimodal **weak**, write-side cost
"likely expensive, but untestable".

**The pitch** [MKT]: supermemory offers profiles + buckets, automatic dreaming/forgetting, and a
~60-line integration; "much cheaper… much faster"; "always fresh"; old versions included
automatically. No benchmarks are given for any of those claims in this post.

---

## 2. What we actually built

| Component | Where | What it is |
|---|---|---|
| Raw conversation | `message` table (`db/conversation.sql`), `src/integrations/conversation-store.ts`, `src/agent/memory.ts` | One row per message, verbatim `content`, `role`, `created_at`, keyed by conversation. Rehydrated on first touch; **the full thread is held in process memory** and searched there. |
| Recall tool | `recall_history` (`src/agent/tools.ts:611`, implementation `src/agent/agent.ts:1344`) | **Case-insensitive substring match** (`content.toLowerCase().includes(q)`) over the full in-memory history, last 6 hits, 260 chars each. |
| Family memory | `src/integrations/family-memory.ts`, `memory jsonb` on `family_memory` | Curated buckets per family: `needs`, `getting`, `initiatives`, `issueSummary`, `notes`. Written by tools (`record_getting`, `start_initiative`, `set_initiative_status`) **from the conversation**. |
| Personal facts & cases | `src/domain/personal-context.ts` | Facts with `source {kind: person_report\|school_profile, messageId, observedAt}`, `supersedes`, `validUntil`; limits 500 facts / 100 cases. Cases are DAG-shaped steps (`dependsOn`), and completion requires a task outcome **with reference and evidence**; `reported_done` is a distinct state from `completed`. |
| Per-turn injection | `src/agent/personal.ts:75` `personalModelContext` | Query-scored selection: tokenize the inbound text, score facts/cases/tasks by word overlap, take top 30/5/10, **report `omitted` counts**, last 12 history messages (1,500 chars each, truncation flagged). |
| Belief over unknowns | `src/agent/intention.ts` | `FamilyUnknown{dimension, known, decisionFlip, sensitive, askPrompt}` — structured ignorance with an information-gain policy and `ask`/`research`/`commit`/`handoff` as first-class actions; sensitive dimensions (housing/residency) are handed off rather than interrogated. |
| District knowledge | `src/knowledge/graph.ts`, `db/embedding.sql`, `src/integrations/embeddings.ts` | Per-**district** nodes: category, summary, sources, jurisdiction, `law`, `status: draft\|verified`, `confidence`, `lastVerifiedAt`. **pgvector cosine search** (`match_knowledge` RPC) with keyword/category fallback. |
| Form knowledge | `src/integrations/form-targets.ts`, `form-recipes.ts` | Learned per school/program; recorded **only from a verified success**. |
| Procedural memory | `src/agent/skills.ts`, `db/skills.sql` | Skills with TTL-based staleness (`isSkillStale`), `distillSkill`, `verifySkillLeaves`. |
| Deletion | `src/integrations/identity.ts` `deleteFamilyData` | Revokes vendor portal profiles first, then deletes across connection, incoming_email, family_inbox, gmail_token, family_memory, case_record, family_profile, message, verification, child_link, orphaned students, guardian; writes one audit/suppression row. |
| Retention | `docs/PRIVACY-AND-COMPLIANCE.md` §3, `scripts/prune-retention.ts` | Messages **90 days**, triaged email **60 days**, consent audit **7 years**, no browser recordings; provider abuse copies explicitly **not deletable by us**. |

---

## 3. The diff, by dimension

### 3.1 What is stored

**Theirs** [OBS]: synthesized artifacts are the primary memory — a typed-ish set of markdown records
(people, orgs, facts, preferences, decisions, digests, timelines, workstreams) plus a derived
one-pager, a todo board and a compaction recap. Git is the version store.

**Ours**: raw conversation is the substrate (verbatim, 90 days), plus a small number of **typed**
stores — curated family buckets, provenance-bearing personal facts and cases, per-district knowledge
nodes, form knowledge, skills.

**Who is ahead.** Different things. They are ahead on *synthesis*: the artifact a human or a model
reads is already the distilled thing. We are ahead on *structure*: enums, foreign keys, RLS per
family, and per-row retention are all available to us and impossible to enforce on free-form files.

**Does it matter?** Yes, and mostly in their favour on read quality — the post's own observation that
redundancy and staleness accumulate is the cost we would also pay if we started synthesizing more.
But the structured substrate is not optional for us: it is what makes deletion, retention and
per-family isolation provable.

### 3.2 How it is extracted

**Theirs** [OBS + INF]: a **background consolidation process** on a ~24h cycle reads the current
files and rewrites them — moving, compressing, generalizing, deleting, correcting. The answering
agent never writes memory. The one-pager's generator, prompt, scheduling and conflict handling are
**unknown** to the author.

**Ours**: **the conversational agent writes**, during the turn, through schema-validated tools
(`record_getting`, `start_initiative`, `save_profile`, plan/`rememberFact`). The one exception is the
one-time `importSchoolContext`. **We have no background consolidation pass and no compaction recap.**

**Who is ahead.** **They are**, clearly and by design. Their architecture puts synthesis out of band;
ours relies on the model choosing to record something during a conversation, which is exactly how
incidental or duplicated bucket entries appear.

**Does it matter?** Yes — this is the most stealable idea in the post (see §4.2). It is also the one
that needs the most care with us, because a background writer must never create consent-relevant
state or trigger an action.

### 3.3 How it is retrieved

**Theirs** [OBS]: grep/`ls`/`git` tools over the filesystem, plus a profile injected up front that
doubles as an index. No vectors, no BM25. Semantically-paraphrased queries return nothing.

**Ours**: three different paths, which is itself the finding:
- **Personal/conversation recall**: substring matching (`recall_history`), and query-scored word
  overlap for per-turn injection (`personalModelContext`). **The same failure mode as theirs** — an
  "Italian noodles I enjoy" query would return nothing, and we have no alias layer to save it.
- **District knowledge**: real vector search (`match_knowledge`) with keyword fallback — a capability
  their personal memory simply does not have, though it solves a different problem (shared district
  facts, not one family's history).
- **Structured stores**: direct reads (whole family-memory object; personal facts filtered by
  `personalView`).

**Who is ahead.** **They are, on personal recall** — not because grep beats substring (it doesn't
materially), but because **`aliases` gives every record a hand-curated synonym surface**, which is the
one thing our substring match lacks. A typo-tolerant or alias-driven match would have caught
"pazta" and "my gf" in their table; ours would fail both *and* fail the paraphrase.

**Does it matter?** Yes, directly. "Ask it again and it doesn't remember" is the single most visible
memory failure to a parent, and our weakest retrieval path is the one a parent hits most.

### 3.4 Provenance and attribution

**Theirs** [OBS + INF]: facts carry **dates in prose** ("stated on 2026-09-15"), records have ids and
`[[links]]`, and **git commits are the audit trail**. The post does not describe a source-kind,
confidence or verification model, and does not distinguish a person's report from a verified fact.

**Ours**: a typed provenance model — `source {kind: person_report | school_profile, messageId,
observedAt}` on every fact, `validUntil` for time-bounded facts, and on knowledge nodes
`status: draft|verified`, `confidence`, `lastVerifiedAt`; plus an explicit rule that a person report
is **never** promoted to verified eligibility, and that case completion requires a provider reference
and evidence (`caseProgress` in `personal-context.ts`).

**Who is ahead.** **Us, decisively**, and this is not close. Their dates-in-prose plus git history is
an audit substrate, not a provenance model; ours can answer "where did this come from, when, and is it
verified?" as a query.

**Does it matter?** It is the whole product. A liaison that says "your plan covers this" on the
strength of a parent's own earlier sentence is worse than one that says nothing, and our M6/M7
constraints in `docs/CAPABILITY-TRUTH-TABLE.md` exist precisely because that line is easy to cross.

### 3.5 Correction and supersession

**Theirs** [OBS]: reconciliation commits "replace incorrect facts with dated corrections"; old
information persists in git history and is only recovered if the model explicitly looks for it.

**Ours**: `supersedes` on facts, with **strict validation** — the correction must match the
superseded fact's subject *and* category, and a fact can only be superseded once (no chains). The
superseded fact stays for audit; `personalView` filters it out of what the model sees. Knowledge nodes
can flip `draft → verified` with a timestamp.

**Who is ahead.** Roughly even, with different trade-offs. Their git history is a stronger raw audit
substrate (you can diff any state); ours is **machine-enforced** — a model cannot rewrite history, it
can only append a correction that points at what it replaces.

**Does it matter?** Mildly, and ours is the safer default for a product where a wrong fact about a
child is consequential. Their recoverability is a nice property we get "for free" via the message
table anyway.

### 3.6 Cross-domain

**Theirs** [OBS]: one person's world in one namespace — people, orgs, preferences, decisions, comms,
timelines and workstreams, linked by id. This is genuinely cross-domain, and it is their main
architectural claim.

**Ours**: cross-domain **within** the life layer (`caseInput.domain: school | healthcare | benefits |
life`, one case spanning institutions), but the school path and the life path are **separate stores**,
and district knowledge is shared per-district rather than per-family.

**Who is ahead.** **They are, on unification.** We have the capability (a case can already span
school + health + benefits) but the storage is split, so a fact learned on one path is not
automatically visible to the other.

**Does it matter?** Yes for the product thesis — "one person, all their institutions" is the pitch —
but note this is exactly where our deliberate separation buys compliance (per-family RLS, per-table
retention). The right move is to **link** the stores, not to merge them.

### 3.7 Forgetting

**Theirs** [OBS, their words]: *"not 'automatic' right now"*; forgetting depends on ingestion timing;
transient facts persist until a model removes them; and **git history means old data is recoverable by
design**.

**Ours**: compliance-driven and **enforced** — 90-day messages, 60-day triaged email, 7-year consent
audit, `deleteFamilyData` across a dozen tables with vendor-side revocation first, a dry-by-default
pruning job, and a published schedule. With honest exceptions: provider abuse/safety copies we cannot
delete, and Skyvern artifacts with no delete API.

**Who is ahead.** **Us, definitively** — and here their architecture is not merely behind but
**disqualifying for our product**. A git-tracked markdown memory means a deletion request leaves the
data in history. Our capacity to say "it is gone, and here is the receipt" is a compliance
requirement, not a feature.

### 3.8 Privacy and the model boundary

**Theirs** [OBS + INF]: memory is read by the model each turn — profile + one-pager + todo board +
recap is on the order of **13k tokens of personal data per turn**, and the consolidation model reads
the files too. The post says nothing about retention, DPAs, deletion rights or where any of it is
processed.

**Ours**: messages go to Anthropic for replies; page content goes to OpenAI via Stagehand for the
browser tools. Crucially, **embeddings are used only for district knowledge** — the single embedding
call site in the agent is the knowledge query (`src/agent/agent.ts:1285`), and the indexer builds
`knowledge_node` rows — so **a family's own facts and messages are never embedded to a third party**.
That is a design choice with a cost: our personal recall is substring-based partly *because* we did not
send family data out to be embedded.

**Who is ahead.** **Us**, materially. The trade-off is explicit and worth naming: we bought privacy
and paid for it with recall quality. If semantic personal recall is ever wanted, it requires a
deliberate decision (self-hosted/local embeddings, or a de-identified query) — **not a default change
to `embeddings.ts`.**

### 3.9 Cost and latency at our scale

**Theirs**: ~13k tokens injected per turn plus tool-driven file reads; write-side cost "likely
expensive… exponentially more expensive" by their own admission, because the consolidator must read
current information to write more.

**Ours**: bounded window (last 30 messages) + on-demand tools; vector search when configured is one
embed call plus one RPC. But `recall_history` **linearly scans the entire conversation history held in
process memory**, and rehydration loads the whole thread — so both RAM and scan time grow without
bound across months of daily use.

**Who is ahead.** **They are, on steady-state predictability**, and this is a place where **we are
behind by accident rather than by choice**: their per-turn cost is roughly flat, ours grows with the
thread. Their ">1M tokens untested" caveat applies to us equally.

---

## 4. What we should steal

Ranked by value against effort and risk. **None of these is implemented.** Each names what must be
verified first.

### 4.1 Alias surface on memory records (highest value, lowest effort)
**What.** Attach an `aliases` list to family-memory entries and personal facts, and match queries
against aliases as well as content.
**Why.** Their probe table is the evidence that exact-token matching is the failure mode: `pasta` and
`takeout` hit, `Italian noodles I enjoy` and `pazta` do not. Our `recall_history` is substring-only,
so it fails *at least* as badly — and "it forgot what I told it" is the most visible memory failure to
a parent.
**Effort.** ~0.5–1 day (a column, a query change, tests).
**Consent/deletion.** Read-side only; no consent impact. A column on existing rows is automatically
covered by `deleteFamilyData`.
**Verify first.** Whether aliases should be *generated* (by a model) or *harvested* (from the parent's
own words). Generated aliases can drift and surface the wrong memory — for a child's record they need
the same provenance discipline as facts. **Recommendation: harvest the parent's own phrasing first;
treat generation as a separate, gated step.**

### 4.2 A background consolidation pass — our version of their ingestion
**What.** A periodic job that reads a family's recent messages plus their buckets and rewrites the
buckets: merge duplicates, generalize one-off detail, drop incidentals, keep corrections as new
facts.
**Why.** It is the single biggest quality gap. Today the *conversational* agent decides what to
remember, mid-turn, which is how buckets accumulate noise; theirs is out of band and the answering
agent never writes.
**Effort.** 2–4 days (job, prompt, tests, and a dry-run mode in the shape of `prune-retention.ts`).
**Consent/deletion.** **Touches deletion**: any derived rows must be covered by `deleteFamilyData`,
and a consolidation pass must **never** create consent-relevant state or stage an action — it may only
rewrite memory. This is the change in this document with the largest blast radius.
**Verify first.** That their consolidator's conflict handling is actually good is **unknown** — the
author could not determine it. Treat the *shape* as proven and the *behaviour* as unverified.

### 4.3 A rolling recap artifact
**What.** A compact, periodically-written recap of anchors, open loops, exact identifiers and
completed work — their "compaction recap", ~8,750 tokens in their instance — replacing our
build-it-per-turn `stateSummary`.
**Why.** Cheaper prompts and better coherence in long threads; it is the artifact that most obviously
carries "what is going on" across months.
**Effort.** 1–2 days.
**Consent/deletion.** Read-side; must be deleted with the family. Low risk.
**Verify first.** Where the recap is written (they could not find its backing file) and what triggers
compaction (unknown). We would be inventing the schedule, not copying one.

### 4.4 Move memory writes behind a validating writer
**What.** Keep the answering agent from writing buckets directly; route writes through one
schema-validated writer (we already have the shape in `rememberFact`/`personal-context.ts`).
**Why.** Their "memory is read-only for the agent" posture is the reason their files stay coherent
enough to be worth consolidating; our tool-level writes are the source of the noise 4.2 would clean up.
**Effort.** ~1 day.
**Consent/deletion.** No consent impact; changes *who can create state*, which is worth care.

### 4.5 Semantic personal recall — **conditional, and probably not**
**What.** Embed family facts so paraphrase works ("the Italian place he likes").
**Why not yet.** It requires sending a child's data to an embedding vendor. We currently do not, and
that is a real privacy property, not an oversight. Their system does **not** do this either — grep plus
aliases is their whole answer — so we are not behind on it.
**If it is ever wanted**: local/self-hosted embeddings or a de-identified query path, as a separate
decision with the privacy consequence written down first.

---

## 5. What we should NOT copy

1. **Git-tracked markdown as the memory substrate.** [OBS] It is disqualifying for us: deletion must
   be real and provable, and git history means deleted data survives. It also cannot carry per-family
   RLS, typed retention windows, or per-row erasure. Their design optimises recoverability and human
   readability; ours must optimise erasure and isolation. Steal the *consolidation*, never the substrate.
2. **24-hour staleness.** [OBS/INF] Their own probe found a 2-day profile lag. Deadlines are our
   product; telling a parent about a form that closed yesterday is worse than saying nothing.
3. **Grep-only retrieval for everything.** Their own rubric marks multi-hop weak and semantic
   paraphrase fails outright. We already have vectors where they matter (shared district knowledge);
   uniformly dropping them would be a choice to be worse.
4. **~13k tokens of memory injected every turn.** Expensive, and it means a large volume of a child's
   personal data in every model call. Our bounded window plus on-demand retrieval is the better
   posture, and if we add a recap (4.3) it should be injected *selectively*, not wholesale.
5. **Probabilistic or "dreamed" forgetting.** Our deletion has to produce a receipt
   (`deleteFamilyData`'s audit row), not a best-effort rewrite. Automating forgetting without an audit
   trail would break the compliance promise in `docs/PRIVACY-AND-COMPLIANCE.md`.
6. **A single merged namespace for everything.** Their unification is attractive, but merging personal
   facts with shared district knowledge would destroy the isolation that makes our RLS and retention
   meaningful. Link across stores; do not collapse them.

---

## 6. What we cannot tell from the post

Stated as open questions, not conclusions:

1. **How the one-pager is actually generated.** The author could not find a backing file and does not
   know the prompt, model, schedule or conflict handling. So "updated daily" is [INF].
2. **Whether ingestion is a cron or volume-triggered.** Inferred from a single 23h16m datapoint.
3. **What the compaction recap is built from** and what the token threshold for compaction is.
4. **How conflicts between old and new facts are resolved** — "dated corrections" is inferred from
   commit messages, not observed behaviour.
5. **Whether git history is retained indefinitely** or garbage-collected. The author assumes old
   versions "can remain".
6. **Whether the injected token figures are measured or estimated.** They are reported as sizes, not
   as measurements.
7. **What the answering model is.** "Likely an open-weights model" — explicitly unverified.
8. **Their write-side cost.** Their own rubric says "untestable", so the cost claim in the marketing
   section is unsupported.
9. **Anything about their retention, deletion, or privacy posture.** The post is silent, and for a
   system holding a person's life in files, that silence is notable rather than exculpatory.
10. **All supermemory comparisons** [MKT]: "much cheaper", "much faster", "always fresh", "automatic
    forgetting" — no benchmarks, no methodology, and the linked documentation is their own.

**A structural caution that survives all of the above:** their memory is **read-only for the answering
agent**, which is why a background pass can be the single writer. If we adopt 4.2 without 4.4, we would
have two writers and the noise problem would get worse, not better. **4.2 and 4.4 belong together.**

---

## Sources

- Post: <https://supermemory.ai/blog/reverse-engineering-instinct-memory/> (fetched 2026-09-21;
  vendor-published competitor teardown; claims labelled [OBS]/[INF]/[MKT] throughout).
- Repo files verified for this document: `src/agent/memory.ts`, `src/integrations/conversation-store.ts`,
  `db/conversation.sql`, `src/integrations/family-memory.ts`, `src/domain/personal-context.ts`,
  `src/agent/personal.ts`, `src/agent/intention.ts`, `src/agent/tools.ts` (`recall_history`, tools),
  `src/agent/agent.ts` (`recall` binding, knowledge vector query at :1285),
  `src/integrations/embeddings.ts`, `src/knowledge/graph.ts`, `src/integrations/form-targets.ts`,
  `src/agent/skills.ts`, `src/integrations/identity.ts` (`deleteFamilyData`),
  `src/integrations/dedupe.ts`, `scripts/prune-retention.ts`, `docs/ONTOLOGY.md`,
  `docs/CAPABILITY-TRUTH-TABLE.md`, `docs/PRIVACY-AND-COMPLIANCE.md`.
- Related earlier work: `docs/COMPUTER-USE-SOTA.md` (browser-agent state of the art),
  `docs/PRIVACY-AND-COMPLIANCE.md` (provider retention and the deletion limits).

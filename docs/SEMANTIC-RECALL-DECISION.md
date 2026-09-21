# Semantic personal recall — the decision

**Status: open. Nothing here is implemented.** This is a decision document for a founder, not a design.

---

## 1. The property at stake — and the correction that matters

`docs/MEMORY-COMPARISON.md` says our personal recall is substring-based and that **we never embed
family data**. The first half is right. **The second half is wrong in the way that matters**, and I
verified it rather than assuming it.

**What is true, verified:**

- `src/integrations/embeddings.ts` embeds through an **OpenAI-compatible endpoint**, and in production
  it is pointed at **Voyage AI** — `EMBEDDINGS_BASE_URL=https://api.voyageai.com/v1/embeddings`,
  `EMBEDDINGS_MODEL=voyage-3`, `EMBEDDINGS_API_KEY` set. `embeddingsConfigured()` therefore returns
  **true**, so vector retrieval is live, not dormant.
- There is exactly one call site in the agent: `src/agent/agent.ts:1284`, inside the district-knowledge
  lookup, which embeds `qText = (query ?? category ?? '').trim()` — **the query derived from what the
  parent asked** — and searches `knowledge_node` by vector.
- Stored family records (messages, facts, cases, family memory) are **not** embedded. Personal recall
  is a substring scan (`recall_history`). That part of the claim stands.

**So the honest statement of today's boundary is not "family data never reaches an embedding vendor."**
It is: *we do not embed stored family records, and we do send the parent's question to a third-party
embeddings vendor whenever the agent looks up school or district knowledge.*

Two consequences, both worth acting on regardless of how this decision goes:

1. **Voyage AI is not on our subprocessor list.** `docs/PRIVACY-AND-COMPLIANCE.md` §7 names Anthropic,
   OpenAI, Skyvern, Browserbase, Tavily, Resend, Google, Retell, Supabase, Railway and Vercel. Voyage
   is missing, and it receives parent-derived text. That is a disclosure gap, and it is the kind of
   thing a district questionnaire finds. **It needs a listing and a DPA whether or not we ever add
   semantic personal recall.**
2. **The query is the sensitive part, not the corpus.** District knowledge is researched, largely
   public information. The query is a parent's own words, and it can carry a child's name, a grade, a
   diagnosis, or a family circumstance: *"does my son Leo, who has an IEP, get a bus?"* The privacy
   property we thought we had is thinner than the earlier document implies.

---

## 2. The three options, honestly costed

### (a) No semantic personal recall — keep substring, add the alias layer

**What it costs:** nothing. Read-side only, ~half a day for the alias surface `MEMORY-COMPARISON.md`
recommends, no new subprocessor, no new disclosure, no change to `deleteFamilyData`.

**What stays broken:** a parent who said *"Italian noodles I enjoy"* cannot find it by typing
*"pasta"*; a record phrased in their own words is findable only in those words. And the second, worse
problem is unchanged: `recall_history` scans a history held entirely in RAM, so both memory and scan
time grow with the life of the account.

**Why this might be good enough:** recall failures are visible and recoverable — the parent rephrases,
or the agent asks. The cost of the failure is one awkward turn. The cost of the alternatives is a new
processor holding children's data.

### (b) Local / self-hosted embeddings

Family text is embedded on our own infrastructure and never leaves it.

**What it actually takes:** a second service (an embedding model served somewhere we control), because
Railway runs the agent and would not comfortably host a model. That is a new deployment, a new thing to
keep alive, and a new failure mode in the path that answers parents. Money is modest at small scale,
but the ops load is not zero: a stalled embedder degrades the product, and a degraded embedder that
silently returns `null` is exactly how `embeddings.ts` already fails (it returns `null` on any error
and the caller falls back — safe, but invisible).

**Quality, honestly:** short, messy, personal fragments are a *worse* case for embeddings than
documents are. *"the noodles place near the school"* carries almost no signal a small local model can
place well, and the win over a good alias layer is likely much smaller than it sounds. I would not
promise a step change here without measuring it on real parent phrasing.

**The deeper win is not recall quality, it is the property:** nothing leaves, so the honest sentence
to a parent becomes true and stays true.

### (c) Hosted embeddings with a de-identified or minimised query

**Be blunt: for personal recall, this is largely theatre.** The query *is* the personal content. You
cannot strip *"what did I say about Leo's noodles"* into something non-identifying and still retrieve
by meaning — once you remove the names, the places and the specifics, what remains is close to a
keyword, and you have rebuilt search with extra steps and a new processor.

There is a narrower version that is not theatre: **embed the query locally, embed documents hosted.**
That keeps the parent's words on our infrastructure while sending only stored text out. It costs the
complexity of two embedding paths and it does not fix the document-side exposure — the stored records
still have to be embedded somewhere.

**And de-identification has a formal requirement attached:** under Cal. Civ. Code § 1798.140(m),
calling data de-identified requires reasonable measures, a **public commitment** not to re-identify,
and **contractual flow-down**. It is a claim we would have to be able to prove, not a technique we
could assert.

---

## 3. Recommendation

**Take (a) now, and fix the disclosure gap in parallel.** Specifically:

1. **Add Voyage AI to the subprocessor list and get a DPA.** It is already receiving parent-derived
   text today. This is not optional and it is not part of the semantic-recall decision — it is
   correcting a statement we are currently making that is not true.
2. **Consider whether the district query needs the parent's raw phrasing at all.** A cheaper
   mitigation than any of the three options: the knowledge lookup could send the *category* and the
   *district*, not the parent's sentence. It already accepts a category; the query is the richer path.
   If the category is sufficient for the common cases, we remove the exposure without losing much.
3. **Then take (a)**: substring plus aliases, and treat the unbounded in-memory history as the real
   bug in personal recall — it is a scaling defect, not a feature gap.
4. **Revisit (b) when there is a measured reason.** The trigger I would write down: **if we can show a
   recall failure rate that costs parents real turns** — instrument the alias layer, log when recall
   returns nothing but the parent's next message suggests they expected a hit, and let the number
   decide. The other legitimate trigger is a buyer: a district or employer that requires the capability
   and will pay for the infrastructure.

**The single fact that most changes this decision:** we are already sending parent-derived text to an
embedding vendor we do not disclose. Once that is fixed, the question becomes a clean one — *do we
want to send more of a child's life to a processor, in exchange for better search?* — and I would want
a measured failure rate before answering yes.

---

## 4. What we would have to disclose if we chose (b) or (c)

- **Privacy policy:** a named line for the embedding provider and what it receives. `(b)` requires no
  new line; `(c)` requires one and it must be accurate about what is and is not stripped.
- **Subprocessor list + DPA:** a new entry and a contract. Note that Voyage AI is absent from the
  DPF research in this conversation, so **its transfer posture is unverified** — verify before relying
  on any adequacy route, or plan for SCCs plus a transfer impact assessment.
- **Retention:** embeddings are personal data. **Deleting a source document does not delete its
  embedding**, and a chunk of an IEP can be reconstructable from a vector record. Our published
  schedule (90d messages, 60d triaged email) would have to be enforced against the vector store too.
- **Deletion:** `deleteFamilyData` would need to cover the vector table, and the CCPA deletion
  standard — permanently and completely erasing, except archived or backup systems — is not satisfied
  by deleting rows in one store and leaving vectors in another.
- **Backups:** vectors in a dump inherit the backup window, exactly like the tables they came from.

## 5. What we may not claim, either way

- **If we keep substring recall:** we may not say the agent *understands what you mean*, or that it
  *remembers everything you tell it*. It finds what you said, in your words. The honest line is
  *"it keeps what you tell it, and finds it by what you wrote."*
- **If we embed family data:** we may not describe embeddings as private to us unless they never leave
  our infrastructure. `(c)` does not earn that sentence. `(b)` does.
- **Neither way:** no claim that data is de-identified without the § 1798.140(m) measures, public
  commitment and flow-down in place; no claim that deletion is complete while vectors outlive their
  sources; and no claim that family data never reaches a third party — because today, the query does.

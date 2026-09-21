# The product thesis — the entitlement gap, and the liaison that closes it

## Why this document exists

The site was rewritten from the "Benny benefits platform" positioning to a school agent, and in doing
so it lost its ambition. The user's words, verbatim:

> "the full website lost its bite. This reads like an email assistant. It lost the full thesis that you
> and your students are entitled to a lot and you don't need to know every institutional complexity to
> get it. This is a real liaison a real helper to get the most out of school, simplify the complexity."

This file is the thesis the website has to carry. It records what we decided and what we have not
resolved. It is the argument, not the copy.

---

## 1. The problem, as a parent feels it

Not "too many emails." The thing underneath:

**You are the only person in the system whose job is to fight for your kid, and you are doing it
alone, at 9pm, after work, inside institutions built for their own convenience.** Nobody hands you the
map. The office does not tell you what your child qualifies for. The district does not tell you a
program exists, that its window opens in three weeks, or that the person who could approve it is the
liaison whose name you have never seen. What arrives is a stream of notifications, and somewhere in it
is the one thing that matters.

The specifics we gathered:

- **Volume, and how little of it matters.** On the order of **eight school communications a week**,
  of which roughly **one** needs a parent to act. Our own harness measured it on a realistic week:
  **16 emails triaged to 4 real action items, with every actionable item caught and zero false alarms
  on the noise** (`npm run test:triage`). The reduction is the point.
- **The arithmetic does not work.** **37 school days off against roughly 35 days of combined PTO** —
  "the math just does not add up" (Fortune, quoted in our research pass).
- **The asymmetry has a market price.** Education advocates charge roughly **$80–250/hour**, and an
  IEP meeting commonly costs **$300–800**. That is what it costs to buy the institutional knowledge a
  parent was never given.
- **The cost of missing one thing is high.** A vendor in this space claims **93% of mothers do school
  administration alone**, **2–4 hours a week**, and **94% have forgotten an event** (Kiki, a
  competitor, so treat those as marketing claims, not measurements).
- **Every family benefit we studied shows the same signature:** funded, offered, and used by a
  single-digit-to-~10% of the people it was bought for.

The deeper problem is not information. It is that **getting what your child is owed requires knowing
how the institution works** — and the institution has no incentive to teach you. It is not hiding
anything; it is simply not built to explain itself to one parent at a time.

## 2. The thesis, in one paragraph

**Every child is entitled to a great deal, and receives a fraction of it. That gap is not created by
stinginess or by bad people; it is created by complexity, paperwork, deadlines and asymmetry of
information. The school is not the enemy — the process is.** Because the gap is procedural rather than
adversarial, it can be closed by something that holds both maps at once: the family's actual life, and
the institution's actual rules. It notices the gap, does the work, and does not stop until the thing
is secured. The parent should never have to learn the institution to get what their kid is owed.

## 3. What the product is: a liaison

Not a notifier. A liaison. Four verbs, from `docs/RELEASE-PLAN.md`:

1. **It reads** — triages the firehose into the one or two things that actually need a parent.
2. **It answers** — researched, grounded answers about *their* school and *their* district, not
   generic advice.
3. **It does the paperwork** — fills the forms, drafts the emails, makes the calls, always showing the
   parent first.
4. **It follows through** — reminders, deadlines, and chasing until the outcome is real.

And the definition of done, which is the line the honesty section of the site should lead with:

> **Done means the school confirmed it.**

"Getting the most out of school" is concrete, not a slogan. It is the evaluation that was never
requested. The program nobody mentioned. The accommodation that was agreed in a meeting and never
implemented in the classroom. The transportation the child qualifies for. The free enrichment with
empty seats. The deadline that passes quietly while a parent is at work. The rights nobody tells you
about until you ask the right person the right question in the right window.

## 4. Why it is not an email assistant

Summarising is table stakes and disposable. An email assistant tells you what happened; a liaison
changes what happens. Every step of the difference is the product:

| An email assistant | A liaison |
|---|---|
| Summarises the inbox | Decides what needs a person, and does the rest |
| Tells you a form is due | Fills it, shows you, sends it on your yes, and confirms it landed |
| Answers "here is what an IEP is" | Gets the evaluation requested and the accommodation implemented |
| Ends at information | Ends at the outcome, or at an honest handoff |

The assistant framing undersells the product and **invites the wrong comparison** — a better inbox, a
chatbot, a wrapper. The triage is the front door, not the product. If the website sells the front door,
we get compared to tools that only have a front door.

We already learned this the hard way in the strategy conversation. The user's own conclusion — *"I
think Instinct can do all of that shit, actually"* — is correct: **capability is a commodity.** Anyone
can wire a browser to a model. What is not a commodity is **permission** (authorized access to a
family's school life), **the payer** (someone who values the outcome enough to fund it), and **the
data** (the accumulated map of how a particular district actually works). The moat is not that we can
fill a form. It is that we are the thing a parent trusts with the form, and the thing the institution
eventually expects to hear from.

## 5. What it is not — and why that is what makes it trustworthy

The honesty boundary is not a disclaimer bolted onto the ambition. It is the reason an advocate is
worth trusting, and it should be written that way:

- **It acts only on an explicit yes.** Nothing is sent, submitted or changed without one. A parent who
  does not trust an agent cannot delegate to it, and delegation is the entire product.
- **It will not claim a form went through without the school's confirmation.** "Done" is defined by
  the institution's own acknowledgement, not by the agent's belief that it finished.
- **It cannot see a portal until the parent signs in themselves.** We hold a session the parent
  authorized and can revoke, never a password.
- **It is strong at reading and researching, and honest about hard new forms.** On a novel multi-page
  form, the industry's own benchmark for a cold agent is around one in three; on known, repeated forms
  the target is above 90% once those flows are compiled. We publish which is which rather than
  averaging them into a single flattering number.
- **It says what it cannot do.** When it cannot finish something, it hands over the link or the next
  step rather than stalling or pretending.

One capability gap belongs in this section explicitly, because the thesis depends on it: **we cannot
yet observe what a child is actually receiving** (recorded as M6 in `docs/CAPABILITY-TRUTH-TABLE.md`).
There is no data source for current receipt — meal status is mock, there is no SIS read. So the honest
claim is *"what your child is likely entitled to but may not be getting, researched, and the steps
driven to secure it"* — not *"we can see the gap."* Closing observability is a product problem, and
until it is closed, the thesis is an ambition about outcomes, not a claim about visibility.

## 6. The ambition, stated plainly

In two years, if this works: **every parent has a liaison, and the institution's complexity stops being
the parent's problem.** A family texts a number and someone who knows the district, the deadlines, the
programs, the forms and the people handles school — with the parent's approval at every consequential
step, and with the parent never needing to learn what an IEP is, what McKinney-Vento covers, which
window a program opens in, or which office to ask. The entitlement gap narrows as a measurable
consequence, not as a slogan: more evaluations actually requested, more accommodations actually
implemented, more transport actually arranged, more free enrichment actually filled.

The test of the product is not "did it summarise my inbox." It is: **did my kid get something this
month that they were entitled to and would not have gotten otherwise.**

---

## Decisions recorded

- **School agent, not a benefits platform.** The benefits/life-work layer is parked
  (`BENNY_IMESSAGE_ENABLED=false`) and out of scope for this release. The wedge that survived is the
  parent-facing school agent. The user's instruction was explicit: *"I just need, when we text the
  agent, it just does the school shit."*
- **Parents, not employers, as the audience of the product** — *"I kind of just want this to be the
  school agent for parents."* The benefits framing answered "who pays" but muddied what the thing
  *is*; the thesis above is about the product, not the payer.
- **Monetisation is explicitly deferred.** *"You are the builder. Don't concern yourself with that
  stuff."* The thesis does not depend on the payer being resolved.
- **A real liaison, held to institutional confirmation**, rather than an assistant judged on summaries.
- **The triage is the wedge; the outcome is the product.** We do not sell the reduction in messages.
- **Honesty is a feature of trust, not a hedge** — the consent gate, the confirmation requirement, the
  published cold-versus-warm numbers.
- **Bilingual by default.** The product opens by asking which language the parent prefers, in both
  languages, and the site ships in both.

## Tensions we have not resolved

1. **The thesis claims an outcome the system cannot yet observe.** The entitlement gap is the product,
   but M6 stands: we cannot see what a child is currently receiving. We research entitlements and drive
   steps; we cannot verify receipt without a read path into the institution (a parent-authorized portal
   session, or the school's own confirmation). **This is the single largest gap between the thesis and
   the capability**, and it is a build problem, not a wording problem.
2. **The front door is narrower than the thesis.** The first shipped feature is email triage, which is
   exactly the "email assistant" framing the user rejected. The resolution is that triage is the entry
   point and the outcome is the product — but the website must not stop at the entry point.
3. **Reliability is honest but not yet good enough to promise the outcome.** Cold novel forms are
   ~1 in 3 by industry benchmark; the >90% warm path requires workflow compilation
   (`run_with: "code"`), which is designed but **not yet wired**. Until it is, the liaison is
   dependable on reading, research and known forms, and honest elsewhere.
4. **The payer is genuinely open.** The benefits layer was the answer to "who pays"; parking it
   reopens the question. A free pilot does not answer it. The thesis is deliberately silent on this,
   and that silence is a real risk, not a resolved position.
5. **Capability is not the moat, and we have not finished proving what is.** The permission, payer and
   data story is currently an argument, not a demonstrated position. The district-relationship question
   in particular is unanswered: parents can authorize us, but a district can also refuse us.

## Numbers and their sources

Per instruction, every figure above with where it came from, so nothing is asserted beyond its source.

| Figure | Source | Confidence |
|---|---|---|
| 16 school emails → 4 action items, recall 4/4, 0 false alarms | **Our own harness**, `npm run test:triage` | Measured by us |
| Fill completed 5/5 (vendor self-report, an upper bound); end-to-end submit number invalid | `docs/RELIABILITY.md` | Measured by us; the submit number was invalidated by a fixture bug and must not be quoted |
| ~1 in 3 cold on novel multi-page forms | ClawBench 33.3%, HealthAdminBench 36.3% end-to-end (vs 82.8% subtask), both 2026, on live production sites | Third-party benchmarks, cited in `docs/COMPUTER-USE-SOTA.md` |
| >90% warm target | Our stated target; mechanism (`run_with: "code"`) is documented by the vendor but **not yet wired by us** | Target, not a measurement |
| ~8 school communications a week, ~1 needing action | Research pass (school communications volume/composition) | **Source not recorded in this repo — verify before external use** |
| 37 school days off vs ~35 days combined PTO | Research pass, quoting Fortune | **Source not recorded in this repo — verify before external use** |
| Advocates $80–250/hour; $300–800 per IEP meeting | Research pass | **Source not recorded in this repo — verify before external use** |
| 93% of mothers do school admin alone; 2–4 hrs/week; 94% forgotten an event | **Kiki, a competitor** — vendor marketing | Treat as a claim, never as a measurement |
| Single-digit-to-~10% utilisation of family benefits | Research pass | **Source not recorded in this repo — verify before external use** |
| M6: no data source for what a child is actually receiving | `docs/CAPABILITY-TRUTH-TABLE.md` | Verified in our own code |

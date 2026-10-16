# Mycelium: the full vision and how we got here

**Read this before building anything.** It is the why behind the code, the website and the
pitch. It was assembled on 2026-10-16 from every conversation Mitch has had about Axolotl and
Mycelium since early September 2026, the research done along the way, and the state of the
repo. When code, a doc or a request seems to point somewhere this document doesn't, **ask
Mitch. Don't guess.**

How to use it:
- **Part 1** (the trajectory) explains why the repo looks the way it does: it holds pieces of
  every phase, and you need to know which are current.
- **Parts 2–6** are the thesis, the market, the product and its rules. They decide what to
  build.
- **Part 7** is the current state, including what's proven and what isn't.
- **Part 8** is how this becomes real with families this month. Start there if you're asking
  "what do I do next?"
- **Part 9** is voice and language. **Part 10** is open questions.

Companion documents:
- `docs/AGENT-PLAN.md`: the engineering plan for the agent (phases, assumptions to check).
- `docs/AGENT-PLAN-CHECKS.md` (on the pathways branch): Phase 0 results.
- `docs/PATHWAYS.md` (on the pathways branch): the pathway engine design.
- `docs/RELIABILITY.md`: everything measured, with build hashes and limits.
- `docs/research/school-family-edge-2026-10.md`: evidence for the school thesis.
- `docs/research/computer-use-agents-2026-10.md`: agents on messy systems, the law, investors.
- `archive/README.md`: the rules archive (eligibility and procedure as tested code).
- Older docs (`PRODUCT-THESIS.md`, `PARENT-REALITY.md`, `WEBSITE-VOICE.md`, `BUILD-PLAN.md`,
  `CAPABILITY-TRUTH-TABLE.md`) are real history but written for earlier phases. Where they
  disagree with this document, this document wins.

---

# Part 1. The trajectory: Axolotl to Mycelium

Six weeks, many pivots, one idea underneath. Each phase left code behind and taught something
that survived. Read this as "what we learned", not "what we abandoned".

### Phase 1. Axolotl: a parent's agent for school (early to mid September)

**What it was.** A text-based helper for working parents, English and Spanish, at
get-axolotl.com. Parents text a need (a form, a pickup, an absence, an evaluation) and it gets
done, with nothing sent without the parent's yes and nothing called "done" until the school
confirms. The site had a one-day narrative arc, a live "agent ticker", a named axolotl
character, and the promise **"done means confirmed."** Form filling ran on Skyvern.

**The research behind it** (`docs/PARENT-REALITY.md`): large districts close about 29 extra days
a year; 35% of parents have missed work over school transport; cognitive labor (anticipating,
monitoring) falls mostly on mothers; middle-class parents act collectively through networks
while working-class parents mostly can't (Horvat, Weininger & Lareau).

**The ideas that survived:**
- **The rights angle.** Families are *owed* things they don't know about: McKinney-Vento keeps
  a homeless child in their school with transport; IDEA puts deadlines on evaluations; Title VI
  requires communication in a language the parent understands. "We'll get your kid what they're
  owed" was the most distinctive thing on the site, and it's the seed of everything after.
- **Done means confirmed** and **your yes sends it.** Still core rules today.
- **A family data model** (family, children, caregivers, schools, enrollments, deadlines,
  source messages, tasks) and a **three-layer model**: the family (private), the people around
  them (opt-in "Circles" of parent friends coordinating across households), and the school
  (shared knowledge that improves with each family). Circles was judged the most defensible
  idea then, because it's cross-household and compounds. It's parked, not dead.

**Why it moved on.** Triage and permission-slip filling became commodity (Ollie, backed by
Khosla; Google's family agent; Fambot). The form path was unreliable: too many overlapping tools,
contradictory prompts, a submit step that restarted the session the parent had approved. Most of
all, **no obvious payer**: asking schools to pay for a parent-side agent felt structurally
awkward, and parents don't pay. Mitch also explicitly rejected becoming a "front desk AI"
company for schools.

**Code it left:** the Spectrum/iMessage app (`src/index.ts`), the agent core
(`src/agent/agent.ts`, `tools.ts`), email triage, Skyvern and Stagehand integrations,
`src/testworld/`, the axolotl mascot work, the intelligence layer (`src/agent/intention.ts`).

### Phase 2. Benny: the benefits delta (mid September)

**What it was.** An employee-benefits agent sold to employers. The insight, in Mitch's words:
*"benefits are only useful so long as someone is triaging the delta between all the things you
need in your life and what the benefits are able to afford you."* Benefits are latent value;
Benny holds both maps (the household and the coverage), reconciles them continuously, and does
the work in between. Employers already pay for benefits nobody uses (EAPs around 5%
utilization), so Benny converts spend from latent to realized.

**What survived:** the **"delta"** idea (value that's owed but never claimed), the two-maps
framing, the reconciliation-as-step-one logic, and the code in `src/benefits/` ("Benny": typed
connectors, a runtime with code-bound `YES <code>` approvals, expiry and revisions, which is the
strongest consent design in the repo).

### Phase 3. The sandwich generation and employers (late September to early October)

**What it was.** The same helper for working adults carrying both kids' schools and aging
parents, sold to employers with large hourly, Spanish-speaking workforces at about $1 per
employee per month, with Medi-Cal managed-care plans as a possible second payer. Competitors:
human-powered concierges (Wellthy, Cariloop, Homethrive, Grayce) priced for salaried workers.

**What it taught:** a broad front door with deep expertise in **institutional, deadline-driven,
document-heavy lanes** (Medi-Cal enrollment and renewals, IHSS, long-term care Medi-Cal, IEPs),
where agents beat generalist human coaches. And a routing order for help: public programs first,
then benefits already paid for, then the family's network, then paid marketplaces.

**Why it moved on.** Mitch was never convinced employers would pay. A $1M pre-seed deck was built
for this version; an honest failure analysis named the fatal risks as no payer, no usage and
founder drift.

### Phase 4. Union benefit funds and the "wrong payer" (early October)

**The insight that changed everything.** When a person doesn't claim what they're owed, the cost
doesn't disappear. It lands on the person (who goes without), on the rightful payer's books as
savings (so they have little reason to remove friction), or on a **wrong payer who can't refuse**:
the union fund paying a premium the state should pay, the hospital absorbing what Medicaid should
cover, the family buying medicine a program would cover. Wrong payers are both the customer and
the channel: the cost landed on them because they already have a relationship with the person.
And **the fix has to come from the person's side**, because only the person holds all the facts
and the legal standing to act across institutions.

**The first concrete market.** Enrolling low-income retirees in New York's Medicare Savings Program
when a union fund reimburses their Medicare Part B premium. The state then pays the premium; the
fund stops paying ($202.90 a month, about $2,435 a year per retiree in 2026); the retiree gains too
(Extra Help with drugs, the premium split at funds like 1199). Roughly 40% of eligible people
nationally aren't enrolled. **1199SEIU** was identified as the strongest first customer, with an
estimated ~$11M/year in recoverable fund money from public filings. Pricing: a fifth of the fund's
savings, paid per approval. **NLA** (National Labor Alliance of Health Care Coalitions) was
identified as an endorsement channel to Taft-Hartley funds.

**The PearX application** (Oct 5) was written on this version: "At Clay, I built AI systems to find
when a company becomes the right buyer. At Mycelium, we detect the moment that a member has the
wrong payer."

**Code it left:** the rules archive (`archive/`): seven playbooks (Medicare Savings Program, turning
65, disability, Medicaid, long-term care Medicaid, SNAP/CalFresh, school meals including
California's alternative income form) for **New York, California and Illinois**, each with tested
eligibility logic (`evaluate(household, state, as_of)`), procedure, sources and change detection.
Also `/funds`, `/members`, the Part B calculators, `docs/ENTERPRISE-READINESS-PLAN.md`.

### Phase 5. The state shift, the front door, and doubt (October 7–9)

**The state shift.** When a person's interface with an institution becomes an individual agent
instead of a portal, an email or a call center, the institution finally sees what's changing in
the person's life (job loss, a new baby, turning 65, a disability, a move), which changes what it
should pay or be paid. Today the person is the courier between institutions (a retiree mailing a
Social Security letter to the fund every year because the agencies don't share data). An agent,
with consent, carries those facts instead. Liability shifts, and institutions start interacting
with each other through the person's agent.

**The prefabbed agent front door.** Institutions (funds, employers, hospitals, schools) give the
people they serve an agent, set up for their use, paid on outcomes, organized around **playbooks**
(Medicare premium help, turning 65, disability-to-Medicare, renewals, Medicaid, SNAP, long-term care,
school income forms). Jev was first proposed here: check every agent response against the
institution's policy. And the dream: one Mycelium site where any institution describes who it
serves and its liabilities, then mints its own agents, with the network improving as more join.

**Agents on both ends.** General personal agents (Meta's Muse, Instinct, ChatGPT) will be
everyone's "Jack", but every institution will still want its own authoritative agent that can
answer with authority and carry the liability. Institutions could also publish connectors into the
assistant a person already uses (ChatGPT apps, Muse connectors).

**Doubt.** Mitch said Mycelium "as it currently stands, is fucked", explored other businesses (an
AI-native roll-up, nursing-home Medicaid-pending services modeled on Hera and Corridor), and
concluded he only wants things that **help people and make money**, and that what he wants to give
people is **peace of mind**, not just money.

### Phase 6. Stranded alignment (October 10–14)

The thesis got its name, its economics and its test (Part 2). Mitch: *"Mycelium, Axolotl, it's all
sort of one thing. It's this thesis of how agents should diffuse through society… the
infrastructure for allowing institutions to spawn agents that work to achieve outcomes that depend
on their members' lives changing."*

The school version clicked: a district facing chronic absenteeism giving every struggling family the
case worker it could never afford, one who can work **outside** the school's walls (public programs,
transit). The PearX interview (first round, went OK) pitched the fund wedge with the worldview as
the "how big" answer. A call with a former edtech investor raised the hard K-12 questions
(fragmented sales, family adoption, and the AllHere/LAUSD collapse). A school-Medicaid billing wedge
was explored (an NYC audit found up to $431.6M unclaimed) and later found small in California. The
comparison to **Hone** ("AI that owns business outcomes", $60M seed) became the shorthand: Mycelium is
that for institutions whose outcomes depend on people's lives, with agents working both inside the
institution and in members' lives. Mitch began writing an essay himself on stranded alignment.

### Phase 7. Schools first, the family edge, and the build (October 14–16)

- **The website** (try-mycelium.com) was rebuilt for investors with two doors (schools, funds),
  "schools first" as the wedge, the fund as proof the mechanism generalizes, and buyer pages for
  /schools and /funds. A **district picker** on /schools shows every California district's and
  charter's recoverable money from its own public filings, with Mycelium's cost beside it.
- **The school-family edge** research (Part 4) found the thesis holds and moved its weight: the
  family is the unit; help beats information; the gaps are unmeasured in places and the pilot should
  measure them.
- **Pricing** moved from "a quarter of recovered attendance funding" to a mostly flat per-student
  fee with a contingent slice (Part 5).
- **Scope** settled: everything a family owes and is owed, across institutions; get it, keep it, use
  it. The **network** endgame: institutions building pathways onto the helper.
- **The agent**: research on computer-use agents, then `docs/AGENT-PLAN.md`, then Claude Code built
  the **pathway engine** (Part 7), which finished 8 of 10 held-out synthetic families on two real
  district income forms with zero wrong values, against 0–1 of 10 for the old agent.
- **The current wall:** no real families or districts to test with yet. Part 8 is how to get past it.

---

# Part 2. Stranded alignment

**Definition.** Outcomes that an institution and the people it serves both want, which go unrealized
because reaching them takes individual attention that costs more than any single party can capture.

- *Alignment*, because both sides genuinely want the same result: the kid in school, the eligible
  family kept on Medicaid, the premium paid by the right payer.
- *Stranded*, from "stranded assets": value that's real on paper and can't be reached.

**Two causes:**
1. **Too expensive per person** (Baumol's cost disease). Services built on human attention don't get
   more productive, so they get relatively more expensive. That's why there was never a case worker
   for every family.
2. **Nobody's job** (Coase, and the wrong-pocket problem). An institution's boundary sits where doing
   something itself stops being cheaper than buying it. Some work is too expensive to make *and* to
   buy, so it falls into **neither**: outside every institution's boundary. And when a fix helps
   several institutions (the school, the Medicaid plan, the employer), none captures enough to fund it.

**Make, buy, neither.** Today's agents make *make* and *buy* cheaper (coding, shopping, service bots),
and those gains get competed away. **Neither** is value never captured because nobody could afford to
go get it. The claim: as make and buy get cheap everywhere, *neither* becomes the battleground.
Falsifiable: watch for institutions buying agents for their members (not chatbots for their sites),
contracts priced on outcomes, and budgets for work that never had a line.

**The orphan-drug parallel** (the explainer Mitch chose). Before the 1983 Orphan Drug Act, drugs for
rare diseases mostly went unmade: each market was too small. The act changed the economics and a
category appeared. Stranded alignment has the same shape; here the economics change through a cost
collapse plus a sponsor willing to pay for outcomes.

**Lineage** (cite openly; the synthesis is Mitch's): Coase (1937, 1960), Williamson, Baumol, Hayek
("The Use of Knowledge in Society": only the person holds the knowledge), Herd & Moynihan
(*Administrative Burden*: learning, compliance and psychological costs), Currie (benefit take-up),
Sunstein (sludge), Mullainathan & Shafir (*Scarcity*), Hirschman (*Exit, Voice, and Loyalty*),
Bernheim & Whinston (common agency), Holmström & Milgrom and Kerr ("On the Folly of Rewarding A,
While Hoping for B"), and "The Coasean Singularity?" (Shahidi et al., NBER 2025), which imagines
agents on the consumer side. Position: agree with the Coasean premise, disagree about where it pays
off first.

**Pitch line:** "Stranded alignment is Coase meets Baumol: mutually beneficial outcomes that
transaction costs and human labor costs kept out of reach. AI collapses both, and institutional
sponsorship solves the wrong pocket problem."

**The essay.** Mitch is writing it himself, built around: the consensus (commerce agents), make / buy
/ neither, stranded alignment and its causes, the orphan-drug parallel, the fiscal vs operational
boundary, the rings, names in / outcomes out, why institutions not consumers, objections
(surveillance, gaming the metric, "case management exists", outcome contracts that failed), and
beyond schools. **Do not write essay prose for him.** Use the concepts freely on the site and in docs.

---

# Part 3. The market test and the diffusion thesis

**Is it a stranded-alignment market?** All five:
1. **A payer with positive-sign exposure:** someone's money moves up when the outcome happens.
2. **The outcome happens outside the payer's operational boundary.**
3. **The blocker is coordination, not scarcity or motivation.**
4. **Per-case value is below the human-labor threshold.** Signature: contingency-fee human services
   already work the top of the value distribution (SSDI advocates, hospital eligibility vendors,
   public adjusters); the long tail beneath them is stranded.
5. **Measurable and attributable** within a time frame the payer accepts.

A second signature: **per-head funding formulas** that pay an institution more for each low-income
person it identifies (LCFF's unduplicated count; community colleges' Pell/Promise counts). The test
rules out scarcity-blocked surplus, adversarial exposure (denials, collections) and motivation-blocked
outcomes. Absenteeism is a partial fit: the market is the coordination-blocked share of absences.

**The diffusion thesis** (Mitch's core worldview): **personal agents will diffuse through institutions
sponsoring their members' agents**, which keeps institutions aligned with their members and surfaces
problems they didn't know they had. Institutions have what app stores don't: a reason to pay, the
trigger (they see who needs help before the person asks), trust (people read what their school
sends), and permission (uninvited agents get blocked; sponsored ones come through the front door with
standing: FERPA's school-official role, a fund's fiduciary duty, a Medicaid authorized representative).

**The flywheel:** families engage because the helper gets them real things → conversations reveal what
changed in their lives → the institution sees patterns it couldn't (forty families on one cut bus
route) → outcomes improve, the institution pays, trust grows → rules and portal knowledge compound
across sponsors. **Exit into voice:** silent exits (chronic absence, disenrollment) become reasons,
reported in aggregate. **Common agency:** the family with the chronically absent child is often the one
with a lapsed Medicaid renewal and a shutoff notice; the first sponsor brings the helper in, and every
other institution touching that family has a reason to pay into the same helper. **Either future
works:** if families lack capable personal agents, Mycelium is theirs; if they have them, Mycelium is
how institutions sponsor the work inside them (trigger, authority, payment, rules).

---

# Part 4. The school thesis (the wedge)

**The fiscal boundary vs the operational boundary.** A California school's money already reaches into
family life (attendance funding by the day; the low-income count from an income form or a
CalFresh/Medi-Cal match; Medi-Cal billing). Its operations stop at the classroom door. **The gap
between the two is where stranded alignment lives.** California already pays to close it ($4.1B for
community schools) with human coordinators: one coordinator, five hundred families.

**The rings:** (1) the school's own paperwork, done with the family; (2) the family's public programs;
(3) the barriers of daily life; (4) patterns flowing back to the district.

**The edge thesis.** Schools aren't inefficient inside the building; they're inefficient at **the
edge**, every process that only completes when a family acts: attendance, the low-income count,
special-education consents, Medicaid consent, enrollment packets, immunizations, FAFSA/CADAA, benefit
renewals, health follow-up. They fail at high rates, in the same households.

**Evidence that help works where letters don't:**
- SNAP: 6% with nothing, 11% with a letter, 18% with a letter plus help (Finkelstein & Notowidigdo).
- FAFSA: information alone did nothing; eight minutes of help raised filing 16–27 points and college
  enrollment 8 points (Bettinger et al.).
- Aid reminders by text and email to 800,000+ students changed nothing (Bird et al.).
- Florida: a note home about eye exams did nothing; glasses at school raised reading and math; a
  quarter of children who needed glasses still went without, mostly over a permission form.
- 1 in 5 California students (1.14M) were chronically absent in 2024–25; 44% of California children
  have an immigrant parent; about 1 in 4 adults in mixed-status families avoided benefits they
  qualified for. Trust and language are the mechanism.

**Honestly unproven** (say so): no published statewide count of eligible-but-uncounted students (the
universal-meals dip recovered by 2023–24); no randomized trial of assisted form completion for K-12
families; vendor attendance claims are self-reported. **The first pilot is designed to be that trial.**

**Money mechanics:** the low-income count is pooled over three years (a third in year one); a counted
student is worth roughly $9–10K/yr above 55% unduplicated and about $2K below; forms are due by
October 31 for Census Day, first paid at P-1 in February; most districts are funded on prior-year or
three-year-average attendance (LAO 2025–26: 43% current, 19% prior, 38% average), so attendance gains
often arrive a year late; charters are paid on current-year attendance; basic-aid districts gain no
state money from either. Supplemental dollars must be "principally directed" to the students who
generate them: **enrolling students is not the same as serving them.** The helper is service to
families; the district's count follows because the family got what it was owed.

---

# Part 5. The business

**Buyers.** California school districts first: outcomes have money attached and the buyer verifies them
in its own records. New York union benefit funds as proof the mechanism generalizes. The homepage is
for investors; /schools and /funds are for buyers.

**Pricing (settled October 15).**
- **Schools: $5.60 per enrolled student per year, plus $2.40 only if numbers the district certifies to
  the state move** (Fall 1 unduplicated count or funded ADA). $8 maximum. Fiscal-year term, no setup
  fee, no minimum. Why: outcome-based pricing is rare and shrinking in AI (Orb 2026: 3.8%), the one K-12
  outcomes contract found (South Bend–SchoolStatus) is 70% base / 30% contingent, and comparable district
  spend is $2–16 per student. At $8, districts under ~14,900 students fit under California's $119,100
  bid threshold.
- **Funds: a fifth of the premiums the state now pays instead of the fund.** The state writes the check
  the same year and the outcome is on a Medicare record.

**Where to sell vs where to test** (from the picker data):
- **Pajaro Valley Unified** (Watsonville): the sale. ~$947K/yr on the table; 25% chronically absent;
  high unduplicated share.
- **Live Oak Elementary** (Santa Cruz County): a small high-need district (above the 55% line).
- **Soquel Union Elementary**: Mitch's home turf; good for testing, weak to sell (~$25K/yr recoverable,
  36% low-income, close to basic aid).
- **Palm Springs Unified**: the second launch form already built (LINQ web form).

**Size (estimates).** School seat at $8 ≈ $400M/yr nationally; ≈$1B if outcome data justifies $15–20;
plus sponsors paying for the same households (Medi-Cal plans lose about $328 per child-month on a lapse;
~37M children on Medicaid/CHIP); families' own unclaimed money is larger still (unclaimed Pell ~$4.4B/yr;
California CalFresh ~$3.5B/yr). One form is a small business; the edge is the business. Without a second
sponsor, a good school company; with one, a big one.

**Adjacent markets that pass the test** (parked, not pursued): community colleges (Pell/Promise counts),
community health centers (Medicaid enrollment), hospitals (stuck discharges, retroactive coverage),
disability insurers and funds (the chain short-term disability → long-term → SSDI → Medicare at month 25;
crowded at the SSDI step by Atticus, Turnout and Brown & Brown), nursing homes (Medicaid-pending).

**The network (endgame).** Once families trust the helper, institutions build for it: a county, a health
plan or a college publishes what it needs from families, and the helper finishes it with them. They can
pay for an application finished. **They can never pay to be recommended.** This is the literal meaning of
the name: a mycelium carries nutrients between things that can't reach each other.

**Aims Mitch has stated.** Families and schools having good outcomes; peace of mind for people, not just
money; a business that makes money and grows. An earlier stated goal was a strategic acquisition in 1–2
years; the current investor framing is venture-scale through sponsors and the network. Ask which governs
if a decision turns on it.

---

# Part 6. The helper: scope and rules

**Scope.** Anything the school or a public program needs from the family, and anything the family needs
from the school or those programs, **across institutions**. The school is the door, not the boundary.

**Get it, keep it, use it.** Sign-up without follow-through is the letter again (about a fifth of 2025 SUN
Bucks cards were never activated). The helper gets the benefit, keeps it (renewals before the packet goes
missing) and makes sure it's used (card activated, appointment booked, services delivered).

**Broad in what it listens to, narrow in what it does.** A family can text anything. On the edge, it acts,
on a yes. Off the edge (a rent dispute, an immigration question), it hands off to a real person or
organization. Every conversation starts with something being done, triggered by data the sponsor holds.

**Three launch jobs (schools):** (1) the income form and what it unlocks; (2) whatever keeps a child home;
(3) enrollment and consents. The family is the unit: one income verification feeds the count, CalFresh and
SUN Bucks; one Medi-Cal renewal can count every school-age sibling.

**Rules code must enforce:**
- **It works for the family.** Only outcomes good for both.
- **Names in, outcomes out. Never the reasons.** The sponsor sees outcomes in aggregate, never the thread.
- **Nothing without a yes** to exactly what will happen, with every value shown. Legal attestations are
  checked by the person, never the agent.
- **The trigger is not the objective.** Written limits (never pressure a sick child to attend); never game a
  count or misclassify a student.
- **No institution can pay to be recommended.**
- **Done means confirmed** by the institution; otherwise "sent, not confirmed".
- **Ask, don't guess.** Every submitted value traces to a verified fact, a document or the person's words.
- **Never evade.** No CAPTCHA solving, no stealth, no automated access behind Login.gov.
- **Minimum data.** Each form gets only the facts it needs.

---

# Part 7. Where things stand (2026-10-16)

**The build stance.** Build what gets more valuable as models improve (the trust layer, institutional
pathways, family context, per-portal knowledge and tests); rent what gets cheaper (the general agent, the
browser). **Code owns each job; models only read and write text.** Sort portals by authority: Tier 1, the
sponsor owns it (full loop, often no browser); Tier 2, programs that accept an organizational authorized
representative (Medi-Cal, likely NY MSP); Tier 3, human-only identity (Login.gov, FSA ID: prepare and hand
off).

**The pathway engine** (branch `claude/youthful-keller-x8kyyz`, 55 commits, **not merged, not deployed**):
- A **pathway** is one real form for one district, written as data: the facts it needs (questions in English
  and Spanish), a rules-archive check for whether the child is already covered, a field map, how it's filed,
  what "done" means, what to offer next (SUN Bucks, CalFresh). Two built: **Pajaro's paper form** (PDF, parent
  signs) and **Palm Springs' LINQ web form** (filed online, reference code back).
- **The family record** stores where every fact came from and refuses to file any unsourced value.
- **The engine:** watches for exits (crisis, "a person", stop, side questions); Haiku reads each reply, and
  every extracted fact must quote the parent's exact words or it's dropped; pattern readers run first and
  as fallback; asks the next question in a time-saving order (benefits first); asks the rules archive; shows
  every value; binds the yes to those exact values; files through the right lane; leaves signatures to the
  parent; says "done" only with a confirmation.
- **Results (held-out, model-played parents, frozen build 08cc194):** Palm Springs 8/10, Pajaro 8/10; zero
  wrong values, guessed facts, agent-ticked boxes or sends without a yes. Old agent: 1/10 and 0/10. About
  $0.22–0.29 a run including the simulated parent.
- **Limits:** 10 families per form, one seed (8/10 could plausibly be 5–10 on a fresh sample); replicas and
  synthetic families, not real ones; Pajaro averaged ~16 turns and Palm Springs ~10, with 2 of 10 Pajaro
  parents giving up; the top remaining failure is corrections to Spanish names with accents and capitals;
  reader latency on the API not measured.
- **Not wired yet:** nothing starts a pathway in production; the certify link and filled PDF don't go over
  iMessage; the Haiku reader isn't on the API path; Jev is not wired into the agent (it exists only in the
  comparison scripts on `claude/zealous-knuth-7urkvs`).
- **Facts to confirm (phone calls, not code):** how Pajaro accepts the form back (email or photo vs paper);
  each district's permission to file on families' behalf.

**Phase 0 findings** that still matter (see `AGENT-PLAN-CHECKS.md`): no read-back on the Skyvern path; the
review cut off at 25 values; the consent log stored no values (Mitch decided: plain values + hash); every form
got the whole profile; the Stagehand submit adapter claimed "submitted" without confirmation and fabricated a
reference id. The pathways branch reports fixing the honesty and data-minimization issues in the existing hands.

**People.** Mitch Howard, CEO, builds the agents himself (Brown, Hispanic literature; four years in Providence
ESL classrooms; translator at an immigrant-justice clinic; Fulbright teaching in Mexico; ran private-equity
partnerships at Clay; grew up in Santa Cruz; homeschooled to train as a nationally ranked tennis player).
Sarah Xu, co-founder (Stanford; founding education at Clay; Cognition), has a full-time job; Mitch works on
Mycelium day to day. The homepage founders line still needs Mitch's wording about her; don't invent facts.

**In motion:** PearX (first-round interview done); a16z speedrun SR008 (applications close **Nov 1, 2026**);
district discovery (not yet pitching); a 1199 fund contact; an edtech advisor; Ben Kornell (Common Sense
Growth) seen as an ideal investor; outreach to the Providence teacher whose classroom Mitch volunteered in;
Lindsay Page (Brown) on pilot evaluation (Mitch writes that email himself). **No paying customer yet. No real
family has used the helper yet.**

---

# Part 8. Making it real: from replicas to families (start here)

The wall right now isn't code. It's that no real family has used the helper. **You don't need a district
to start.** A district is needed for the helper to file *on families' behalf*. It isn't needed for the
helper to help a family who then signs and returns their own form (the Tier 3 posture), and that's legal
today. And there's a real deadline: **income forms are due October 31.**

### Step 1. Ship a "family-side" mode of the pathway engine (engineering, ~3–5 days)

The smallest version that real families can use this month:
1. **Merge the pathways branch** after review of the consent, filing and data-handling code (Mitch or a
   second agent reads it first; run `npm run check` and the pathway tests).
2. **Start a pathway from the parent's own message**, not a district roster: "income form", "formulario de
   ingresos", a photo of the form, or a flyer keyword. Ask which school; route to the right pathway.
3. **Deliver the result over iMessage/SMS:** the filled PDF (Pajaro) or the parent's own certify link (Palm
   Springs), with plain instructions to sign and return it to the school. The parent submits; the helper
   never does in this mode.
4. **Put the Haiku reader on the API path** and measure latency per turn (target: a few seconds).
5. **Fix the top failure first:** Spanish name corrections (accents, capitals, compound surnames).
6. **A consent message up front** (what the helper does, that the school doesn't see the conversation, how
   to stop), in English and Spanish, and a **human backstop**: Mitch gets an alert on any handoff, abandon or
   error and can step in by text. Log every thread for daily review.
7. **Add pathways for the testing districts** (Soquel Union, Live Oak) using the same pattern: the rules
   archive already covers California's alternative income form.

### Step 2. Get real people (Mitch, this week)

In order of speed:
1. **Paid testers:** recruit Spanish- and English-speaking California parents on a research panel (User
   Interviews, Respondent), ~$50–75 per 30–45 minutes. They text the helper about their own household; it
   fills a replica of their district's form; nothing is submitted. Ten sessions beat any synthetic run.
2. **Families with the October 31 deadline:** a one-page flyer and a parent-group post, English and Spanish
   ("Free help with your school's income form. A few minutes by text. You get fee waivers and SUN Bucks;
   your school gets funding."). Post in Soquel, Live Oak, Watsonville and Palm Springs parent Facebook,
   Nextdoor and WhatsApp groups; libraries and laundromats; school English Learner Advisory Committee (ELAC)
   meetings, which California requires at schools with 21+ English learners and which are public.
3. **People who already trust Mitch:** the Providence teacher's families (the conversation is the test even
   if Rhode Island's forms differ), the Brown ESL and immigrant-clinic network, friends with kids, Sarah's
   network, and three or four retirees through the 1199 contact for the Medicare Savings Program side.
4. **Family resource centers in Watsonville and Live Oak:** they help families with these forms and are
   understaffed. "A free bilingual helper for the income form this month" is an easy yes and a warm path to
   the district.

**Plan:** test in Soquel and Live Oak; sell in Pajaro with "here's what happened with N real families fifteen
minutes up the road."

### Step 3. Measure what a superintendent and an investor will ask

Per family: finished or not; texts and minutes to finish; where they dropped; language; what the helper
couldn't do; what Mitch had to do by hand; what they were offered next and whether they took it. Weekly:
completions, median texts, human minutes per completion (the number that should fall), and three real
quotes (with permission). Keep the scoreboard and the replicas running alongside.

### Step 4. Turn it into the pilot

With 20–50 real completions: call Pajaro (permission to file on families' behalf; how forms come back; a
roster or data feed so the parent only confirms what the district already has, which should roughly halve
the turns); propose a school-by-school pilot measured against schools not yet offered, each student against
their own prior year, in the district's own records; bring Lindsay Page in on the evaluation design. In
parallel: the speedrun application by Nov 1 with the before/after chart and whatever real-family numbers
exist by then.

### Guardrails for real families

Consent first; minimal data and nothing stored that isn't needed; the parent signs and submits every time in
family-side mode; no real portal automation without the district's or program's permission; Mitch reviews
every thread daily; any sign of crisis goes to a person immediately (911/988 language is already in the
engine).

---

# Part 9. How to talk about it

**Voice:** literal, plain, never clever-but-fake. "Helper" wherever a family or principal reads; "AI" said
once, plainly. English and Spanish, kept in step. For any site change, Mitch's test: **does it make the site
more compelling and more clear to buyers?** If it's neither and just more work, don't. The site's look
(dark soil, cream stone, dendrite photographs, one orange accent, headlines two lines at every width) stays.

**Lines that carry the thesis:**
- "A helper for every family at your school." (homepage)
- "Help for every family, not another letter." (/schools)
- "Schools are paid for things only families can finish… Finishing them is nobody's job."
- "The helper is theirs." / "It finishes the whole thing." / "It answers to them."
- "Then anywhere money depends on a person."
- "Personal agents won't spread to everyone through app stores. They'll spread through the institutions we
  already belong to."
- For investors: "Parents are the human API between their kids' school, their health plan, the benefits
  office and financial aid."

**Don't say:** "digital caseworker", "agency" as a selling word, "own the outcomes in members' lives", "front
desk", anything implying the institution sees the family's reasons, "collecting first-party data". Don't hide
that it's AI; don't pander to AI-wary buyers. Don't quote vendor attendance claims, Georgia State's "200,000
messages", or unverified numbers. "Cross-institutional agents" is Mitch's phrase, not a16z's.

**Investor frame:** a16z's Fabrizio Serafini (main investing team, AI apps) on computer-use agents in the long
tail of software with no API, including "logging into government and insurance portals", with winners at "the
application and context layer, not the model layer"; speedrun's 2026 requests ("observe to act", "agents that
become networks"); YC's "sell the completed work". Answer to "why won't ChatGPT or Meta do this?": no payer, no
trigger, no standing, no rules archive, no sponsor trust.

---

# Part 10. Open questions (don't resolve silently)

- Which sponsor first in practice: the district (the story) or the fund (possibly faster revenue)?
- Will districts pay $8 before pilot data exists?
- Legal footing per portal: authorized-representative forms in California and New York; whether recording
  real portals with synthetic data for replicas is acceptable (blocks AGENT-PLAN Phase 5).
- Whether the helper is offered under the school's name, Mycelium's, or both.
- How the family's helper works with personal agents families may already use.
- The second sponsor (a Medi-Cal plan is likeliest) and when.
- Circles (cross-household coordination) and the sandwich-generation scope: parked; when, if ever, to return.

# Mycelium: the vision

Read this before building anything. It is the why behind the code, the site and the pitch, assembled on 2026-10-15 from every conversation Mitch has had about Axolotl and Mycelium since September 2026, plus the research done along the way. When the code, a doc or a request seems to point somewhere this document doesn't, ask Mitch. Don't guess.

Companion documents:

- `docs/AGENT-PLAN.md`: how the agent gets built (the engineering plan).
- `docs/research/school-family-edge-2026-10.md`: the evidence for the school thesis.
- `docs/research/computer-use-agents-2026-10.md`: the state of agents on messy systems.
- `archive/README.md`: the rules archive (eligibility and procedure as tested code).

## 1. The one-paragraph version

Institutions are judged on outcomes that happen in the lives of the people they serve. A school is paid for attendance, a union fund pays premiums a state would pay, a hospital absorbs what Medicaid should have covered. Many of those outcomes are ones the institution and the person both want, and still never happen, because reaching them takes individual attention that costs more than any one party can capture, and because the barriers sit between institutions, where it's nobody's job. Mitch calls this **stranded alignment**. AI collapses the cost of individual attention. Institutional sponsorship, paid on results, makes it someone's job. Mycelium gives each person a helper that works for them, by text, in their language, sponsored by the institution that loses when their life stalls, and that finishes what they owe and are owed across every institution involved. Schools are the first sponsor. The helper is how personal agents will actually reach the people who need them most: not through app stores, but through the institutions they already belong to.

## 2. Where this came from (so you can read the repo)

The idea arrived in stages, and the codebase has artifacts from each one. Knowing which stage a module belongs to tells you whether it's current.

1. **Axolotl (Sept 2026):** a parent's agent for school. Text-based, English and Spanish, helping parents deal with school communications and forms. Mitch deliberately rejected becoming a "front desk AI" company for schools. Artifacts: email triage, school forms, the Spectrum/iMessage app, "done means confirmed", the axolotl mascot.
2. **The sandwich generation and employers (late Sept).** The same helper for working adults caring for kids and aging parents, sold to employers of hourly workers at about $1 per employee per month. Mitch was never convinced employers would pay.
3. **Union benefit funds and the "wrong payer" (early Oct).** The insight: when a person doesn't claim what they're owed, the cost doesn't disappear. It lands on a payer who can't refuse (the fund, the hospital, the family). The fix has to come from the person's side, because only the person holds the facts and the standing to act across institutions. First concrete market: enrolling retirees in New York's Medicare Savings Program when a fund is reimbursing their Part B premium (1199SEIU identified as the strongest first customer). Artifacts: "Benny" (`src/benefits/`), the rules archive (`archive/`, NY/CA/IL, seven playbooks), the funds and members pages, the Part B calculators, the enterprise-readiness plan.
4. **The "state shift" (Oct).** When a person's interface with an institution becomes an individual agent instead of a portal, an email or a call center, the institution finally sees what's changing in the person's life (job loss, new baby, turning 65, disability, a move), which changes what it should pay or be paid. Liability shifts, and institutions start interacting with each other through the person's agent.
5. **Stranded alignment (Oct 10–14).** The thesis got its name, its economics and its test (sections 3–5). The school version clicked: a district facing chronic absenteeism giving every struggling family the case worker it could never afford, one who can work outside the school's walls (public programs, transit). Mitch: "Mycelium, Axolotl, it's all sort of one thing. It's this thesis of how agents should diffuse through society."
6. **Schools first, the family edge (Oct 15).** The site went to "schools first" with funds as proof that the mechanism generalizes. Research on the school–family edge, pricing, the scope of the helper, the network idea and the agent build plan were settled the same night (sections 6–11).

Things Mitch said Mycelium is **not**: a front-desk AI, a chatbot on an institution's website, a truancy bot, a "digital caseworker" (he won't use that phrase), or an agent that "owns the outcomes in members' lives" (he would never say that).

## 3. Stranded alignment

**Definition.** Outcomes that an institution and the people it serves both want, which go unrealized because reaching them takes individual attention that costs more than any single party can capture.

- *Alignment*, because both sides genuinely want the same result: the kid in school, the eligible family kept on Medicaid, the premium paid by the right payer.
- *Stranded*, borrowed from "stranded assets": value that's real on paper and can't be reached.

Its two causes:

1. **Too expensive per person.** Baumol's cost disease: services built on human attention (a teacher, a case worker) don't get more productive, so they get relatively more expensive every decade. That's why there was never a case worker for every family.
2. **Nobody's job.** Coase: an institution's boundary is where doing something itself stops being cheaper than buying it. Some work is too expensive to make and too expensive to buy, so it falls into a third category: *neither*. It sits outside every institution's boundary. And the "wrong pocket problem": fixing a family's transit helps the school, the Medicaid plan and the employer, but no one of them captures enough to fund it alone.

**Make, buy, neither.** Today's agents make *make* and *buy* cheaper: coding agents, shopping agents, service bots. Those gains get competed away because everyone gets them. *Neither* is value that has never been captured because no one could afford to go get it. Mitch's claim: as make and buy become cheap everywhere, *neither* becomes the battleground for companies and institutions. That's a falsifiable prediction: we should see institutions buying agents for their members (not chatbots for their websites), contracts priced on outcomes rather than seats, and budgets for work that never had a line.

**The orphan-drug parallel** (the explainer Mitch chose). Before the 1983 Orphan Drug Act, drugs for rare diseases mostly went undeveloped: each market was too small. The act changed the economics and a whole category appeared. Stranded alignment has the same shape (each family's outcome too small to justify a case worker) and the same kind of fix, except the math changes through a cost collapse plus a sponsor willing to pay for outcomes, not a law.

**The intellectual lineage** (cite it openly; the synthesis is Mitch's, the parts aren't): Coase (1937, 1960), Williamson, Baumol, Hayek ("The Use of Knowledge in Society": only the person holds the knowledge), Herd & Moynihan (*Administrative Burden*: learning, compliance and psychological costs), Currie (benefit take-up), Sunstein (sludge), Mullainathan & Shafir (*Scarcity*), Hirschman (*Exit, Voice, and Loyalty*), Bernheim & Whinston (common agency: one agent, many principals), Holmström & Milgrom and Kerr ("On the Folly of Rewarding A, While Hoping for B"), and "The Coasean Singularity?" (Shahidi et al., NBER 2025), the leading economics of agents, which imagines them on the consumer side. Mitch's position: agree with the Coasean premise, disagree about where it pays off first.

**The pitch line:** "Stranded alignment is Coase meets Baumol: mutually beneficial outcomes that transaction costs and human labor costs kept out of reach. AI collapses both, and institutional sponsorship solves the wrong pocket problem."

**Status of the term.** Original (no prior use found in economics, policy or AI as of Oct 2026). Mitch is writing the essay himself. **Do not write essay prose for him.** You may use the concepts on the site and in docs.

## 4. The test: is it a stranded-alignment market?

A candidate needs all five:

1. **A payer with positive-sign exposure.** Someone's money moves up when the outcome happens (attendance funding, a premium offset, capitation). Wanting it isn't enough.
2. **The outcome happens outside the payer's operational boundary.** Teaching happens inside the school; getting a kid to school happens in the family's life.
3. **The blocker is coordination, not scarcity or motivation.** Paperwork, navigation, follow-up: yes. No housing, no doctors, or a person who doesn't want to: no.
4. **Per-case value is below the human-labor threshold.** If each case were worth enough, a human service would already exist. Signature: contingency-fee human services already work the top of the value distribution (SSDI advocates, hospital Medicaid-eligibility vendors, public adjusters); the long tail beneath them is stranded.
5. **Measurable and attributable** within a time frame the payer accepts.

A second signature: per-head funding formulas that pay an institution more for each low-income person it identifies (LCFF's unduplicated count; community colleges' Pell and Promise counts). Wherever identification is stuck on paperwork, there's a market.

What the test rules out: scarcity-blocked surplus, negative-sign exposure (denials, collections: adversarial, not aligned), motivation-blocked outcomes.

Applied honestly to absenteeism: a partial fit. The market is the coordination-blocked share of absences (health appointments, transport, paperwork, lapsed coverage), not all of them.

## 5. How agents should spread: the diffusion thesis

Mitch's core worldview, stated in his own terms: **personal agents will diffuse through institutions sponsoring their members' agents, and this keeps institutions aligned with their members and surfaces problems they didn't know they had.**

Why institutions and not app stores:

- **They have a reason to pay.** They lose money and miss goals when these outcomes don't happen. Consumers have never paid for case management.
- **They have the trigger.** Their records show who needs help before the person asks (the fifth absence, a missing income form, a member turning 65). A personal agent doesn't know when to act.
- **They have trust.** People already read what their school sends.
- **They grant permission.** Institutions will treat uninvited agents as bots to block. A sponsored agent comes through the front door with standing (FERPA's school-official role, a union fund's fiduciary duty, a Medicaid authorized representative).

**The flywheel:** families engage because the helper gets them real things → conversations reveal what's changing in their lives → the institution sees problems it couldn't (forty families on one cut bus route is a policy fix, not forty cases) → outcomes improve, the institution pays, trust grows → the rules archive and portal knowledge compound across sponsors, so every new sponsor starts with a better helper.

**Exit into voice** (Hirschman): chronic absence and disenrollment are silent exits; the helper tells the institution why, in aggregate, without exposing anyone.

**It works in either future.** If families don't have capable personal agents, Mycelium is their agent. If they do (Meta's Muse, ChatGPT, Instinct), Mycelium is how the institution sponsors work inside them: the trigger, the authority to act, the payment for the outcome, the program rules. The product is the sponsorship and the finishing, not the app. (An earlier idea worth keeping in view: institutions publishing connectors that plug into the assistant a person already uses.)

**Common agency.** The family with the chronically absent child is often the same family facing a Medicaid renewal, a rent problem and a utility shutoff. Each institution sees one symptom. The first sponsor brings the helper into the household; every other institution touching that family has a reason to pay into the same helper.

## 6. The school thesis (the wedge)

**The fiscal boundary vs the operational boundary.** A California school's funding already reaches into the family's life: attendance funding by the day, the low-income count that depends on an income form or a CalFresh/Medi-Cal match, Medi-Cal billing for services it provides. Its operations stop at the classroom door. The funding formula already assumes the school is responsible for whether a family's car starts and whether they're enrolled in food assistance; its operations never followed. The gap between the two boundaries is where stranded alignment lives. California is already paying to close it ($4.1B for community schools), but on human coordinators: one coordinator, five hundred families. Baumol again.

**The rings** (how the boundary moves outward):

1. The school's own paperwork, done with the family (enrollment, the income form, consents).
2. The family's public programs (CalFresh, Medi-Cal, SUN Bucks, the renewal sent to the old address).
3. The barriers of daily life (the bus, the appointment, the shutoff notice).
4. Patterns flowing back to the district (the Hayek ring: forty families, one cut route).

**The edge thesis (Oct 15).** Schools aren't inefficient inside the building; they've had software for every process for twenty years. They're inefficient at the **edge**: every process that only completes when a family does something. Attendance, the low-income count, special-education consents, Medicaid consent, enrollment packets, immunization records, FAFSA/CADAA, benefit renewals, health follow-up. These fail at high rates, in the same households, mostly in high-poverty, immigrant-heavy schools. Mitch: "schools are a wildly inefficient place, and agents could be useful" — at that edge.

**The evidence that help works where letters don't** (the mechanism):

- SNAP enrollment: 6% with nothing, 11% with a letter, 18% with a letter plus help applying (Finkelstein & Notowidigdo).
- FAFSA: information alone did nothing; eight minutes of help filing raised filing 16–27 points and college enrollment 8 points (Bettinger et al.).
- Financial-aid texts and emails to 800,000+ students changed nothing (Bird et al.).
- Florida: a note home about an eye exam did nothing; glasses handed out at school raised reading and math, and a quarter of children who needed glasses still went without, mostly because a permission form didn't come back.
- Attendance letters (Rogers & Feller; Robinson et al.) work modestly in trials and shrink at scale. One-way nudging is the ceiling we're trying to break.
- 1 in 5 California students (1.14M) were chronically absent in 2024–25; 44% of California children have an immigrant parent; about 1 in 4 adults in mixed-status families avoided benefits they qualified for. Trust and language are the mechanism, not a feature.

**What's honestly unproven** (say so; the pilot measures it): no published statewide count of eligible-but-uncounted students (the universal-meals dip recovered by 2023–24); no randomized trial of assisted form completion for K-12 families; vendor attendance claims are self-reported. Our first district pilot is designed to be that trial: offered school by school, each student against their own prior year, measured in the district's own records.

**Money mechanics to respect:** the low-income count is pooled over three years (a newly counted student pays about a third in year one); a counted student is worth roughly $9–10K/yr above 55% unduplicated and about $2K below; forms are due by October 31 for the Census Day count, first paid at P-1 in February; most districts are funded on prior-year or three-year-average attendance (LAO 2025-26: 43% current, 19% prior, 38% three-year average), so attendance gains often arrive a year late; charters are paid on current-year attendance; basic-aid districts gain nothing in state money (the site shows $0 on purpose). Supplemental dollars must be "principally directed" to the students who generate them: **enrolling students is not the same as serving them**, so the helper is framed, built and sold as service to families, with the district's count following because the family got what it was owed.

## 7. What the helper is and does

**Scope (settled Oct 15):** anything the school or a public program needs from the family, and anything the family needs from the school or those programs, across institutions. The school is the door, not the boundary. Once the family is in, the helper goes wherever the task goes: the county, the health plan, CSAC, the pharmacy.

**Get it, keep it, use it.** Signing someone up and walking away is the letter again, one step later (about a fifth of 2025 SUN Bucks cards were never activated). The helper finishes the whole thing: gets the benefit, keeps it (renewals before the packet goes missing), and makes sure it's used (the card activated, the appointment booked, the services delivered).

**Broad in what it listens to, narrow in what it does.** A family can text it anything. If the request is on the edge, it acts, always on a yes. If it isn't (a rent dispute, an immigration question), it hands off to a real person or organization rather than guessing. Every conversation starts with something being done, triggered by data the sponsor already holds: the fifth absence → "want me to sort out the bus?"; October with no income form → "want me to get your fee waivers and SUN Bucks? Takes two minutes."; an unsigned assessment consent → "want me to explain this and book the meeting?"

**The three launch jobs (schools):**

1. The income form, and what it unlocks.
2. Whatever keeps a child home.
3. Enrollment and consents.

Each starts from data the district already holds and ends in a record it already keeps (Fall 1 count; daily attendance and funded ADA; completion flags in the student system).

**The family is the unit, not the form.** One yes, one relationship, one channel finishes many tasks. One income verification feeds the count, CalFresh and SUN Bucks; one Medi-Cal renewal can count every school-age sibling.

## 8. The rules the helper never bends

These are product requirements, not marketing. Code must enforce them.

- **It works for the family.** Loyal to the person, paid for by the sponsor, acting only where their interests overlap ("only outcomes good for both").
- **Names in, outcomes out. Never the reasons.** The sponsor triggers the helper with data it already has and sees only the outcome it pays for, in aggregate. It never sees the thread, the eviction notice, the immigration question, the sick grandparent.
- **Nothing without a yes.** Nothing is sent, signed or filed until the person says yes to exactly what will happen, with the exact values shown. Legal attestations are checked by the person, never by the agent.
- **The trigger is not the objective.** The sponsor pays on one outcome; the helper serves the whole family. Written limits protect the person (e.g., never pressure a sick child to attend). Guard against Kerr's problem: never game a count, never misclassify a student.
- **No institution can pay to be recommended.** Institutions may publish pathways and pay for verified completions; ranking is by what the family is eligible for and what helps them, never by who paid.
- **Done means confirmed.** A task is done when the institution confirms it (a confirmation number, a notice), not when a button was clicked.
- **Ask, don't guess.** Every value submitted must trace to a verified family fact, a document or the parent's own answer. No source → ask.
- **Never evade.** No CAPTCHA solving, no stealth, no automated access behind Login.gov. Hand those steps to the person.
- **Minimum data.** Each portal gets only the facts its fields need.

## 9. The business

**Buyers.** School districts first (California), where outcomes have money attached and the buyer can verify them in its own records. New York union benefit funds as proof the mechanism generalizes (Medicare Savings Program enrollment for retirees whose Part B premium the fund reimburses: $202.90/month, about $2,435/year per retiree; roughly 40% of eligible people nationally aren't enrolled; 1199SEIU estimated at about $11M/yr recoverable from public filings). The homepage is for investors; /schools and /funds are for buyers.

**Pricing (settled Oct 15).**

- **Schools:** $5.60 per enrolled student per year, plus $2.40 only if numbers the district certifies to the state move (Fall 1 unduplicated count or funded ADA). $8 maximum. Fiscal-year term, no setup fee, no minimum. Why: the research on outcome pricing (Orb's 2026 survey: outcome-based pricing at 3.8% of AI-agent companies and falling; the one K-12 outcomes contract found, South Bend–SchoolStatus, is 70% base / 30% contingent) says boards sign a mostly-flat fee with a contingent slice, priced on outcomes the buyer's own system logs. Comparable district spend: $2–16 per student (ParentSquare, EveryDay Labs, SchoolStatus, Panorama). At $8, districts under about 14,900 students fit under California's $119,100 bid threshold.
- **Funds:** a fifth of the premiums the state now pays instead of the fund. There the state writes the check the same year and the outcome is on a Medicare record.

**The /schools picker** (`public/scan-data.json`, `tools/site/scan/`): every California district and charter, recoverable money from its own filings (low-income count + attendance, conservative assumptions stated), with Mycelium's cost beside it. It's the sales motion: a free "here's what's stranded in your district" before any meeting.

**Size** (estimates, stated as such). School seat at $8 ≈ $400M/yr nationally (≈49M students), ≈$1B if outcome data justifies $15–20; plus sponsors who pay for the same households (Medi-Cal plans lose about $328 per child-month when coverage lapses; ~37M children on Medicaid/CHIP nationally); families' own unclaimed money is larger still (unclaimed Pell ~$4.4B/yr; California CalFresh ~$3.5B/yr). One form is a small business; the edge is the business. Without a second sponsor this is a good $50–100M-revenue school company; with one, it's the big one.

**The network (the endgame).** Once families trust the helper, institutions start building for it: a county, a health plan or a college publishes what it needs from families, and the helper finishes it with them. They can pay for an application finished. They can never pay to be recommended. Precedents: GetCalFresh became a channel counties accepted; Propel; Plaid. This is speedrun's "agents that become networks" and the literal meaning of the name: a mycelium is the network that carries nutrients between things that can't reach each other.

**The stated aims.** Mitch cares most about families and schools having good outcomes, and about giving people peace of mind, not just money. He needs the business to make money and grow. An earlier stated goal was a strategic acquisition in 1–2 years; tonight's framing to investors is venture-scale through sponsors and the network. Ask him which governs a decision if it matters.

## 10. How the product gets built (summary; details in AGENT-PLAN.md)

- **Build what gets more valuable as models improve; rent what gets cheaper.** Rent the general agent and the browser. Build the trust layer (consent record, review with exact values, authorized-representative standing), institutional pathways (sponsor contracts, direct integrations), family context (verified facts and documents), and per-portal knowledge with a test harness.
- **Forms are data, not pages.** Opus talks, Jev decides, scripts act. The frontier model handles conversation and exploring new portals; Jev (TypeSafe's calibrated decision model, which Mitch has wired in and found very cheap) makes every bounded decision; recorded scripts replay known portals with no model; every field is read back and checked.
- **Sort portals by authority:** Tier 1, portals the sponsor owns (full loop, authorized by contract; often no browser at all); Tier 2, programs that accept an organizational authorized representative (Medi-Cal, likely NY MSP); Tier 3, human-only identity (Login.gov, FSA ID: prepare and hand off).
- **The benchmark.** Replica portals with synthetic families whose correct answers come from the rules archive. Scored on zero wrong fields, zero guessed facts, zero agent-checked attestations, pass^5, cost, handoff rate. Published, it makes the labs optimize for our problem. RL comes later and narrowly.
- **A person behind the helper** during the pilot. Every human finish becomes a recorded workflow and a test; human minutes per completion is the metric that falls with each model.

## 11. How to talk about it

**Voice:** literal, plain, never clever-but-fake. "Helper" everywhere a family or principal reads; "AI" said once, plainly. English and Spanish, kept in step. Buyers judge every site change by one test Mitch set: *does it make the site more compelling and more clear to buyers? If it's neither and just more work, don't.*

**Lines that carry the thesis** (current, on the site or agreed):

- "A helper for every family at your school." (homepage hero)
- "Help for every family, not another letter." (/schools hero)
- "Schools are paid for things only families can finish… Finishing them is nobody's job."
- "The helper is theirs." / "It finishes the whole thing." / "It answers to them."
- "Then anywhere money depends on a person."
- "Same helper. Different sponsor." (retired from the homepage; the idea stands)
- "Personal agents won't spread to everyone through app stores. They'll spread through the institutions we already belong to."
- For investors: "Parents are the human API between their kids' school, their health plan, the benefits office and financial aid."

**Don't say:** "digital caseworker", "agency" as a selling word, "own the outcomes in members' lives", "front desk", anything that implies the institution sees the family's reasons. Don't pander to AI-wary buyers, and don't hide that it's AI. Don't quote vendor attendance claims, Georgia State's "200,000 messages", or numbers not verified. "Cross-institutional agents" is Mitch's phrase, not a16z's.

**Investor frame (Oct 2026):** a16z's Fabrizio Serafini (main investing team, AI apps) on computer-use agents in the long tail of software with no API, including "logging into government and insurance portals", with winners at "the application and context layer, not the model layer"; speedrun's 2026 requests ("observe to act", "agents that become networks"; SR008 applications close Nov 1, 2026); YC's "sell the completed work". Mycelium's answer to "why won't ChatGPT/Meta do this?": no payer, no trigger, no standing, no rules archive, no sponsor trust.

## 12. People and status (as of 2026-10-15)

- **Mitch Howard**, CEO, builds the agents. Brown (Hispanic literature), four years in Providence ESL classrooms, translator at an immigrant-justice clinic, Fulbright teaching in Mexico, ran private-equity partnerships at Clay; grew up in Santa Cruz; homeschooled to train as a nationally ranked tennis player, and says he's always felt like an outsider to institutions. That's the founder-market fit: he can sell to a superintendent and be trusted at the kitchen table.
- **Sarah Xu**, co-founder (Stanford; founding education at Clay; Cognition), currently has a full-time job; Mitch is the one working on Mycelium day to day. The homepage founders line still needs Mitch's wording about her; don't invent facts about her.
- **In motion:** PearX (interviewed), speedrun (deadline Nov 1), discovery with districts (not yet pitching), a 1199 fund contact, an edtech advisor, outreach to the Providence teacher whose classroom Mitch volunteered in, and Lindsay Page (Brown) on pilot evaluation design (Mitch writes that email himself). First pilot target under consideration: Pajaro Valley Unified (next to Santa Cruz; the picker shows about $947K/yr on the table).
- **No paying customer yet.** The next 90 days are about making one piece of this true: one district, one fund, real families finishing real tasks, measured.

## 13. Open questions (don't resolve these silently)

- Which sponsor comes first in practice: the district (the story) or the fund (possibly faster revenue)?
- How much a district will pay before pilot data exists, and whether $8 holds.
- Legal footing per portal (authorized representative forms in CA and NY; whether recording real portals for replicas is acceptable).
- Whether the helper is offered under the school's name, Mycelium's, or both.
- How the family's helper interacts with the personal agents families may already use.
- The second sponsor (a Medi-Cal plan is the likeliest) and when to pursue it.

# Website voice — the messaging brief

**Docs only. This file is the brief; a later pass applies it to `public/index.html` and
`public/es.html`. No page was edited in producing it.**

The site was rewritten from a benefits platform into a school agent, and in the rewrite it lost its
**bite**. It is accurate, warm, and far too small for what this is. It now sells an inbox assistant.
The original sold an advocate.

---

## 1. The diagnosis

### What the page says today

The live hero is **"Meet Axolotl, your school assistant."** and the subhead is
*"Text Axolotl about anything school. It reads the school email you send it, takes care of the forms,
and tells you what actually needs you."*

Every problem on the page is an **inbox problem**: *"Eight emails a week. One that matters."* Every
benefit is a **chore removed**: *"What Axolotl takes off your plate."* The four verbs are
reading, answering, paperwork, follow-through.

None of that is false. All of it is small. It describes a competent assistant for administrative
noise, and it contains no answer to the question a parent actually has: *what is my child owed, and
who is going to get it for them?*

### What the earlier site said — the lines that were lost

From `public/index.html` at `3d14a9e^` (the version before the Benny repositioning):

> **"Every family deserves someone who's on their side."**
>
> "You know what your child needs. Tell Axolotl what's going on — **he figures out what applies,
> what your school is responsible for, and how to get it.**"

> **"You know what your family needs. You shouldn't have to know how to get it."**
>
> "Schools have programs, eligibility rules, forms, deadlines, and people responsible for different
> things. Axolotl puts that system together for you."

> **"Axolotl knows the system. Getting help from a school shouldn't require knowing how the school,
> district, and state work."**

> "He also knows **what your child is actually entitled to**, and what it takes to get it."

> **"The school system wasn't built around the parent."**
>
> "There are programs to help families. There are people whose job is to help. There are rules about
> what schools provide. **But knowing something exists isn't the same as getting it.**"
>
> "Axolotl helps families get from 'something's wrong' to 'it's taken care of.'"

And the block that gave the thesis teeth — the law, by name:

> **"Staying at a cousin's house counts."** Under McKinney-Vento, that student keeps their school and
> gets a ride to it.
>
> **"An evaluation has a clock on it."** Ask under IDEA and the district has a legal deadline.
>
> **"An interpreter is not a favor."** Title VI requires the school to communicate with you in a
> language you understand.
>
> "Same for meals, accommodations, and school stability. You describe the situation; Axolotl handles
> which rule applies."

### In the user's words

> "It lost the full thesis that you and your students are entitled to a lot and you don't need to
> know every institutional complexity to get it. This is a real liaison a real helper to get the most
> out of school, simplify the complexity."

### Precisely what was lost

| Lost | Now instead |
|---|---|
| **The ambition** — an advocate who gets your child what they are owed | A capable assistant that handles school messages |
| **The enemy** — institutional complexity: eligibility rules, deadlines, "who is responsible for this" | The parent's inbox |
| **The stake** — your child's services, programmes and rights | Your evenings and your admin load |
| **The stance** — "someone on your side" | "your school assistant" |
| **The law** — McKinney-Vento, IDEA, Title VI named as *why this isn't a favour* | Absent entirely |

The rewrite did not just soften the copy. **It removed the reason the product exists.** Triage and
forms are the *mechanism*; the entitlement is the *point*. A parent does not want their inbox
handled. They want their kid to get what the school is already obliged to provide.

---

## 2. The register

**Warm, with bite. A real liaison.** On the parent's side. Plain words, second person, no hype
adjectives, no exclamation marks, no startup punchiness, not a productivity tool.

Three rules that define it:

1. **The enemy is the system's complexity, never the school.** Teachers and offices are not
   adversaries; the maze is. This is both truer and safer — we want districts to work with us, and a
   parent who reads "your school is failing you" will not trust an agent that has to cooperate with it.
2. **Bite comes from stated ambition, not from overclaiming.** *"You shouldn't have to learn the
   system to get what your child is owed"* is bold and completely defensible. *"We know exactly what
   your child is entitled to"* is smaller the moment a lawyer reads it. **This company's entire
   posture is that its claims survive inspection** — the voice has to be able to take that heat too.
3. **Name the thing.** Say McKinney-Vento, IDEA, Title VI, a deadline, a route, a form. Specificity is
   what makes it read as a liaison instead of a chatbot. Vague warmth is what made the current page
   feel like an email assistant.

### Three hero options

Each is a different amount of edge. Pick one; the rest of the page follows its temperature.

**A — restrained.** Advocacy as a stance, work as the proof.

> # Someone on your side for school.
>
> You know what your child needs. Axolotl works out what applies, and gets it done.

*Commits us to:* being an advocate rather than a tool, and doing the work rather than advising.
*Can we back it today?* **Yes** — research, forms, letters, calls and follow-up all exist and run
behind an explicit yes.

**B — direct.** The entitlement thesis, stated in a parent's language.

> # You shouldn't have to learn the whole system to get your child what they're owed.
>
> Tell Axolotl what's going on. It finds what applies, and does the work.

*Commits us to:* the claim that entitlements exist and that we are the shortcut to them.
*Can we back it today?* **Yes, if "what applies" stays in the sentence.** The agent checks the family's
situation against federal and state law and cites it (`src/knowledge/rights.ts`,
`src/knowledge/entitlements.ts`, `get_law`). What it cannot do is *assert* entitlement as settled —
eligibility is the district's determination, and the code says so in its own words: *"the agent should
phrase these as 'may be entitled to'."* Keep the "what applies" and the ambition stays honest.

**C — with heat.** The original thesis, which is why it still reads well.

> # The school system wasn't built around you. Axolotl is.
>
> Schools have programs, rules, and deadlines. Knowing they exist was never the hard part. Getting
> them is. That part is ours.

*Commits us to:* taking the parent's side against the maze, and owning the getting.
*Can we back it today?* **Yes.** Every clause is either a fact about institutions (programmes, rules
and deadlines exist) or about us (we do the paperwork). It promises no outcome and names no victim.
This is the option I recommend.

*My pick: **C**, with a runner-up line if it feels too hot for the pilot:* **"Nothing about your child
should be hard to get."**

---

## 3. The lines that must exist somewhere on the page

Final copy — not placeholders. The page may order these differently, but all five must be present.

### a. The entitlement thesis

> **The help exists. Getting it is the hard part.**
>
> Schools have programs to help families, rules about what they have to provide, and people whose job
> is to help. Knowing that something exists is not the same as getting it. That gap is what Axolotl is
> for: you describe what's going on, and it works out what applies and drives it.

And immediately after it, the law block, because this is the paragraph that gives the whole page
teeth:

> **Some of this isn't a favor. It's the law.**
>
> If your child is staying somewhere temporary, McKinney-Vento keeps them at their school and gets
> them a ride to it. If you ask for an evaluation, IDEA puts a deadline on the district. An
> interpreter is not a courtesy — Title VI requires the school to talk to you in a language you
> understand. Same for meals, accommodations, and school stability. You describe the situation;
> Axolotl works out which rule applies, and puts the request in writing.

*(Honesty note for whoever applies this: keep "works out which rule applies". Do not write "we know
what your child is entitled to" — eligibility is the district's call, and the product is built to say
"may be entitled to". The bite survives; the overclaim does not.)*

### b. What it actually does — the four verbs

Keep the existing four; they are accurate and well written. Change only the framing heading, which
currently reads *"Four things, done properly"* (a quality claim) to something with a stake:

> **Read it, answer it, file it, chase it.**

01 **It reads.** … *(unchanged)* 02 **It answers.** … *(unchanged)*
03 **It does the paperwork.** … *(unchanged)* 04 **It follows through.** … *(unchanged)*

### c. What "done" means

Already on the page and it is the best sentence on it. **Keep exactly:**

> **Done means the school confirmed it.**
> A submission is only reported as done when the school's own confirmation comes back. If it cannot
> confirm that, it says so and gives you the link rather than telling you it is handled.

### d. The honesty boundary

Keep the whole *"What it will not do"* section as it stands — it is the differentiator, and the page
already says so out loud: *"The rest of this page only means something if this part is true."* Add
nothing to it that softens it, and add one line to it that the entitlement thesis now requires:

> **It cannot see what your child is already receiving.** Meal balances, attendance, what services are
> in place — that lives in the school's portal, and Axolotl can only read it if you sign in yourself.
> It will not guess, and it will not tell you something it has not seen.

*(This is the honest half of the "delta" thesis. The agent can reason about what may apply from what
you tell it; it cannot observe what your child is currently getting without the portal read. See
`docs/CAPABILITY-TRUTH-TABLE.md` M6 — that section is overdue a correction anyway.)*

### e. The pilot call to action

Unchanged: the waitlist is the front door, with no phone number printed anywhere.

> **Join the pilot.**
> We are onboarding a small group of families. Add your number and we will be in touch about access.

One addition worth making, because it is a parent's first question and the old site answered it in
four words — *"Free. Over text. English or Spanish."* If the pilot is free, say so near the CTA:
**"Free during the pilot. Over iMessage. English or Spanish."** *(Confirm with the user before
writing "free" — the intent is recorded in the conversation, but the claim has to be true on the day
it publishes.)*

---

## 4. The forbidden list

Drawn from `docs/SECURITY-PRIVACY-READINESS.md` §3 and `docs/PRIVACY-AND-COMPLIANCE.md` §2. None of
these may appear on the site, in either language, in any phrasing:

- **"SOC 2"**, certified, compliant, or any badge implying a report we do not hold.
- **HIPAA** or **FERPA** compliance; "we are a school official".
- **"End-to-end encrypted"**, "bank-level", "military-grade", "100% secure".
- **"Your data never leaves the United States"** — false through the Anthropic chain.
- **"We delete everything on request"** without the exceptions (backups, provider safety retention,
  mail already sent to a school).
- **"Your messages never leave our system"** — they go to the model provider.
- **Any launch date**, any "coming soon", any promise of future capability as if it existed now.
- **Nothing the product cannot do.** Cross-check every claim against
  `docs/CAPABILITY-TRUTH-TABLE.md` before publishing.

And four additions specific to this thesis — these are the ways a *good* ambition becomes a false
claim:

1. **Don't assert entitlement as settled fact.** "May be entitled to", "what applies", "the rule that
   applies". Eligibility is the district's determination; the agent's own code says so.
2. **Don't imply we know what the child is currently receiving.** That requires the portal read, with
   the parent signed in.
3. **Don't present baseline programmes as confirmed at their school.** ELO-P, after-school, meals —
   say "generally available in California; I'd confirm it's offered at your school" (M7).
4. **Don't promise an outcome.** "She gets to school" is the goal we work toward, never a guarantee.
   Write what we do: put the request in writing, name the deadline, chase the answer.

The principle, in one line: **the bite comes from ambition stated truthfully.** "You are owed more
than you are getting, and you shouldn't have to learn the system to collect it" is bold, useful, and
true. "We guarantee your child's services" is smaller the moment it is tested.

---

## 5. Spanish

Same register, written rather than translated: **tú**, warm, concrete, no Spanglish. School
vocabulary matters — *la escuela, el distrito, el formulario, el permiso, la ausencia, la
inscripción, la reunión, el salón de clases*.

One word choice matters more than the rest: **"lo que le corresponde"** is the natural Spanish for
what a child is owed, and it carries the entitlement idea without the legal overreach of
"tiene derecho a" as a settled claim. Use **"lo que le corresponde"** or **"lo que le puede
corresponder"**, not "lo que le pertenece".

### The two pillars — preserve literally, never soften

Already live, and they must survive any rewrite **word for word**:

> **No va a enviar nada sin tu sí.**
> Cada correo a tu escuela, cada formulario, cada envío espera un sí explícito de tu parte. Una
> sugerencia no es un permiso, y no se trata como si lo fuera.

> **No te va a decir que un formulario se envió si la escuela no lo confirmó.**
> Un envío solo se reporta como hecho cuando llega la confirmación de la propia escuela.

### Three hero options, Spanish

**A — contenida.**
> # Alguien de tu lado para la escuela.
>
> Tú sabes lo que tu hijo necesita. Axolotl averigua qué le corresponde y lo consigue.

**B — directa.**
> # No tienes que aprenderte todo el sistema para conseguir lo que a tu hijo le corresponde.
>
> Cuéntale a Axolotl qué está pasando. Encuentra qué aplica y hace el trabajo.

**C — con filo.** *(recommended, mirrors the English)*
> # El sistema escolar no fue hecho para ti. Axolotl sí.
>
> Las escuelas tienen programas, reglas y fechas límite. Saber que existen nunca fue lo difícil.
> Conseguirlos sí. De eso nos encargamos.

### The law block, Spanish

> **Algunas de estas cosas no son un favor. Son la ley.**
>
> Si tu hijo se está quedando en un lugar temporal, McKinney-Vento lo mantiene en su escuela y le
> consigue el transporte. Si pides una evaluación, IDEA le pone una fecha límite al distrito. Un
> intérprete no es una cortesía: Title VI exige que la escuela se comunique contigo en un idioma que
> entiendas. Lo mismo con las comidas, las adaptaciones y la estabilidad escolar. Tú describes la
> situación; Axolotl averigua qué regla aplica y pone la solicitud por escrito.

### The delta line, Spanish (the honesty half)

> **No puede ver lo que tu hijo ya está recibiendo.** El saldo de comidas, la asistencia, los
> servicios que ya están puestos: eso vive en el portal de la escuela, y Axolotl solo puede leerlo si
> tú inicias sesión. No va a adivinar, y no te va a decir algo que no haya visto.

---

## 6. Current line → why it undersells → replacement

| Current | Why it undersells | Replacement |
|---|---|---|
| **h1: "Meet Axolotl, your school assistant."** | Frames it as a capability and a category ("assistant" = tool). No stance, no stake, no enemy. It is the single biggest reason the page reads small. | **"The school system wasn't built around you. Axolotl is."** *(hero option C)* |
| **Subhead: "Text Axolotl about anything school. It reads the school email you send it, takes care of the forms…"** | Opens with mechanics — texting, forwarding — before the parent knows why they should care. | **"You know what your child needs. Axolotl works out what applies, and gets it done."** Then the mechanics. |
| **Section: "Eight emails a week. One that matters."** | True and relatable, but it makes the *problem* an inbox. It is one symptom, not the thesis. | Keep the section, but pair it with the entitlement problem: **"The help exists. Getting it is the hard part."** |
| **Section heading: "Four things, done properly."** | A quality claim where a stake belongs. | **"Read it, answer it, file it, chase it."** *(the four verbs themselves are good — keep them)* |
| **Section: "What Axolotl takes off your plate."** | Offloading chores. The parent's goal is not a lighter plate; it is their kid getting what they are owed. | **"What your child is owed, and what it takes to get it."** |
| **Absent: the law** | The old site named McKinney-Vento, IDEA and Title VI. That is what made it read as a *liaison* rather than a chatbot, and it is the most defensible part of the whole thesis. | Add the law block in §3a, verbatim. |
| **Absent: what it cannot see** | The "delta" idea (entitled vs actually receiving) is only half available to us — the receiving half needs the portal read. Leaving it out is safe but incomplete; claiming it would be false. | Add the §3d line: **"It cannot see what your child is already receiving."** |
| **Absent: cost** | A parent's first question after "what is this" is "what does it cost". The old site answered it in four words. | **"Free during the pilot. Over iMessage. English or Spanish."** *(confirm before publishing)* |
| **figcaption: "Your kid's school, taken care of."** | Vague; a place where the thesis could be doing work. | **"On your side, for school."** |
| **CTA: "Join the pilot."** | Fine. Keep. | Unchanged — waitlist primary, no phone number anywhere. |

---

## 7. Sources consulted, and one that does not exist

- `public/index.html`, `public/es.html` — the live copy, extracted and read in full.
- `public/index.html` at `3d14a9e^` — the pre-Benny original, quoted above. **This is where the lost
  thesis lives.**
- `docs/AXOLOTL.md` — read; it covers the iMessage sticker/reaction mechanism, not voice. Nothing to
  draw on for messaging.
- `docs/RELEASE-PLAN.md` §A — the definition of the full promise, used to keep §3b honest.
- `docs/SECURITY-PRIVACY-READINESS.md` §3 and `docs/PRIVACY-AND-COMPLIANCE.md` §2 — the forbidden
  claims, quoted in §4.
- `docs/CAPABILITY-TRUTH-TABLE.md` M6, M7, M8 — the entitlement and baseline-programme caveats that
  constrain how far the thesis can be stated.
- `src/knowledge/rights.ts`, `src/knowledge/entitlements.ts` — what the entitlement layer actually
  does: it reconciles a family's situation against cited federal law, gated so it returns nothing for
  a private or unknown school rather than over-claiming.
- **`docs/PRODUCT-THESIS.md` and `docs/PARENT-REALITY.md` do not exist.** Sibling agents have not
  written them. If they appear later, this brief should be reconciled against them.

---

## 8. One-line summary for whoever applies this

**Put the entitlement back at the top and keep the honesty where it is.** The page currently leads
with what the agent handles and buries why it matters; the fix is to lead with what the child is owed,
name the law that says so, and let the four verbs and the limits section do the work of proving we can
be trusted to deliver it.

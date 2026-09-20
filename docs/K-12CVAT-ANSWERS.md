# Pre-filled answers: CoSN K-12CVAT and EDUCAUSE HECVAT

**What this is.** Pre-written answers to the security and privacy questions a school district
actually asks, so that a questionnaire does not sit unanswered for a week or get filled in by
someone guessing.

**Which form.** **K-12CVAT** (CoSN's K-12 Community Vendor Assessment Tool) is the K-12 instrument
and the one a district is most likely to hand us. **HECVAT** (EDUCAUSE and Internet2) is the
higher-education tool. They overlap heavily, so the answers below are organised by topic and cover
both. Where the two differ in wording, the K-12CVAT wording is used first.

**How to read it.** Every answer carries a status:

- **Yes** means it is true and we can show where.
- **Partial** means part of it is true and we say which part.
- **No** means it is not true, and we say what we do instead.

A pre-filled questionnaire that overstates the company is worse than an empty one: the first
security review finds the gap, and then nothing else on the form is trusted. So the "No" answers
below are deliberate and should not be softened.

**Source of truth.** `docs/SECURITY-PRIVACY-READINESS.md` (technical posture, with the evidence for
each claim) and `docs/PRIVACY-AND-COMPLIANCE.md` (policy, retention, subprocessors, incident
runbook, corrections ledger). If an answer here ever disagrees with those, they win and this file is
wrong.

---

## 1. Company and product

| Question | Answer | Status |
|---|---|---|
| What is the product? | A school assistant for parents. A parent texts a phone number and the agent answers questions about their child's school, triages school email into a short list of real work, drafts and sends messages to the school with the parent's approval, and fills school forms in a real browser. | Yes |
| Who is the user? | The parent or guardian. There is no student or child facing interface, no student login, and no child facing account of any kind. | Yes |
| What data do you collect? | The parent's phone number; the names and grades of their children; the school; what the parent tells us they need; school emails the parent forwards; and the messages the agent sends or forms it fills on the parent's behalf. | Yes |
| Do you require a student account or student login? | No. We do not create accounts for students, and no student interacts with the product. | Yes |
| Do you collect Social Security numbers, government identifiers, or financial account numbers? | No. We do not ask for them and the current rollout does not accept them. | Yes |
| Do you collect health information? | Not deliberately. There is no health data integration. A parent may mention a diagnosis or a health need in conversation, and that text is treated as sensitive: we keep it out of logs, and we do not share it with any school without the parent's approval of the exact message. | Partial |
| Where is data stored? | In a hosted PostgreSQL database (Supabase) in the United States, and in application logs at our hosting provider (Railway). | Yes |
| How long do you keep it? | Published schedule: conversation messages 90 days; triaged school email 60 days; family profile, cases and memory while the account is active; consent and deletion audit rows 7 years (they contain no family content); application logs 30 days. Full table in `docs/PRIVACY-AND-COMPLIANCE.md` §3. | Partial, see §7 |

## 2. Data privacy

| Question | Answer | Status |
|---|---|---|
| Do you sell student or family data? | No, and we have no mechanism to do so. | Yes |
| Do you use data for advertising or targeted marketing? | No. There is no advertising system, no ad SDK, and no third party marketing tag on the service. | Yes |
| Do you use student or family data to train AI models? | No. We do not train or fine-tune any model, and we do not supply family data to any provider for training. Our model provider's commercial terms prohibit them from training on our inputs. | Yes |
| Do you share data with third parties? | Yes, with the processors listed in `docs/PRIVACY-AND-COMPLIANCE.md` §7 (model inference, browser automation, hosting, database, email, search). Each receives only what its function needs. We do not share with anyone else, and nothing goes to a school without the parent's approval. | Yes, disclosed |
| Are data processing agreements signed with those processors? | **Not yet with all of them.** This is in progress and is a release gate in our own plan. We will not claim they are complete until they are. | **No** |
| Do you have a published privacy policy? | Yes, at /privacy, with a retention schedule and the subprocessor list. | Yes |
| Do you honour deletion requests? | Yes. A parent texts `reset` and we delete the family profile, children, cases, memory, messages, triaged email, the connected mailbox token and the per family forwarding address, and we revoke the vendor side school portal session first. Full detail in `docs/PRIVACY-AND-COMPLIANCE.md` §4. | Yes |
| Can you delete everything on request? | No, and we say so on the privacy page. Three things survive: encrypted backups until their cycle rolls, copies our model provider keeps under its own safety and anti-abuse rules, and email already sent to a school. | **No**, disclosed |
| Do parents have access to and control over their data? | Yes. They can ask what we hold, correct it in conversation, or delete it with `reset`. | Yes |
| Do you notify parents about AI use? | Yes. The agent introduces itself as an assistant, and the onboarding states plainly what it can do and that nothing happens without the parent's approval. | Yes |
| Do you allow parent review of AI outputs that affect a decision? | Yes in the sense that matters: nothing consequential is sent or submitted without the parent reading and approving the exact content first. | Yes |
| Is the product directed to children? | No. It is directed to parents and guardians. No child interacts with it. | Yes |
| Do you claim FERPA compliance or school official status? | **No.** FERPA binds schools, not vendors. The school official designation is the district's to make. We act on the parent's own access to their child's information, with the parent's permission. | **No**, by design |
| Are you a CCPA "business"? | Probably not yet: we are below all three thresholds (revenue, consumer volume, share of revenue from selling data). We instrument the thresholds and apply the same practices regardless. | Partial |

## 3. Data security

| Question | Answer | Status |
|---|---|---|
| Is data encrypted in transit? | Yes, TLS between the parent's phone, our servers, and every service we call. | Yes |
| Is data encrypted at rest? | Yes by the host for the database and backups. Field level: the credentials we hold for a parent (for example a connected mailbox token) are individually encrypted with AES-256-GCM, and the encrypted value is bound to the family it belongs to so it cannot be opened if copied to another account. Family records and message text are not individually encrypted field by field, and we state that rather than implying otherwise. | Partial, disclosed |
| How are encryption keys managed? | Keys are held as environment secrets in our hosting provider, never in source control. Key rotation is manual today. A managed key service is on the roadmap and not yet in place. | Partial |
| Is there a secret scanning control? | Yes. A check runs on every change and fails the build if a key shaped string appears in tracked files. | Yes |
| Is multi factor authentication enforced for staff access? | Not formally documented at the time of writing. This is an open item in our release plan and we will not claim it until it is true. | **No** |
| How is access to production data controlled? | All data access is server side. Our application server holds a database key with full access, and there is no public database key deployed, so a client cannot reach the database directly. Because that server key bypasses row level security, the application's own authorization logic is the effective boundary, and we say so rather than implying row level security alone protects records. | Yes, with the qualification stated |
| Is row level security in place? | Row level security is defined in our schema for the family tables and scoped to the family. We have not yet verified on the live database that every policy file has been applied; that verification is an open item. | Partial |
| Is there field level restriction for the most sensitive fields? | Not yet. Special education and housing related fields sit in the same tables as the rest. Field level restriction is an identified item, not a shipped one. | **No** |
| Is access to production logged and reviewed? | Access is logged by the hosting and database providers. A formal, dated access review process is an open item and SOC 2 evidence cannot be back filled, so we are starting it rather than deferring it. | Partial |
| Do you log actions taken by the AI, with user, date and action? | Partially. We record consent events (which family, what kind of action, when) and we log tool invocations with names, emails and phone numbers masked before anything is written. We do not yet provide a customer queryable, tamper resistant audit log, and retention of these logs beyond 30 days is not yet in place. | Partial, see §4 |
| Are webhooks authenticated? | Yes. The inbound email webhook requires a timing safe shared secret and rejects the request if the secret is not configured, so it fails closed. The browser vendor webhook verifies an HMAC signature over the raw body and rejects payloads outside a five minute freshness window, so a captured request cannot be replayed. | Yes |
| How do you handle vulnerabilities in dependencies and code? | We run a type check and a test suite (roughly 400 assertions across 16 suites) on every change, plus a secret scan. We do not yet have a formal vulnerability management programme with a scanning cadence, and no third party penetration test has been performed. | Partial |
| Do you have a written incident response plan? | Yes, in `docs/PRIVACY-AND-COMPLIANCE.md` §5, including the notification clocks we are actually bound by: 30 calendar days in California and New York, an internal decision gate at day 10 to 14, and 60 days for the FTC health breach rule. | Yes |
| Do you have a disaster recovery or business continuity plan? | Not as a written, tested plan. Database backups are provided by the host. We are not claiming more than that. | **No** |
| Do you segregate backups from production? | Not yet verified. This is an open item, and it is one of the three operational failures behind a recent $5.1M edtech settlement. | **No** |
| Do you have a vulnerability disclosure policy? | Yes, with safe harbour for good faith research, published at `docs/VULNERABILITY-DISCLOSURE.md`, with a machine readable `/.well-known/security.txt`. | Yes |
| Do you have cyber liability insurance? | Not yet. It is a release gate in our plan. | **No** |
| Do you run background checks and security training for staff? | Not formally documented. Open item. | **No** |
| Do you have a SOC 2 report? | **No.** We hold no SOC 2 report, and we will not use the word compliant about a report we do not have. If a district requires one for procurement, the honest answer today is that it does not exist, and the alternative we can offer is this document plus a walkthrough with our engineering lead. | **No** |
| Are you certified under ISO 27001, HITRUST, or similar? | No. | **No** |
| Do you use a third party to test your security? | Not yet. | **No** |

## 4. The seven HECVAT AI questions

These are asked verbatim in the HECVAT AI section. Answered from the code, not from ambition.

**1. Does your solution have an AI risk model when developing or implementing your AI model?**
**Partial.** We maintain two written artefacts: a capability truth table that maps every parent
facing promise to the code that backs it, and a security and privacy readiness audit that lists each
control with its verification status and each gap with its risk. That is a real risk process for
what we ship. We do **not** have a formal AI risk model aligned to the NIST AI Risk Management
Framework, and we will not claim one.

**2. Do you have documented technical and procedural processes to address potential negative impacts
of AI as described by the NIST AI RMF?**
**Partial.** Not RMF aligned. What we do have, and can demonstrate in code: a consent gate that
refuses to execute any consequential action without the parent's explicit approval, a fill and
submit split so that reading a page can never cause a submission, a requirement that a submission is
only reported as successful when the school's own page confirms it with a reference number, log
redaction of family identifiers, complete deletion on request, and a documented decision not to
build companionship or persona features. What we do not have: a formal RMF mapping, an internal
red team cadence, or a measured reliability programme.

**3. Do you separate ML training data from your ML solution data?**
**Yes, by architecture.** We do not train or fine tune any model, and we do not supply family data to
any provider for training. There is therefore no training corpus in our system to separate. Our model
provider's commercial terms prohibit training on our inputs. The qualification: providers retain
inputs for a period under their own abuse and safety programmes, which is disclosed to parents and
described in question 6.

**4. Do any actions taken by your solution's LLM features or plugins require human intervention?**
**Yes, all of the consequential ones.** This is our strongest answer. Sending an email, submitting a
form, and placing a call each wait for the parent's explicit yes, enforced by the action runner
rather than by instruction to the model. Filling a form is separated from submitting it. The parent
sees the exact content or the filled form before approving, and an approval only applies to the
proposal shown: if the parent changes anything, the changed proposal is shown again for a fresh
approval.

**5. Is user input data used to influence your AI model?**
**No.** Input is used at request time to produce that reply. It is not used for training or fine
tuning, and it does not become part of any model. We do keep a family context store so the agent
remembers a parent's situation between messages; that is application data under the parent's control
and it is deleted when they ask, not model memory.

**6. If sensitive data is introduced to your solution's AI model, can the data be removed from the AI
model by request?**
**There is no model to remove it from**, because we do not train. The real limitation is different and
we state it plainly: our model provider may retain inputs for up to about 30 days for its own safety
and abuse review, and in rare safety cases for considerably longer, and we cannot delete those copies
on demand. Parents are told this rather than promised something we cannot do.

**7. Do you provide logging for your solution's AI feature(s) that includes user, date, and action
taken?**
**Partial.** We record consent events (family, kind of action, timestamp) and we log each tool
invocation with personal identifiers masked before it is written. We do **not** yet provide a
customer queryable or tamper resistant audit log, and log retention beyond 30 days is not yet in
place. This is a known gap, tracked in our release plan, not something we have solved.

## 5. Accessibility

| Question | Answer | Status |
|---|---|---|
| Do you meet WCAG 2.1 AA? | We have not completed a formal audit, so we do not claim it. The public pages are plain HTML with no reliance on scripting for their content, and the product itself is a text conversation rather than a visual interface. | Partial |

## 6. Where the answer is "No"

Collected here so nobody has to hunt for it. Every one of these is an open item in our release plan.

| Gap | Why it is not done | What it costs the buyer |
|---|---|---|
| No SOC 2 report | We are pre-revenue and have not started an examination | Procurement that requires a report will fail today |
| DPAs not signed with every processor | In progress | A district may require them before signing |
| No penetration test | Not yet commissioned | Cannot show independent verification |
| No MFA policy documented, no dated access reviews | Not formalised | Audit evidence cannot be back filled, so we are starting now |
| Backups not verified as segregated from production | Not yet checked | One of three failures behind a $5.1M settlement |
| No field level encryption for the most sensitive fields | Identified, not built | Special education and housing fields sit with the rest |
| Row level security not verified as applied on the live database | Needs a database console check | Cannot yet demonstrate the policy is enforced |
| No cyber liability insurance | Not purchased | Many districts require a certificate |
| No written disaster recovery plan | Not written | Usually asked for; we have only host backups |
| Retention schedule not yet enforced by a scheduled job | Being built | We published the schedule; it is policy, not yet a process |
| No customer queryable AI audit log | Being built | A district asking for AI logging will get the honest partial answer |
| Not WCAG 2.1 AA audited | Not commissioned | An accessibility dependent family has no assurance |

## 7. Items only the company can complete

Not engineering, and not ours to claim on a form:

1. Sign the data processing agreements, including amending our model provider's instrument, whose
   schedule currently declares no special categories, which is wrong for special education content.
2. Complete a HIPAA risk analysis before any benefits related work.
3. Buy insurance: roughly $2M cyber in force through the term and at least a year after, plus
   errors and omissions cover.
4. MFA everywhere, dated quarterly access reviews, same day offboarding revocation, and backup
   segregation.
5. Take counsel on whether a parent can exercise a child's privacy rights, and on the under 16
   sensitive data question.
6. Decide the launch posture for the phone line.

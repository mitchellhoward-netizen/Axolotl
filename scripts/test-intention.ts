import {
  structuredIgnorance,
  askFromUnknowns,
  unknownDecisionFlips,
  eigForPartition,
  divergence,
  concentrated,
  buildIntention,
  decide,
  AskF1Tracker,
  hypothesize,
  resolveFuzzyMessage,
  hypothesesFromLLM,
  groundIntention,
  extractGrounding,
} from '../src/agent/intention.js';
import type {
  Hypothesis,
  SubClaim,
  CandidateAction,
  PolicyOptions,
} from '../src/agent/intention.js';
import type { FamilyProfile } from '../src/domain/types.js';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function h(partial: Partial<Hypothesis> & { id: string; claim: string }): Hypothesis {
  return {
    direction: partial.claim,
    subClaims: partial.subClaims ?? [],
    belief: partial.belief ?? 0.5,
    evidenceConfidence: partial.evidenceConfidence ?? 0,
    ...partial,
  } as Hypothesis;
}
function sc(kind: SubClaim['kind'], attested: boolean): SubClaim {
  return { kind, attested };
}

const EMPTY_PROFILE: FamilyProfile = { children: [], needs: [], challenges: [] };
const PARTIAL_PROFILE: FamilyProfile = {
  children: [{ name: 'Sofia', grade: '3rd' }],
  school: 'Soquel Elementary',
  district: 'Soquel Union Elementary',
  schoolType: 'public',
  locale: 'en',
  needs: [],
  challenges: ['speech'],
};

console.log('\n# 1. Structured ignorance (Severance schema, family-domain)');
{
  const u = structuredIgnorance(EMPTY_PROFILE);
  const unknown = u.filter((x) => !x.known);
  const flip = unknownDecisionFlips(u);
  check('empty profile -> all 9 dimensions unknown', unknown.length === 9, `got ${unknown.length}`);
  check('decision-flip subset is non-empty', flip.length >= 5);
  check('residency is the top decision-flip unknown', flip[0]?.dimension === 'residency');
  const q = askFromUnknowns(u);
  check('ask targets residency first', !!q && /district|city/.test(q!), `got: ${q}`);
}

console.log('\n# 2. Info-gain & the even-partition rule (TAD Corollary 1)');
{
  check('even 4/4 split -> 1.00', Math.abs(eigForPartition([4, 4], 8) - 1) < 1e-9);
  check(
    'even split beats imbalanced split',
    eigForPartition([4, 4], 8) > eigForPartition([7, 1], 8),
    `${eigForPartition([4, 4], 8)} vs ${eigForPartition([7, 1], 8)}`,
  );
  check('non-discriminating question -> 0', Math.abs(eigForPartition([8], 8)) < 1e-9);
  check('multiway balanced beats binary', eigForPartition([2, 2, 2, 2], 8) > eigForPartition([4, 4], 8));
}

console.log('\n# 3. Divergence detection (HypoSearch)');
{
  const divergent = [
    h({ id: 'a', claim: 'IEP evaluation', belief: 0.3, evidenceConfidence: 0.3, subClaims: [sc('formUrl', false)] }),
    h({ id: 'b', claim: 'Services in existing IEP', belief: 0.35, evidenceConfidence: 0.3, subClaims: [sc('formUrl', false)] }),
    h({ id: 'c', claim: 'Student study team / 504', belief: 0.35, evidenceConfidence: 0.3, subClaims: [sc('formUrl', false)] }),
  ];
  check('3 plausible directions -> divergent', divergence(divergent) === 'divergent');

  const concentrated = [
    h({ id: 'a', claim: 'IEP evaluation', belief: 0.85, evidenceConfidence: 0.4, subClaims: [sc('deadline', false)] }),
    h({ id: 'b', claim: 'Services in existing IEP', belief: 0.15, evidenceConfidence: 0.3, subClaims: [sc('deadline', false)] }),
  ];
  check('dominant belief but weak evidence -> concentrated (not committed)', divergence(concentrated) === 'concentrated');

  const committed = [
    h({ id: 'a', claim: 'IEP evaluation', belief: 0.85, evidenceConfidence: 0.9, subClaims: [sc('deadline', true), sc('formUrl', true)] }),
    h({ id: 'b', claim: 'Services in existing IEP', belief: 0.15, evidenceConfidence: 0.3, subClaims: [sc('deadline', false)] }),
  ];
  check('dominant belief + attested evidence -> committed', divergence(committed) === 'committed');
}

console.log('\n# 4. Speech services — ask the discriminating decision-flip (does the child have an IEP?)');
{
  const intention = buildIntention('my kid needs speech services, what do I do?', PARTIAL_PROFILE, [
    h({ id: 'a', claim: 'Request a speech/language IEP evaluation', belief: 0.35, evidenceConfidence: 0.2, subClaims: [sc('formUrl', false), sc('contact', false)], assumptions: { iep504: 'no-iep' } }),
    h({ id: 'b', claim: 'Ask for services under an existing IEP', belief: 0.4, evidenceConfidence: 0.2, subClaims: [sc('formUrl', false), sc('deadline', false)], assumptions: { iep504: 'has-iep' } }),
    h({ id: 'c', claim: 'Pursue a 504 / Student Study Team', belief: 0.25, evidenceConfidence: 0.2, subClaims: [sc('contact', false)], assumptions: { iep504: 'no-iep' } }),
  ]);

  check('intention is divergent', intention.status === 'divergent');
  // Knowing the child is a speech NEED does not mean we know they have an IEP.
  check('iep504 is still an unconfirmed decision-flip', unknownDecisionFlips(intention.unknowns).some((f) => f.dimension === 'iep504'));

  const research: CandidateAction[] = [
    { kind: 'research', label: 'district speech-language evaluation referral form', cost: 0.8, partitionSizes: [2, 1] },
  ];
  const decision = decide(intention, research, { minValue: 0.05, budgetUsed: 0, budgetCap: 3, askCost: 0.5 });
  check(`decision is ask (${decision.action})`, decision.action === 'ask', decision.reason);
  check('ask is for the IEP decision-flip', /IEP|504/i.test(decision.question ?? ''), decision.question);
}

console.log('\n# 5. Enrollment after a move — ask the discriminating fact before researching a portal');
{
  const intention = buildIntention('we moved, how do I enroll?', EMPTY_PROFILE, [
    h({ id: 'a', claim: 'New-student online enrollment (district portal)', belief: 0.5, evidenceConfidence: 0.1, subClaims: [sc('formUrl', false)], assumptions: { schoolType: 'public', existingEnrollment: 'no' } }),
    h({ id: 'b', claim: 'Transfer for a child already enrolled elsewhere', belief: 0.3, evidenceConfidence: 0.1, subClaims: [sc('formUrl', false)], assumptions: { schoolType: 'public', existingEnrollment: 'yes' } }),
    h({ id: 'c', claim: 'Alternative school / charter / private path', belief: 0.2, evidenceConfidence: 0.1, subClaims: [sc('eligibility', false)], assumptions: { schoolType: 'charter-or-private' } }),
  ]);

  const research: CandidateAction[] = [
    { kind: 'research', label: '<district> new student enrollment portal + residency requirements', cost: 1.0, partitionSizes: [2, 1] },
  ];
  const decision = decide(intention, research, { minValue: 0.05, budgetUsed: 0, budgetCap: 3, askCost: 0.3 });
  check(`decision is ask (${decision.action})`, decision.action === 'ask', decision.reason);
  check('ask targets a decision-flip fact that discriminates (school type / prior enrollment)', decision.action === 'ask' && /school|enroll/i.test(decision.question ?? ''), decision.question);
}

console.log('\n# 6. Free-lunch eligibility — ask the discriminating income/SNAP fact');
{
  const intention = buildIntention('is my daughter eligible for free lunch?', { ...EMPTY_PROFILE, children: [{ name: 'A', grade: 'K' }] }, [
    h({ id: 'a', claim: 'Directly eligible via SNAP/CalFresh', belief: 0.4, evidenceConfidence: 0.2, subClaims: [sc('eligibility', false)], assumptions: { incomeEligibility: 'snap' } }),
    h({ id: 'b', claim: 'Income-based free/reduced', belief: 0.4, evidenceConfidence: 0.2, subClaims: [sc('eligibility', false)], assumptions: { incomeEligibility: 'income' } }),
    h({ id: 'c', claim: 'Not eligible', belief: 0.2, evidenceConfidence: 0.2, subClaims: [sc('eligibility', false)], assumptions: { incomeEligibility: 'not' } }),
  ]);

  const research: CandidateAction[] = [
    { kind: 'research', label: '<district> meal eligibility household income limits', cost: 2.0, partitionSizes: [1, 1, 1] },
  ];
  const decision = decide(intention, research, { minValue: 0.05, budgetUsed: 0, budgetCap: 3, askCost: 1.5 });
  check(`decision is ask (${decision.action})`, decision.action === 'ask', decision.reason);
  check('asks the income/SNAP decision-flip', decision.action === 'ask' && /snap|calfresh|income|meal/i.test(decision.question ?? ''), decision.question);
}

console.log('\n# 7. All decision-flips confirmed -> research to ground public info');
{
  const KNOWN_PROFILE: FamilyProfile = {
    children: [{ name: 'Sofia', grade: '3rd' }],
    school: 'Soquel Elementary',
    location: 'Soquel, CA',
    district: 'Soquel Union Elementary',
    schoolType: 'public',
    locale: 'en',
    needs: [],
    challenges: ['iep'],
    getting: ['free meals'],
  };
  const intention = buildIntention('my daughter already has an IEP — how do I request speech services this year?', KNOWN_PROFILE, [
    h({ id: 'a', claim: 'Use the existing IEP annual review to add speech', belief: 0.7, evidenceConfidence: 0.3, subClaims: [sc('formUrl', false), sc('deadline', false)], assumptions: { iep504: 'has-iep' } }),
    h({ id: 'b', claim: 'File a new evaluation request', belief: 0.3, evidenceConfidence: 0.2, subClaims: [sc('formUrl', false)], assumptions: { iep504: 'has-iep' } }),
  ]);

  const research: CandidateAction[] = [
    { kind: 'research', label: '<district> IEP annual review + add-a-service request form', cost: 0.8, partitionSizes: [2, 1] },
  ];
  const decision = decide(intention, research, { minValue: 0.05, budgetUsed: 0, budgetCap: 3, askCost: 0.5 });
  check(`decision is research (${decision.action})`, decision.action === 'research', decision.reason);
  check('research grounds the form + deadline', (decision.evidenceNeeded ?? []).includes('formUrl'));
}

console.log('\n# 8. Ask-F1 instrumentation (HiL-Bench) — anti-spam, blocker-catch');
{
  const t = new AskF1Tracker();
  t.recordBlocker(true); // surfaced a real blocker
  t.recordBlocker(false); // missed one
  t.recordAsk(true); // a relevant question
  t.recordAsk(true); // relevant
  t.recordAsk(false); // a spammy/unnecessary question
  check('precision = 2/3', Math.abs(t.precision - 2 / 3) < 1e-9, t.summary);
  check('recall = 1/2', Math.abs(t.recall - 0.5) < 1e-9, t.summary);
  check('Ask-F1 = harmonic mean', Math.abs(t.askF1 - (2 * (2 / 3) * 0.5) / (2 / 3 + 0.5)) < 1e-9, `Ask-F1=${t.askF1}`);
  check('empty tracker -> Ask-F1 0', new AskF1Tracker().askF1 === 0);
}

console.log('\n# 9. Seam end-to-end on real fuzzy parent messages (hypothesize → resolve)');
{
  const cases: Array<{ msg: string; profile: FamilyProfile; wantAction: 'ask' | 'handoff'; wantMatch?: RegExp }> = [
    {
      msg: 'my kid needs speech services, what do I do?',
      profile: { children: [{ name: 'Sofia', grade: '3rd' }], school: 'Soquel Elementary', district: 'Soquel Union Elementary', schoolType: 'public', locale: 'en', needs: [], challenges: ['speech'] },
      wantAction: 'ask',
      wantMatch: /IEP|504/i,
    },
    {
      msg: 'we moved, how do I enroll?',
      profile: { children: [], needs: [], challenges: [] },
      wantAction: 'ask',
      wantMatch: /school|enroll/i,
    },
    {
      msg: 'is my daughter eligible for free lunch?',
      profile: { children: [{ name: 'A', grade: 'K' }], needs: [], challenges: [] },
      wantAction: 'ask',
      wantMatch: /snap|calfresh|income|meal/i,
    },
  ];
  for (const c of cases) {
    const hyps = hypothesize(c.msg, c.profile);
    check(`hypothesize yields multiple directions for "${c.msg.slice(0, 24)}..."`, hyps.length >= 2, `got ${hyps.length}`);
    const r = resolveFuzzyMessage(c.msg, c.profile);
    check(
      `resolve -> ${c.wantAction} for "${c.msg.slice(0, 24)}..."`,
      !!(r && r.decision.action === c.wantAction),
      r ? r.decision.reason : 'null',
    );
    if (c.wantMatch && r?.decision.question) {
      check(`question matches ${c.wantMatch}`, c.wantMatch.test(r.decision.question), r.decision.question);
    }
  }
  // A clear, non-ambiguous message should NOT be treated as fuzzy.
  const hyps = hypothesize('what time does school start?', EMPTY_PROFILE);
  check('non-fuzzy message -> no hypotheses (not forced into the layer)', hyps.length === 0, `got ${hyps.length}`);
}

console.log('\n# 10. LLM hypothesis mapping + grounding (DualStake: evidence before commit)');
{
  // Map LLM "solution space" -> Hypothesis[] (sub-claims start unattested).
  const raw = [
    { claim: 'Request a speech/language IEP evaluation', direction: 'Special-ed evaluation', program: 'Special Ed', assumptions: { iep504: 'no-iep' }, belief: 0.4 },
    { claim: 'Add speech as a service under the existing IEP', direction: 'IEP add-a-service', program: 'Special Ed', assumptions: { iep504: 'has-iep' }, belief: 0.35 },
    { claim: 'Pursue a 504 / Student Study Team', direction: '504 plan', assumptions: { iep504: 'no-iep' }, belief: 0.25 },
  ];
  const hyps = hypothesesFromLLM(raw);
  check('maps to 3 hypotheses', hyps.length === 3);
  check('sub-claims start unattested (evidence-confidence 0)', hyps[0]?.evidenceConfidence === 0 && hyps[0]?.subClaims.every((s) => !s.attested));
  check('assumptions carried through', hyps[1]?.assumptions?.iep504 === 'has-iep');

  // Grounding: a concentrated-but-weak hypothesis can only COMMIT once its sub-claims are attested.
  const intention = buildIntention('add speech to the existing IEP', { children: [{ name: 'S', grade: 'K' }], needs: [], challenges: ['iep'] }, [
    hyps[1]!, // belief 0.35 -> not dominant alone; use a dedicated concentrated set instead
  ]);
  // Build a properly concentrated intention (dominant belief, weak evidence).
  const conc = buildIntention('add speech to the existing IEP', { children: [], needs: [], challenges: ['iep'] }, [
    { ...hyps[1]!, belief: 0.9, evidenceConfidence: 0, subClaims: [
      { kind: 'formUrl', attested: false }, { kind: 'deadline', attested: false }, { kind: 'contact', attested: false },
    ] },
    { ...hyps[0]!, belief: 0.1, evidenceConfidence: 0 },
  ]);
  check('concentrated but unattested -> not yet committed', conc.status === 'concentrated');

  const grounded = await groundIntention(conc, async () => ({ formUrl: { value: 'https://district.edu/forms/iep-service', source: 'District' }, deadline: { value: 'before 3/1', source: 'District' }, contact: { value: 'sped@district.edu', source: 'District' } }));
  check('grounding attests the sub-claims', grounded.hypotheses[0]!.subClaims.filter((s) => s.attested).length >= 2);
  check('grounding raises evidence-confidence', grounded.hypotheses[0]!.evidenceConfidence > 0.5);
  check('now committed (belief + attested evidence)', grounded.status === 'committed');

  // A researchFn that returns null -> no-op -> stays concentrated.
  const unchanged = await groundIntention(conc, async () => null);
  check('null research -> no change', unchanged.status === 'concentrated' && unchanged.hypotheses[0]!.evidenceConfidence === 0);
}

console.log('\n# 11. Grounding is NOT hollow — a single node cannot attest every kind');
{
  // Generic node: has a URL but no deadline/contact/eligibility signal in its text.
  const generic = [{ title: 'Enrollment', summary: 'Please see the enrollments page.', url: 'https://district.edu/enroll' }];
  const out = extractGrounding(generic, ['formUrl', 'deadline', 'eligibility', 'contact']);
  check('generic node -> ONLY formUrl attested', !!out?.formUrl && !out?.deadline && !out?.contact && !out?.eligibility, JSON.stringify(out));

  // Rich node: a real date, email, and eligibility signal are present.
  const rich = [{ title: 'Meal application', summary: 'Apply by March 1. For free or reduced meals, email meals@district.edu. Income under 185% of the federal poverty line.', url: 'https://district.edu/meals' }];
  const out2 = extractGrounding(rich, ['formUrl', 'deadline', 'eligibility', 'contact']);
  check('rich node -> deadline attested (real date)', !!out2?.deadline, JSON.stringify(out2?.deadline));
  check('rich node -> contact attested (real email)', !!out2?.contact, JSON.stringify(out2?.contact));
  check('rich node -> eligibility attested (free/reduced + 185%)', !!out2?.eligibility, JSON.stringify(out2?.eligibility));

  // evidenceConfidence must reflect only genuinely-evidenced kinds (no 4/4 from one generic node).
  const intention = buildIntention('how do I enroll?', { children: [], needs: [], challenges: [] }, [
    h({ id: 'a', claim: 'Enroll', belief: 0.9, evidenceConfidence: 0, subClaims: [sc('formUrl', false), sc('deadline', false), sc('eligibility', false), sc('contact', false)] }),
    h({ id: 'b', claim: 'Transfer', belief: 0.1, evidenceConfidence: 0, subClaims: [sc('formUrl', false)] }),
  ]);
  const grounded = await groundIntention(intention, async () => extractGrounding(generic, ['formUrl', 'deadline', 'eligibility', 'contact']));
  const conf = grounded.hypotheses[0]!.evidenceConfidence;
  check('generic node -> evidenceConfidence = 1/4, NOT committed (under-commits safely)', Math.abs(conf - 0.25) < 1e-9 && grounded.status !== 'committed', `conf=${conf} status=${grounded.status}`);
}

console.log('\n# 12. Sensitive-dimension carve-out (displaced family is never interrogated on housing)');
{
  const u = structuredIgnorance(EMPTY_PROFILE);
  check('by default residency is a decision-flip candidate', unknownDecisionFlips(u)[0]?.dimension === 'residency');
  const flipsNoSensitive = unknownDecisionFlips(u, false);
  check('displaced context -> residency excluded from ask candidates', !flipsNoSensitive.some((f) => f.dimension === 'residency'), flipsNoSensitive.map((f) => f.dimension).join(','));
  check('displaced -> askFromUnknowns does NOT probe residence', !/district|city/.test(askFromUnknowns(u, false) ?? ''), askFromUnknowns(u, false) ?? '');
  // Sensitive dims are still available when the context is NOT displaced.
  check('non-displaced -> residency still the default ask', /district|city/.test(askFromUnknowns(u, true) ?? ''));
}

console.log('\n# 13. Commit is evidence-driven, not belief-driven (calibration)');
{
  // Low belief but strong evidence -> COMMITS (evidence gates commit, not miscalibrated belief).
  const lowBeliefHighEvidence = [
    h({ id: 'a', claim: 'X', belief: 0.3, evidenceConfidence: 0.9, subClaims: [sc('formUrl', true), sc('deadline', true), sc('eligibility', true), sc('contact', true)] }),
    h({ id: 'b', claim: 'Y', belief: 0.7, evidenceConfidence: 0.1, subClaims: [sc('formUrl', false)] }),
  ];
  check('evidence commits even with low belief', divergence(lowBeliefHighEvidence) === 'committed');

  // High belief but weak evidence -> concentrated, NOT committed (no over-confident commit).
  const highBeliefLowEvidence = [
    h({ id: 'a', claim: 'X', belief: 0.9, evidenceConfidence: 0.2, subClaims: [sc('formUrl', false)] }),
    h({ id: 'b', claim: 'Y', belief: 0.1, evidenceConfidence: 0.1 }),
  ];
  check('high belief + weak evidence -> concentrated (not committed)', divergence(highBeliefLowEvidence) === 'concentrated' && concentrated(highBeliefLowEvidence)?.id === 'a');
}

console.log('\n========================================');
console.log(`  ${pass} passed, ${fail} failed`);
console.log('========================================');
if (fail > 0) process.exit(1);

#!/usr/bin/env tsx
/**
 * How Jev does on the YES check (decide.ts `yes_to_exact_values`), on labeled parent replies.
 * Live: needs TYPESAFE_API_KEY, or JEV_ENABLED=true behind a proxy that adds it.
 *
 *   JEV_ENABLED=true npx tsx scripts/calibrate-yes.ts
 *   (behind the cloud proxy, add NODE_USE_ENV_PROXY=1: Node's fetch ignores HTTPS_PROXY otherwise)
 *
 * The number that matters is false approvals at the act threshold: a reply that is not a yes
 * which Jev would let through. The digest gate still holds either way; this is the second check.
 */
import { decide, jevEnabled, thresholdsFor, vetoesYes, yesQuestion } from '../src/agent/decide.js';

const ASKED = [
  'Reply YES to approve the email ready to send.',
  'Reply YES to approve the form ready to submit.',
];

/** [reply, is it a clear approval?] English and Spanish, the messy ways parents answer. */
const LABELED: Array<[string, boolean]> = [
  ['yes', true], ['Yes', true], ['yes please', true], ['yep', true], ['ok', true], ['okay go ahead', true],
  ['go ahead', true], ['submit it', true], ['send it', true], ['yes send it', true], ['sí', true], ['si, mándalo', true],
  ['dale', true], ['sounds good, send it', true], ['👍', true], ['yes!!', true], ['do it', true], ['perfect, yes', true],
  ['ok thanks', false], ['thanks', false], ['no', false], ['no wait', false], ['wait', false], ['not yet', false],
  ['yes but change the grade to 2', false], ['yes what about the other one?', false], ['can you change the last name', false],
  ['what does it say?', false], ['who is this going to?', false], ['hold on, let me check with my husband', false],
  ['lol ok', false], ['ok I will call them myself', false], ['yes the bus was late again today', false],
  ['no, mejor no', false], ['espera', false], ['¿qué dice?', false], ['maybe', false], ['I guess?', false],
  ['ok but not the medical part', false], ['yes, and also email the nurse', false],
];

async function main(): Promise<void> {
  if (!jevEnabled()) {
    console.log('Jev is not configured (TYPESAFE_API_KEY or JEV_ENABLED=true). Nothing measured.');
    process.exit(2);
  }
  const t = thresholdsFor('yes_to_exact_values');
  const rows: Array<{ reply: string; label: boolean; asked: string; p: number; answer: string; vetoed: boolean; ms: number; model?: string; error?: string }> = [];
  for (const asked of ASKED) {
    for (const [reply, label] of LABELED) {
      const d = await decide('yes_to_exact_values', yesQuestion(asked, reply), { record: () => {} });
      const p = d.answer === 'approve' ? d.confidence : d.answer === 'not_approve' ? 1 - d.confidence : 0;
      rows.push({ reply, label, asked, p, answer: d.answer, vetoed: vetoesYes(d), ms: d.ms, model: d.model, error: d.error });
    }
  }
  const errors = rows.filter((r) => r.error);
  const ok = rows.filter((r) => !r.error);
  const at = (th: number) => {
    const fa = ok.filter((r) => !r.label && r.answer === 'approve' && r.p >= th);
    const passed = ok.filter((r) => r.label && r.answer === 'approve' && r.p >= th);
    return { th, falseApprovals: fa.length, falseApprovalReplies: [...new Set(fa.map((r) => r.reply))], yesesLetThrough: `${passed.length}/${ok.filter((r) => r.label).length}` };
  };
  const ms = ok.map((r) => r.ms).sort((a, b) => a - b);
  console.log(JSON.stringify({
    model: ok[0]?.model,
    calls: rows.length,
    errors: errors.length,
    medianMs: ms[Math.floor(ms.length / 2)],
    thresholds: [at(0.5), at(0.9), at(0.95), at(t.act)],
    act: t.act,
    // As the gate uses it: a veto on a yes the regex and digest already accepted.
    veto: {
      at: t.veto,
      nonYesesStopped: `${ok.filter((r) => !r.label && r.vetoed).length}/${ok.filter((r) => !r.label).length}`,
      nonYesesNotStopped: [...new Set(ok.filter((r) => !r.label && !r.vetoed).map((r) => r.reply))],
      yesesStopped: [...new Set(ok.filter((r) => r.label && r.vetoed).map((r) => r.reply))],
    },
  }, null, 2));
  const missed = ok.filter((r) => r.label && !(r.answer === 'approve' && r.confidence >= t.act));
  console.log(`\nYeses that would be asked for the code at ${t.act}: ${[...new Set(missed.map((r) => r.reply))].join(' | ') || 'none'}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

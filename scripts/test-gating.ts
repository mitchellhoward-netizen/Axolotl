/**
 * Tool-gating guardrail (step 1 of the voice refactor's consent audit).
 *
 * INVARIANT under test: the brain's tool loop can reach `proposeSteps` (stage a
 * consent-gated step) but NEVER execute a consequential action directly. Every
 * consequential LLM tool (send_email / submit_form / call_school / account_action
 * [non-verify]) must stage a Step with `requiresConsent: true` and return a
 * consent-ask, NOT a "sent/done" confirmation. `browser_act` (the one directly
 * executing primitive) must refuse submit/advance-like instructions and route
 * them to the gated tools. Filling tools never submit.
 */
import { runTool, LLM_TOOLS, type ToolDeps } from '../src/agent/tools.js';
import type { Step } from '../src/agent/steps/types.js';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    pass++;
    console.log(`  \u2713 ${name}`);
  } else {
    fail++;
    console.log(`  \u2717 ${name}${detail ? ` \u2014 ${detail}` : ''}`);
  }
}

/** A fake deps: records what was staged; has NO executor, so a tool that tried to
 * execute directly would fail loudly (proposing is the only allowed side effect). */
function makeDeps() {
  const recorded: Step[] = [];
  const deps: ToolDeps = {
    profile: undefined,
    getCases: () => [],
    appendCase: () => {},
    proposeSteps: (steps) => recorded.push(...steps),
    knowledge: () => Promise.resolve(''),
    llm: undefined,
  };
  return { deps, recorded };
}

async function main() {
  // send_email → stages a consent-gated step, asks the parent, never "sent".
  {
    const { deps, recorded } = makeDeps();
    const out = await runTool('send_email', { to: 'a@b.edu', subject: 'S', body: 'B' }, deps);
    check('send_email stages one step', recorded.length === 1);
    check('send_email step is consent-gated', recorded[0]?.requiresConsent === true);
    check('send_email returns a consent-ask (not "sent")', /send it|reply "send it"/i.test(out) && !/Email sent/i.test(out));
  }
  // submit_form → stages a consent-gated step.
  {
    const { deps, recorded } = makeDeps();
    const out = await runTool('submit_form', { url: 'https://example.com/form' }, deps);
    check('submit_form stages one consent-gated step', recorded.length === 1 && recorded[0]?.requiresConsent === true);
    check('submit_form asks for YES', /YES to submit/i.test(out));
  }
  // call_school → stages a consent-gated step.
  {
    const { deps, recorded } = makeDeps();
    const out = await runTool('call_school', {}, deps);
    check('call_school stages one consent-gated step', recorded.length === 1 && recorded[0]?.requiresConsent === true);
    check('call_school asks for YES', /YES to place the call/i.test(out));
  }
  // account_action: signup/login consent-gated; verify is trusted (parent-initiated) and NOT gated.
  {
    const { deps: d1, recorded: r1 } = makeDeps();
    const o1 = await runTool('account_action', { url: 'https://example.com', phase: 'signup', fields: [{ label: 'name', value: 'x' }] }, d1);
    check('account_action signup stages a consent-gated step', r1.length === 1 && r1[0]?.requiresConsent === true);
    check('account_action signup asks for YES', /YES to proceed/i.test(o1));
    const { deps: d2, recorded: r2 } = makeDeps();
    await runTool('account_action', { url: 'https://example.com', phase: 'verify', code: '123456' }, d2);
    check('account_action verify is NOT consent-gated (trusted, parent-initiated)', r2.length === 1 && r2[0]?.requiresConsent === false);
  }
  // browser_act: submit/advance-like instructions are refused + routed to the gated tool.
  {
    const { deps, recorded } = makeDeps();
    for (const instruction of [
      'click the Submit button',
      'complete the enrollment form',
      'hit continue',
      'go to the next step',
      'finish the signup',
      'proceed to checkout',
    ]) {
      const out = await runTool('browser_act', { instruction }, deps);
      check(`browser_act refuses: "${instruction}"`, /submit_form|account_action/i.test(out) && !/Action done/.test(out));
    }
    check('browser_act (refused) stages nothing', recorded.length === 0);
  }
  // Filling tools are declared never to submit (contract check, deterministic —
  // invoking them hits real browser/PDF infra).
  {
    const pdfFill = LLM_TOOLS.find((t) => (t as { function?: { name?: string } }).function?.name === 'pdf_fill');
    const browserFill = LLM_TOOLS.find((t) => (t as { function?: { name?: string } }).function?.name === 'browser_fill');
    check('pdf_fill is declared never-to-auto-submit', /NEVER auto-?submits/i.test(String(pdfFill?.function?.description ?? '')));
    check('browser_fill is declared NEVER submits', /NEVER submits/i.test(String(browserFill?.function?.description ?? '')));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error('gating test error:', (e as Error)?.message ?? e);
  process.exit(1);
});

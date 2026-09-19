import { Agent } from '../src/agent/agent.js';
import { LlmClient } from '../src/agent/llm.js';
import { RulesIntentEngine } from '../src/agent/intent/rules.js';
import { MockCalendarProvider } from '../src/integrations/calendar.js';
import { MockMealsProvider } from '../src/integrations/meals.js';
import { MockSis } from '../src/integrations/sis.js';
import { createEmailProvider } from '../src/integrations/email.js';
import { createSeedDb, provisionFamily } from '../src/seed.js';
import { redactForLog } from '../src/agent/tools.js';
import type { Step } from '../src/agent/steps/types.js';
import type { ConversationState } from '../src/agent/state.js';

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

const ID = 'consent-test-conv';

function makeEmailStep(): Step {
  return {
    id: 'email-test',
    caseId: 'email',
    intent: 'send_email',
    channel: 'email',
    counterparty: { role: 'OTHER', email: 'sped@district.edu' },
    payload: { channel: 'email', subject: 'Speech request for Emma', body: 'Please evaluate Emma for speech.' },
    successCondition: { describe: 'Email the request', kind: 'reference_received' },
    requiresConsent: true,
    status: 'awaiting_consent',
  };
}

function makeAgent(llm?: LlmClient): Agent {
  const db = createSeedDb();
  // The seed has no parents/students; create + provision one so buildToolContext resolves.
  db.parents.push({ id: 'parent-maya', phone: '15555550100', email: '', firstName: 'Maya', lastName: 'Lee', studentIds: [] });
  provisionFamily(db, 'parent-maya', {
    children: [{ name: 'Emma', grade: '3rd' }],
    school: 'Soquel Elementary School',
    district: 'Soquel Union Elementary School District',
    schoolType: 'public',
    needs: ['speech'],
    challenges: ['speech'],
  });
  return new Agent({
    llm,
    intentEngine: new RulesIntentEngine(),
    sis: new MockSis(db),
    calendar: new MockCalendarProvider(),
    meals: new MockMealsProvider({}),
    db,
    defaultParentId: 'parent-maya',
    requireVerification: false,
    email: createEmailProvider(),
  });
}

async function main(): Promise<void> {
  const agent = makeAgent();

  // Seed a pending consent-gated step (as the intelligence layer / brain would after a proposal).
  agent.setStateForTest(ID, { phase: 'confirming', collected: {}, pendingSteps: [makeEmailStep()] } as ConversationState);

  // 1. A non-consent reply must EXPOSE the proposal and NOT execute anything.
  const stray = await agent.handle(ID, 'ok thanks');
  check('"ok thanks" does NOT execute (no "Done!")', !stray.text.includes('Done!'), stray.text.slice(0, 60));
  check('"ok thanks" expires the pending steps', !agent.getStateForTest(ID)?.pendingSteps?.length, JSON.stringify(agent.getStateForTest(ID)?.pendingSteps));

  // 2. A strict consent reply DOES execute (via the mock email provider).
  agent.setStateForTest(ID, { phase: 'confirming', collected: {}, pendingSteps: [makeEmailStep()] } as ConversationState);
  const yes = await agent.handle(ID, 'submit it');
  check('"submit it" executes (returns "Done!")', yes.text.includes('Done!'), yes.text.slice(0, 60));
  check('"submit it" clears pending steps after execution', !agent.getStateForTest(ID)?.pendingSteps?.length);

  // 3. "submit it" to a context with a stray affirmative word (e.g. "go") — only whole-message match counts.
  agent.setStateForTest(ID, { phase: 'confirming', collected: {}, pendingSteps: [makeEmailStep()] } as ConversationState);
  const okWord = await agent.handle(ID, 'go');
  check('whole-message "go" is a valid consent', okWord.text.includes('Done!'), okWord.text.slice(0, 60));
  agent.setStateForTest(ID, { phase: 'confirming', collected: {}, pendingSteps: [makeEmailStep()] } as ConversationState);
  const okThanks2 = await agent.handle(ID, 'yes please');
  check('"yes please" is a valid consent', okThanks2.text.includes('Done!'), okThanks2.text.slice(0, 60));

  // 4. Sensitive creds must be redacted from any logged args (password/code/SSN never leak).
  const redacted = redactForLog({ password: 'hunter2', code: '123456', url: 'https://x', fields: [{ label: 'Password', value: 'hunter2' }, { label: 'Email', value: 'a@b.com' }] }) as Record<string, unknown>;
  check('password redacted', redacted.password === '[redacted]', JSON.stringify(redacted));
  check('code redacted', redacted.code === '[redacted]', JSON.stringify(redacted));
  check('sensitive labeled field redacted', (redacted.fields as Array<{ label: string; value: string }>)[0]!.value === '[redacted]', JSON.stringify(redacted.fields));
  check('non-sensitive field preserved', (redacted.fields as Array<{ label: string; value: string }>)[1]!.value === 'a@b.com', JSON.stringify(redacted.fields));
  check('url preserved', redacted.url === 'https://x');

  // A diverted life command expires the old school proposal, never authorizes it.
  agent.setStateForTest(ID, { phase: 'confirming', collected: {}, pendingSteps: [makeEmailStep()], pendingCall: true });
  agent.expirePendingConsent(ID);
  check('life control clears school consent and call flags', !agent.getStateForTest(ID)?.pendingSteps && !agent.getStateForTest(ID)?.pendingCall);
  const afterLife = await agent.handle(ID, 'YES');
  check('YES after a life control cannot execute an old school step', !afterLife.text.includes('Done!'));

  // Exercise the real Agent tool loop, not just the new tool dispatcher.
  const llm = new LlmClient({ apiKey: 'fixture', baseUrl: 'https://fixture.invalid', model: 'fixture' });
  const results: string[] = [];
  const offered: string[][] = [];
  const systems: string[] = [];
  llm.chatWithTools = async (system, messages, tools) => {
    const turns = messages as Array<{ role: string; content?: string }>;
    if (!turns.some(m => m.role === 'tool')) {
      systems.push(system);
      offered.push(tools.map(t => (t as { function: { name: string } }).function.name));
      return { calls: [
        { id: 'context', name: 'get_life_context', arguments: '{}' },
        { id: 'plan', name: 'plan_life_work', arguments: JSON.stringify({ reply: 'Plan saved', facts: [], newCases: [], reports: [] }) },
        { id: 'school', name: 'send_email', arguments: JSON.stringify({ to: 'fixture@example.invalid', subject: 'Paperwork', body: 'Please share the form.' }) },
      ] };
    }
    results.push(...turns.filter(m => m.role === 'tool').map(m => m.content ?? ''));
    return { text: 'I drafted the school email for your approval.' };
  };
  const unified = makeAgent(llm);
  const seed = () => ({ phase: 'idle' as const, collected: {}, onboarded: true, emailProofSent: true,
    profile: { children: [{ name: 'Emma' }], school: 'Fictional School', needs: [], challenges: [] } });
  unified.setStateForTest('with-life', seed());
  let plans = 0;
  await unified.handle('with-life', 'Help me organize paperwork', {
    context: async () => ({ enrolled: true, marker: 'only-this-sender' }),
    plan: async () => { plans++; return 'Saved one plan'; },
  });
  check('same brain offers both life and school tools', ['get_life_context', 'plan_life_work', 'send_email'].every(n => offered[0]!.includes(n)));
  check('same turn reads life context and saves a plan', plans === 1 && results.some(r => r.includes('only-this-sender')));
  check('same turn still stages school email for consent', unified.getStateForTest('with-life')?.pendingSteps?.[0]?.requiresConsent === true);
  results.length = 0;
  unified.setStateForTest('without-life', seed());
  await unified.handle('without-life', 'Help me organize paperwork');
  check('life binding cannot leak into the next sender', plans === 1 && !results.some(r => r.includes('only-this-sender')) && results.some(r => r.includes('not enabled')));
  check('school email still available without life enrollment', unified.getStateForTest('without-life')?.pendingSteps?.[0]?.requiresConsent === true);
  // The school agent a plain parent talks to must be school-only: no benefits tools
  // offered, and no benefits instructions in its prompt.
  check('a sender without life tools is never offered benefits tools', !offered[1]!.includes('get_life_context') && !offered[1]!.includes('plan_life_work') && offered[1]!.includes('send_email'));
  check('a sender without life tools gets a school-only prompt', !/LIFE AND BENEFITS|get_life_context|plan_life_work/.test(systems[1] ?? ''));
  check('life-enabled prompt still carries the benefits instructions', /LIFE AND BENEFITS/.test(systems[0] ?? ''));

  console.log('\n========================================');
  console.log(`  ${pass} passed, ${fail} failed`);
  console.log('========================================');
  if (fail > 0) process.exit(1);
}

void main();

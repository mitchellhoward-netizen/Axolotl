import { Agent } from '../src/agent/agent.js';
import { RulesIntentEngine } from '../src/agent/intent/rules.js';
import { MockCalendarProvider } from '../src/integrations/calendar.js';
import { MockMealsProvider } from '../src/integrations/meals.js';
import { MockSis } from '../src/integrations/sis.js';
import { createEmailProvider } from '../src/integrations/email.js';
import { createSeedDb, provisionFamily } from '../src/seed.js';
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

function makeAgent(): Agent {
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

  console.log('\n========================================');
  console.log(`  ${pass} passed, ${fail} failed`);
  console.log('========================================');
  if (fail > 0) process.exit(1);
}

void main();

import { Agent } from './agent/agent.js';
import { RulesIntentEngine } from './agent/intent/rules.js';
import { MockCalendarProvider } from './integrations/calendar.js';
import { MockMealsProvider } from './integrations/meals.js';
import { MockSis } from './integrations/sis.js';
import { createSeedDb } from './seed.js';

const db = createSeedDb();
const agent = new Agent({
  intentEngine: new RulesIntentEngine(),
  sis: new MockSis(db),
  calendar: new MockCalendarProvider(),
  meals: new MockMealsProvider(Object.fromEntries(db.students.map((s) => [s.id, s.mealStatus]))),
  db,
  defaultParentId: 'parent-maya',
  now: () => new Date('2026-09-02T12:00:00-07:00'),
});

const SCRIPT = [
  'hi',
  "let's get set up",
  'Emma and Liam',
  'Soquel Elementary School',
  'transportation, meals, conferences',
  "we're staying at a motel right now",
  'no',
  "the school says my kid is chronically absent",
  "we can't get them to school right now, we're staying at a motel",
  'yes',
  "what's the status?",
  'I need to get my kids to school, we are staying at a motel right now',
  'Both',
  'Soquel Elementary',
  'did you actually submit that?',
  'who is the principal?',
];

async function main(): Promise<void> {
  console.log('══════════════════════════════════════════════════════');
  console.log('  SchoolAgent — onboarding + help, scripted demo');
  console.log('══════════════════════════════════════════════════════\n');

  for (const line of SCRIPT) {
    const turn = await agent.handle('demo', line);
    console.log(`🧑  You:  ${line}\n`);
    console.log(`🤖  Agent:${indent(turn.text)}\n`);
  }

  console.log('──────────────────────────────────────────────────────');
  console.log('  Nothing above actually reached the school — it is a');
  console.log('  demo. Law facts in src/knowledge/rights.ts; district');
  console.log('  profile in src/knowledge/districts.ts.');
}

function indent(s: string): string {
  return `\n${s
    .split('\n')
    .map((l) => (l ? `       ${l}` : ''))
    .join('\n')}`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

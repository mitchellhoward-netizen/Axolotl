import 'dotenv/config';
import { Agent } from '../src/agent/agent.js';
import { LlmIntentEngine } from '../src/agent/intent/llm.js';
import { LlmClient } from '../src/agent/llm.js';
import { MockCalendarProvider } from '../src/integrations/calendar.js';
import { MockMealsProvider } from '../src/integrations/meals.js';
import { MockSis } from '../src/integrations/sis.js';
import { createSeedDb, provisionalParent } from '../src/seed.js';

const LLM_API_KEY = process.env.DEEPSEEK_API_KEY ?? process.env.OPENAI_API_KEY;
const LLM_BASE_URL = process.env.LLM_BASE_URL ?? 'https://api.deepseek.com';
const LLM_MODEL = process.env.LLM_MODEL ?? 'deepseek-chat';

const db = createSeedDb();
const parent = provisionalParent(db, '+12065550123');

const agent = new Agent({
  intentEngine: new LlmIntentEngine({ apiKey: LLM_API_KEY!, baseUrl: LLM_BASE_URL, model: LLM_MODEL }),
  sis: new MockSis(db),
  calendar: new MockCalendarProvider(),
  meals: new MockMealsProvider(Object.fromEntries(db.students.map((s) => [s.id, s.mealStatus]))),
  db,
  llm: new LlmClient({ apiKey: LLM_API_KEY, baseUrl: LLM_BASE_URL, model: LLM_MODEL }),
});

const SCRIPT = [
  'hi',
  'Sophie',
  'Lakeside School Seattle',
  'transportation',
  'none',
  'no',
  'my kid needs a bus to Lakeside',
];

async function main(): Promise<void> {
  agent.bindParent('lakeside', parent!.id);
  for (const line of SCRIPT) {
    console.log(`🧑  ${line}\n`);
    const turn = await agent.handle('lakeside', line);
    console.log(`🤖  ${turn.text}\n`);
    console.log('──────────────────────────────────────────\n');
  }
}

main().catch((e) => {
  console.error('FAILED:', (e as Error)?.message ?? e);
  process.exit(1);
});

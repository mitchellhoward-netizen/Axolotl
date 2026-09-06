import 'dotenv/config';
import readline from 'node:readline/promises';
import { Agent } from './agent/agent.js';
import { LlmIntentEngine } from './agent/intent/llm.js';
import { RulesIntentEngine } from './agent/intent/rules.js';
import { LlmClient } from './agent/llm.js';
import { MockCalendarProvider } from './integrations/calendar.js';
import { MockMealsProvider } from './integrations/meals.js';
import { MockSis } from './integrations/sis.js';
import { createSeedDb, provisionalParent } from './seed.js';

const LLM_API_KEY = process.env.DEEPSEEK_API_KEY ?? process.env.OPENAI_API_KEY;
const LLM_BASE_URL = process.env.LLM_BASE_URL ?? process.env.OPENAI_BASE_URL ?? 'https://api.deepseek.com';
const LLM_MODEL = process.env.LLM_MODEL ?? process.env.OPENAI_MODEL ?? 'deepseek-chat';

const db = createSeedDb();
// A stable "terminal demo" identity — first message triggers onboarding, exactly
// like an unknown phone texting in.
const parent = provisionalParent(db, '+15550123456');

const agent = new Agent({
  intentEngine: LLM_API_KEY
    ? new LlmIntentEngine({ apiKey: LLM_API_KEY, baseUrl: LLM_BASE_URL, model: LLM_MODEL })
    : new RulesIntentEngine(),
  sis: new MockSis(db),
  calendar: new MockCalendarProvider(),
  meals: new MockMealsProvider(Object.fromEntries(db.students.map((s) => [s.id, s.mealStatus]))),
  db,
  llm: LLM_API_KEY ? new LlmClient({ apiKey: LLM_API_KEY, baseUrl: LLM_BASE_URL, model: LLM_MODEL }) : undefined,
});

agent.bindParent('terminal', parent!.id);

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Axolotl — interactive chat');
  console.log(`  Brain: ${LLM_API_KEY ? `LLM (${LLM_MODEL})` : 'offline rules'}`);
  console.log('  Mode: demo (nothing is actually sent to the school)');
  console.log('═══════════════════════════════════════════════════');
  console.log('  Type like you\u2019re texting. Try "my kid needs a bus",');
  console.log('  "we need help with food", or "set up".');
  console.log('  quit / exit to leave.\n');

  if (process.stdin.isTTY) {
    await runInteractive();
  } else {
    await runPiped();
  }
  console.log('Bye 👋\n');
}

/** Interactive terminal REPL (a human at a keyboard). */
async function runInteractive(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      let line: string;
      try {
        line = await rl.question('🧑  you> ');
      } catch {
        break; // EOF / Ctrl-D
      }
      const text = line.trim();
      if (!text) continue;
      if (/^(quit|exit|q)$/i.test(text)) break;
      const turn = await agent.handle('terminal', text);
      console.log(`\n🤖  ${turn.text}\n`);
    }
  } finally {
    rl.close();
  }
}

/** Piped/stdin-redirected input (scripts, CI, tests) — process line by line. */
async function runPiped(): Promise<void> {
  let data = '';
  for await (const chunk of process.stdin) data += String(chunk);
  for (const raw of data.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (/^(quit|exit|q)$/i.test(line)) break;
    console.log(`🧑  ${line}\n`);
    const turn = await agent.handle('terminal', line);
    console.log(`🤖  ${turn.text}\n`);
  }
}

main().catch((e) => {
  console.error('FAILED:', (e as Error)?.message ?? e);
  process.exit(1);
});

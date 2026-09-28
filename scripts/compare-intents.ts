#!/usr/bin/env tsx
/**
 * Side-by-side intent classification: the offline rules, the production LLM engine, and
 * Jev, scored on the same labeled parent messages in English and Spanish.
 *
 * Reports, per engine: accuracy overall and by language, what share of messages it is
 * confident about (and how accurate those are), latency, and Jev's cost. Each engine
 * runs only when its key is set (ANTHROPIC_API_KEY for the LLM, TYPESAFE_API_KEY for Jev).
 *
 *   npm run compare:intents
 *
 * Per-message results go to .cache/intent-compare.jsonl (gitignored).
 */
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'fs';
import type { IntentName } from '../src/domain/intents.js';
import type { IntentEngine } from '../src/agent/intent/engine.js';
import { RulesIntentEngine } from '../src/agent/intent/rules.js';
import { LlmIntentEngine } from '../src/agent/intent/llm.js';
import { JevIntentEngine, JEV_USD_PER_M_INPUT } from '../src/agent/intent/jev.js';
import { smallModel, chatModel } from '../src/agent/model-policy.js';

type Lang = 'en' | 'es';
interface Case { text: string; lang: Lang; gold: IntentName }

// Written as parents text: short, unpunctuated, mixed. Every message has one clear intent.
const CASES: Case[] = [
  // onboarding
  { lang: 'en', gold: 'onboarding', text: "hi i'm new here, how do i get started" },
  { lang: 'en', gold: 'onboarding', text: 'my two kids go to Lincoln Elementary and Roosevelt Middle' },
  { lang: 'es', gold: 'onboarding', text: 'hola soy nueva, como empiezo' },
  { lang: 'es', gold: 'onboarding', text: 'mis hijos van a la primaria Lincoln y a la secundaria Roosevelt' },
  // attendance_issue
  { lang: 'en', gold: 'attendance_issue', text: "my son keeps refusing to go to school and i don't know what to do" },
  { lang: 'en', gold: 'attendance_issue', text: 'got a letter saying my daughter is chronically absent' },
  { lang: 'es', gold: 'attendance_issue', text: 'mi hijo no quiere ir a la escuela, ya van muchas semanas así' },
  { lang: 'es', gold: 'attendance_issue', text: 'me llegó una carta que dice que mi hija falta demasiado' },
  // call_me
  { lang: 'en', gold: 'call_me', text: 'can you give me a call so i can hear how this works' },
  { lang: 'es', gold: 'call_me', text: '¿me puedes llamar para ver cómo funciona?' },
  // call_school
  { lang: 'en', gold: 'call_school', text: "can you call the front office for me, i'm at work" },
  { lang: 'en', gold: 'call_school', text: 'please phone the district and ask about the transfer' },
  { lang: 'es', gold: 'call_school', text: '¿puedes llamar a la oficina de la escuela por mí? estoy trabajando' },
  { lang: 'es', gold: 'call_school', text: 'llama al distrito y pregunta por el cambio de escuela porfa' },
  // schedule_conference
  { lang: 'en', gold: 'schedule_conference', text: "i'd like to set up a parent teacher conference with Ms. Diaz" },
  { lang: 'en', gold: 'schedule_conference', text: 'can we book a meeting with the counselor next week' },
  { lang: 'es', gold: 'schedule_conference', text: 'quiero una junta con la maestra Díaz' },
  { lang: 'es', gold: 'schedule_conference', text: '¿podemos agendar una reunión con la consejera la próxima semana?' },
  // report_absence
  { lang: 'en', gold: 'report_absence', text: 'maya is sick today and wont be in' },
  { lang: 'en', gold: 'report_absence', text: 'leo has a dentist appointment friday morning, he will be late' },
  { lang: 'es', gold: 'report_absence', text: 'maya está enferma hoy, no va a ir a la escuela' },
  { lang: 'es', gold: 'report_absence', text: 'leo tiene cita con el dentista el viernes, va a llegar tarde' },
  // request_meal_voucher
  { lang: 'en', gold: 'request_meal_voucher', text: 'how do i sign up for free lunch' },
  { lang: 'en', gold: 'request_meal_voucher', text: 'we lost income, can the kids get reduced price meals' },
  { lang: 'es', gold: 'request_meal_voucher', text: '¿cómo aplico para el almuerzo gratis?' },
  { lang: 'es', gold: 'request_meal_voucher', text: 'perdimos ingresos, ¿los niños pueden tener comida a precio reducido?' },
  // mckinney_vento_bus
  { lang: 'en', gold: 'mckinney_vento_bus', text: "we're staying at a motel after the eviction, can she still go to her school" },
  { lang: 'en', gold: 'mckinney_vento_bus', text: 'he has no way to get to school, does the district have a bus' },
  { lang: 'es', gold: 'mckinney_vento_bus', text: 'nos desalojaron y estamos en un motel, ¿puede seguir en su escuela?' },
  { lang: 'es', gold: 'mckinney_vento_bus', text: 'no tiene cómo llegar a la escuela, ¿hay camión escolar?' },
  // school_info
  { lang: 'en', gold: 'school_info', text: "what time does school start at Roosevelt" },
  { lang: 'en', gold: 'school_info', text: "what's the phone number for the district office" },
  { lang: 'es', gold: 'school_info', text: '¿a qué hora empiezan las clases en Roosevelt?' },
  { lang: 'es', gold: 'school_info', text: '¿cuál es el teléfono de la oficina del distrito?' },
  // demo_status
  { lang: 'en', gold: 'demo_status', text: 'wait did you actually submit that or is it a demo' },
  { lang: 'es', gold: 'demo_status', text: '¿de verdad lo enviaste o es solo una prueba?' },
  // case_status
  { lang: 'en', gold: 'case_status', text: "what's the status on the lunch application" },
  { lang: 'en', gold: 'case_status', text: 'remind me what we still have open' },
  { lang: 'es', gold: 'case_status', text: '¿cómo va la solicitud del almuerzo?' },
  { lang: 'es', gold: 'case_status', text: 'recuérdame qué tenemos pendiente' },
  // list_students
  { lang: 'en', gold: 'list_students', text: 'which of my kids do you have on file' },
  { lang: 'es', gold: 'list_students', text: '¿qué hijos míos tienes registrados?' },
  // help
  { lang: 'en', gold: 'help', text: 'hey what can you do' },
  { lang: 'es', gold: 'help', text: 'hola, ¿qué puedes hacer?' },
  // unknown
  { lang: 'en', gold: 'unknown', text: 'lol ok' },
  { lang: 'es', gold: 'unknown', text: 'jaja ok' },
];

/** Answers at or above this confidence count as "confident enough to act on". */
const CONFIDENT = 0.6;

interface Row { engine: string; text: string; lang: Lang; gold: IntentName; got: IntentName; confidence: number; seconds: number; inputTokens?: number; error?: string }

async function runEngine(name: string, engine: IntentEngine): Promise<Row[]> {
  const rows: Row[] = [];
  for (const c of CASES) {
    const started = performance.now();
    if (engine instanceof JevIntentEngine) {
      const d = await engine.detectDetailed(c.text);
      rows.push({ engine: name, ...c, got: d.name, confidence: d.confidence, seconds: d.seconds, inputTokens: d.inputTokens, error: d.error });
    } else {
      const d = await engine.detect(c.text);
      rows.push({ engine: name, ...c, got: d.name, confidence: d.confidence, seconds: (performance.now() - started) / 1000 });
    }
  }
  return rows;
}

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(0)}%` : '—');
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

function report(name: string, rows: Row[], note?: string): void {
  const acc = (rs: Row[]) => pct(rs.filter(r => r.got === r.gold).length, rs.length);
  const confident = rows.filter(r => r.confidence >= CONFIDENT);
  const errors = rows.filter(r => r.error);
  console.log(`\n## ${name}${note ? ` (${note})` : ''}`);
  console.log(`  accuracy          ${acc(rows)}   en ${acc(rows.filter(r => r.lang === 'en'))}   es ${acc(rows.filter(r => r.lang === 'es'))}`);
  console.log(`  confident ≥${CONFIDENT}    ${pct(confident.length, rows.length)} of messages, ${acc(confident)} accurate`);
  console.log(`  median latency    ${median(rows.map(r => r.seconds)).toFixed(2)}s`);
  const tokens = rows.reduce((s, r) => s + (r.inputTokens ?? 0), 0);
  if (tokens) {
    const usd = (tokens * JEV_USD_PER_M_INPUT) / 1_000_000;
    console.log(`  cost              $${usd.toFixed(5)} for ${rows.length} messages (${Math.round(tokens / rows.length)} input tokens each, ~$${((usd / rows.length) * 1000).toFixed(3)} per 1,000)`);
  }
  if (errors.length) console.log(`  errors            ${errors.length} (${[...new Set(errors.map(e => e.error))].join(', ')})`);
  const wrong = rows.filter(r => r.got !== r.gold);
  for (const r of wrong) console.log(`  ✗ [${r.lang}] "${r.text}" → ${r.got} (${r.confidence.toFixed(2)}), expected ${r.gold}`);
}

async function main(): Promise<void> {
  const all: Row[] = [];
  console.log(`# Intent comparison on ${CASES.length} messages (${CASES.filter(c => c.lang === 'en').length} en, ${CASES.filter(c => c.lang === 'es').length} es)`);

  const rules = await runEngine('rules', new RulesIntentEngine());
  report('rules (offline regex)', rules);
  all.push(...rules);

  const chat = chatModel();
  const small = smallModel();
  if (chat.apiKey) {
    const llm = new LlmIntentEngine({ apiKey: small.apiKey ?? chat.apiKey, baseUrl: small.apiKey ? small.baseUrl : chat.baseUrl, model: small.apiKey ? small.model : chat.model });
    const rows = await runEngine('llm', llm);
    report(`llm (${small.apiKey ? small.model : chat.model})`, rows, 'production engine; it only knows 8 of the 14 intents');
    all.push(...rows);
  } else {
    console.log('\n## llm — skipped (no ANTHROPIC_API_KEY)');
  }

  if (process.env.TYPESAFE_API_KEY) {
    const jev = new JevIntentEngine({ apiKey: process.env.TYPESAFE_API_KEY, model: process.env.JEV_MODEL });
    const rows = await runEngine('jev', jev);
    report(`jev (${process.env.JEV_MODEL ?? 'jev-latest'})`, rows);
    all.push(...rows);
  } else {
    console.log('\n## jev — skipped (no TYPESAFE_API_KEY)');
  }

  mkdirSync('.cache', { recursive: true });
  writeFileSync('.cache/intent-compare.jsonl', all.map(r => JSON.stringify(r)).join('\n') + '\n');
  console.log('\nPer-message results: .cache/intent-compare.jsonl');
}

main().catch(e => { console.error(e); process.exit(1); });

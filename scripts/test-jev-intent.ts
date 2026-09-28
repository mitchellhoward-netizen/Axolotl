#!/usr/bin/env tsx
/**
 * Jev intent engine, offline: the request it sends and how it reads answers, against a
 * fake fetch. No key and no network needed.
 *
 *   npm run test:jev
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INTENT_CRITERIA, JevIntentEngine, jevIntentRequest, parseJevIntent } from '../src/agent/intent/jev.js';

const reply = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;

test('sends only the message, with one Choice over every intent', () => {
  const body = jevIntentRequest('maya is sick today') as { state: unknown; model: string; questions: Record<string, { type: string; criteria: Record<string, string> }> };
  assert.deepEqual(body.state, { parent_message: 'maya is sick today' });
  assert.equal(body.model, 'jev-latest');
  assert.equal(body.questions.intent.type, 'choice');
  assert.deepEqual(Object.keys(body.questions.intent.criteria).sort(), Object.keys(INTENT_CRITERIA).sort());
});

test('reads the chosen intent and its confidence', async () => {
  const engine = new JevIntentEngine({
    apiKey: 'test',
    fetch: reply({
      model: 'jev-1.13.0',
      answers: { intent: { type: 'choice', choice: 'report_absence', confidence: 0.91, probabilities: { report_absence: 0.93, unknown: 0.07 } } },
      usage: { input_tokens: 420, output_tokens: 10 },
    }),
  });
  const d = await engine.detectDetailed('maya is sick today');
  assert.equal(d.name, 'report_absence');
  assert.equal(d.confidence, 0.91);
  assert.equal(d.inputTokens, 420);
  assert.equal(d.model, 'jev-1.13.0');
});

test('an answer outside the intent set becomes unknown', () => {
  const r = parseJevIntent({ model: 'x', answers: { intent: { type: 'choice', choice: 'order_pizza', confidence: 0.99, probabilities: {} } }, usage: { input_tokens: 1, output_tokens: 1 } });
  assert.equal(r.name, 'unknown');
  assert.equal(r.confidence, 0);
});

test('an API error falls back to unknown and reports the status, not the body', async () => {
  const engine = new JevIntentEngine({ apiKey: 'test', fetch: reply({ error: 'echoed: maya is sick today' }, 429) });
  const d = await engine.detectDetailed('maya is sick today');
  assert.equal(d.name, 'unknown');
  assert.equal(d.confidence, 0);
  assert.equal(d.error, 'typesafe 429');
});

test('a network failure falls back to unknown', async () => {
  const engine = new JevIntentEngine({ apiKey: 'test', fetch: (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch });
  assert.deepEqual(await engine.detect('hi'), { name: 'unknown', confidence: 0 });
});

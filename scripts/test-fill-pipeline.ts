#!/usr/bin/env tsx
/**
 * The form-fill pipeline: which turns are form turns, how the agent's history reaches the
 * native Anthropic API, which models drive it, and how the post-YES submit behaves.
 *
 * The submit tests drive the REAL integration against a fake Skyvern on localhost and assert
 * on the task bodies it receives: the approved page is submitted in its own session with no
 * navigation, and only a missing page (never a CAPTCHA or a rejected value) earns a re-fill.
 *
 *   npm run test:fill-pipeline
 */
import { createServer, type Server } from 'node:http';

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, detail?: string) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

// ── Form turns ──────────────────────────────────────────────────────────────
const { isFormRequest, isFormTurn, FORM_TURN_TOOLS, asksParent } = await import('../src/agent/form-turn.js');
console.log('# form turns');
for (const t of [
  'can you sign Maya up for the after school program',
  'fill out the CKC application for us',
  'enroll him in the summer camp please',
  "fill the waitlist form but don't submit",
  'please apply for free lunch for my kids',
  'puedes inscribir a mi hija en el programa?',
  'llena el formulario de la escuela',
]) check(`form request: "${t}"`, isFormRequest(t));
for (const t of [
  'what is on the enrollment form?',
  'when is the application due?',
  'how much does the after school program cost',
  'my kid is sick today',
  'thanks!',
]) check(`not a form request: "${t}"`, !isFormRequest(t));
check('a yes to an offered fill is a form turn', isFormTurn('yes', 'I found the CKC form. Want me to fill it out for Maya?'));
check('a yes to something else is not', !isFormTurn('yes', 'Want me to remind you tomorrow?'));
check('form turns can fill', FORM_TURN_TOOLS.has('skyvern_fill_form'));
check('form turns cannot send or call on their own', !FORM_TURN_TOOLS.has('send_email') && !FORM_TURN_TOOLS.has('call_school') && !FORM_TURN_TOOLS.has('submit_form'));
check('a question back to the parent counts as asking', asksParent("What's Maya's date of birth?"));
check('a list of programs does not', !asksParent('Here are three programs:\n1. CKC\n2. YMCA'));

// ── Where a form may be filled ──────────────────────────────────────────────
const { authorizeFormUrl } = await import('../src/agent/authorization.js');
console.log('\n# any public form site, never a private address');
for (const u of [
  'https://docs.google.com/forms/d/e/abc/viewform',
  'https://www.campuskidsconnection.com/register',
  'https://form.jotform.com/12345',
  'https://www.signupgenius.com/go/abc',
]) check(`fill allowed: ${u}`, authorizeFormUrl(u).allowed);
for (const u of ['http://localhost:3000/form', 'http://10.0.0.5/admin', 'http://metadata.internal/', 'ftp://example.com/f', 'https://user:pw@evil.com/f', 'not a url'])
  check(`fill refused: ${u}`, !authorizeFormUrl(u).allowed);

// ── History translation for the native API ─────────────────────────────────
const { toAnthropicMessages, isAnthropicApi } = await import('../src/agent/anthropic-native.js');
console.log('\n# OpenAI-shaped history → Anthropic messages');
{
  const thinking = { type: 'thinking', thinking: '', signature: 'sig' };
  const out = toAnthropicMessages([
    { role: 'assistant', content: 'Hi!' },
    { role: 'user', content: 'sign her up' },
    {
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 't1', type: 'function', function: { name: 'web_search', arguments: '{"query":"ckc"}' } }],
      _anthropic_content: [thinking, { type: 'tool_use', id: 't1', name: 'web_search', input: { query: 'ckc' } }],
    },
    { role: 'tool', tool_call_id: 't1', content: '{"result":"found"}' },
    { role: 'user', content: 'nudge' },
    { role: 'assistant', content: null, tool_calls: [{ id: 't2', type: 'function', function: { name: 'now', arguments: '' } }] },
    { role: 'tool', tool_call_id: 't2', content: 'noon' },
  ]);
  check('opens with a user turn', out[0]?.role === 'user');
  check('roles alternate', out.every((m, i) => i === 0 || m.role !== out[i - 1]!.role), out.map((m) => m.role).join(','));
  const a1 = out.find((m) => m.role === 'assistant' && Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_use' && b.id === 't1'));
  check('raw assistant content (with thinking) is carried verbatim', Array.isArray(a1?.content) && a1!.content[0]?.type === 'thinking');
  const u1 = out[out.indexOf(a1!) + 1];
  check('tool results come first in the following user turn',
    Array.isArray(u1?.content) && u1!.content[0]?.type === 'tool_result' && u1!.content[1]?.type === 'text');
  const a2 = out.find((m) => m.role === 'assistant' && Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_use' && b.id === 't2'));
  const t2 = Array.isArray(a2?.content) ? a2!.content.find((b) => b.type === 'tool_use') : undefined;
  check('tool_calls without raw content become tool_use blocks with parsed input',
    Boolean(t2 && t2.type === 'tool_use' && typeof t2.input === 'object'));
}
check('api.anthropic.com is the native API', isAnthropicApi('https://api.anthropic.com/v1'));
check('a local mock is not', !isAnthropicApi('http://127.0.0.1:8080/v1'));

// ── Model defaults ──────────────────────────────────────────────────────────
console.log('\n# model defaults');
{
  const saved = { ...process.env };
  process.env.ANTHROPIC_API_KEY = 'test';
  for (const k of ['CHAT_MODEL', 'FRONTIER_MODEL', 'SMALL_MODEL', 'CHAT_EFFORT', 'SMALL_BASE_URL', 'CHAT_API_KEY']) delete process.env[k];
  const { chatModel, frontierModel, smallModel } = await import('../src/agent/model-policy.js');
  check('the chat model is no longer Haiku', !/haiku/.test(chatModel().model), chatModel().model);
  check('chat runs at medium effort by default', chatModel().effort === 'medium', String(chatModel().effort));
  check('the frontier model is no longer Haiku', !/haiku/.test(frontierModel().model), frontierModel().model);
  check('the small tier stays cheap', /haiku/.test(smallModel().model), smallModel().model);
  process.env.CHAT_MODEL = 'claude-sonnet-5';
  process.env.CHAT_EFFORT = 'bogus';
  check('CHAT_MODEL overrides', chatModel().model === 'claude-sonnet-5');
  check('an invalid effort falls back to the default', chatModel().effort === 'medium');
  process.env = saved;
}

// ── Submit on the approved page ─────────────────────────────────────────────
interface FakeRun { status: string; output?: unknown }
const runs = new Map<string, FakeRun>();
const taskBodies: Array<Record<string, unknown>> = [];
const sessionBodies: Array<Record<string, unknown>> = [];
let queue: FakeRun[] = [];

const server: Server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const json = (code: number, body: unknown) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  let body = '';
  for await (const chunk of req) body += chunk;
  if (url.pathname === '/page') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<html><body><form><input name="child"></form></body></html>');
    return;
  }
  if (url.pathname === '/v1/browser_sessions' && req.method === 'POST') {
    sessionBodies.push(JSON.parse(body || '{}'));
    return json(200, { browser_session_id: 'bs_test' });
  }
  if (url.pathname.endsWith('/close')) return json(200, {});
  if (url.pathname === '/v1/run/tasks' && req.method === 'POST') {
    taskBodies.push(JSON.parse(body || '{}'));
    const id = `run_${taskBodies.length}`;
    runs.set(id, queue.shift() ?? { status: 'completed' });
    return json(200, { run_id: id });
  }
  if (url.pathname.startsWith('/v1/runs/') && url.pathname.endsWith('/artifacts')) return json(200, []);
  if (url.pathname.startsWith('/v1/runs/')) {
    const r = runs.get(url.pathname.split('/')[3]!);
    return r ? json(200, { status: r.status, output: r.output }) : json(404, {});
  }
  return json(404, {});
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const port = (server.address() as { port: number }).port;
process.env.SKYVERN_BASE_URL = `http://127.0.0.1:${port}`;
process.env.SKYVERN_API_KEY = 'test-key';
const { submitFilledForm, fillFormForReviewAsync } = await import('../src/integrations/skyvern.js');
const FORM_URL = `http://127.0.0.1:${port}/page`;
const values = { 'Student first name': 'Maya' };
const confirmed = { status: 'completed', output: { submitted: true, confirmation: 'REF-1' } };

console.log('\n# the post-YES submit uses the page the parent approved');
{
  taskBodies.length = 0;
  queue = [confirmed];
  const sub = await submitFilledForm({ url: FORM_URL, values, browserSessionId: 'bs_test' });
  check('confirmed on the first try', sub.ok && sub.confirmation === 'REF-1', JSON.stringify(sub));
  check('exactly one task ran', taskBodies.length === 1, String(taskBodies.length));
  check('...in the fill\'s own session', taskBodies[0]?.browser_session_id === 'bs_test');
  check('...without a URL (a URL would reload and lose the filled form)', !('url' in (taskBodies[0] ?? {})));
}
{
  taskBodies.length = 0;
  queue = [{ status: 'terminated', output: { error: 'form_not_loaded' } }, confirmed];
  const sub = await submitFilledForm({ url: FORM_URL, values, browserSessionId: 'bs_test' });
  check('a missing page falls back to re-fill at the URL', taskBodies.length === 2 && taskBodies[1]?.url === FORM_URL, JSON.stringify(taskBodies.map((b) => b.url ?? null)));
  check('...and the fallback result is what the parent gets', sub.ok && sub.confirmation === 'REF-1');
}
for (const code of ['validation_error', 'captcha_blocked']) {
  taskBodies.length = 0;
  queue = [{ status: 'terminated', output: { error: code } }];
  const sub = await submitFilledForm({ url: FORM_URL, values, browserSessionId: 'bs_test' });
  check(`${code} on the approved page is final — no second submit`, taskBodies.length === 1 && !sub.ok && sub.errorCode === code, `${taskBodies.length} tasks`);
}
{
  taskBodies.length = 0;
  queue = [{ status: 'completed', output: { submitted: false } }];
  const sub = await submitFilledForm({ url: FORM_URL, values, browserSessionId: 'bs_test' });
  check('an unconfirmed click is never retried (it may have gone through)', taskBodies.length === 1 && sub.status === 'unconfirmed');
}
{
  taskBodies.length = 0;
  queue = [confirmed];
  await submitFilledForm({ url: FORM_URL, values });
  check('without a session it fills and submits at the URL', taskBodies.length === 1 && taskBodies[0]?.url === FORM_URL);
}

console.log('\n# the fill session outlives the parent\'s review');
{
  sessionBodies.length = 0;
  queue = [{ status: 'running' }];
  const r = await fillFormForReviewAsync({ formUrl: FORM_URL, values, program: 'CKC', skipPreflight: true });
  check('fill started', r.ok, JSON.stringify(r));
  const timeout = Number(sessionBodies[0]?.timeout);
  check('the session is opened with a timeout longer than Skyvern\'s 60-minute default', timeout > 60, String(sessionBodies[0]?.timeout));
}

server.close();
console.log(`\n✓ ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

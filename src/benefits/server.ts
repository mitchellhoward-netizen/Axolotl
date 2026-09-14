import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { BenefitsEngine } from './engine.js';
import { BenefitStore, LabError } from './store.js';

const commandBody = z.object({ command: z.enum(['prepare', 'approve', 'cancel', 'repair', 'revise', 'confirm']),
  revision: z.number().int().positive().optional(), hash: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict();
async function body(req: IncomingMessage): Promise<unknown> {
  if (req.headers['content-type'] !== 'application/json' || req.headers['x-benny-lab'] !== '1' ||
    req.headers['sec-fetch-site'] === 'cross-site') throw new LabError('Same-origin JSON lab requests required', 403);
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (Buffer.byteLength(text) > 2048) throw new LabError('Request too large; fictional scenarios only', 413);
  }
  try { return JSON.parse(text); } catch { throw new LabError('Invalid JSON', 400); }
}

export function labServer(engine: BenefitsEngine) {
  const assets: Record<string, [string, string]> = {
    '/': ['index.html', 'text/html'], '/benefits-lab/lab.css': ['lab.css', 'text/css'], '/benefits-lab/lab.js': ['lab.js', 'text/javascript'],
  };
  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader('x-amp-review-widget', 'off');
    const json = (status: number, value: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    try {
      const path = new URL(req.url ?? '/', 'http://lab.invalid').pathname;
      if (req.method === 'GET' && path === '/health') { await engine.store.pool.query('SELECT 1'); json(200, { ok: true, mode: 'simulation' }); return; }
      if (req.method === 'GET' && assets[path]) {
        const [file, type] = assets[path]; res.setHeader('Content-Type', `${type}; charset=utf-8`);
        res.end(await readFile(new URL(`../../public/benefits-lab/${file}`, import.meta.url))); return;
      }
      if (!path.startsWith('/api/')) throw new LabError('Not found', 404);
      const token = /(?:^|;\s*)benny_lab=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie ?? '')?.[1];
      let owner = token ? await engine.store.ownerFor(token) : undefined;
      if (!owner && req.method === 'GET' && path === '/api/state') {
        const fresh = randomBytes(32).toString('hex'); owner = await engine.store.createWorkspace(fresh);
        const secure = req.headers['x-forwarded-proto'] === 'https';
        res.setHeader('Set-Cookie', `benny_lab=${fresh}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${secure ? '; Secure' : ''}`);
      }
      if (!owner) throw new LabError('Open the lab first to create a fictional workspace', 401);
      if (req.method === 'GET' && path === '/api/state') { json(200, await engine.state(owner)); return; }
      if (req.method !== 'POST') throw new LabError('Method not allowed', 405);
      const input = await body(req);
      if (path === '/api/cases') {
        const { scenarioId } = z.object({ scenarioId: z.string().max(64) }).strict().parse(input);
        await engine.load(owner, scenarioId);
      } else if (path === '/api/clock') {
        const { minutes } = z.object({ minutes: z.union([z.literal(1), z.literal(60), z.literal(1440)]) }).strict().parse(input);
        await engine.store.advance(owner, minutes); await engine.tick(owner);
      } else if (path === '/api/tick') {
        z.object({}).strict().parse(input); await engine.tick(owner);
      } else {
        const match = /^\/api\/cases\/([0-9a-f-]{36})\/command$/.exec(path);
        if (!match || !z.uuid().safeParse(match[1]).success) throw new LabError('Not found', 404);
        const { command, revision, hash } = commandBody.parse(input);
        await engine.command(owner, match[1]!, command, revision, hash);
      }
      json(200, { ok: true });
    } catch (e) {
      json(e instanceof LabError ? e.status : e instanceof z.ZodError ? 400 : 500,
        { error: e instanceof LabError ? e.message : e instanceof z.ZodError ? 'Invalid request. Only built-in fictional inputs are accepted.' : 'Lab request failed. Check local service health.' });
    }
  });
}

async function main(): Promise<void> {
  const store = new BenefitStore();
  await store.init();
  const engine = new BenefitsEngine(store); const server = labServer(engine);
  let working = false;
  const timer = setInterval(async () => {
    if (working) return; working = true;
    try { for (const owner of await store.owners()) await engine.tick(owner); }
    catch { console.error('Benefits lab worker failed; work remains durable for the next tick.'); }
    finally { working = false; }
  }, 2000);
  server.listen(Number(process.env.PORT ?? 3100), '0.0.0.0', () => console.log('Benefits lab running: simulation only; no live providers.'));
  const stop = () => { clearInterval(timer); server.close(() => { void store.close().then(() => process.exit(0)); }); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(() => { console.error('Benefits lab could not start. Start the dedicated local lab database; live DATABASE_URL is never used.'); process.exitCode = 1; });
}

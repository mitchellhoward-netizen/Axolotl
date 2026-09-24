/**
 * Renders public/share.png and public/share-es.png from tools/site/share.html.
 *
 *     node scripts/build-share.mjs
 *
 * The share cards are built from the same strings and tokens as the pages, so
 * the card cannot advertise copy the site no longer says. Run this after
 * changing the hero copy, then commit the two PNGs.
 *
 * It serves the repo root over HTTP because the card imports the strings modules
 * and the mascot PNG; file:// would block both. Chromium is required (the orb and
 * CI both have it); on a machine without it, install Chrome or run the site's
 * screenshot step by hand.
 */

import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = 8791;
const WIDTH = 1200;
const HEIGHT = 630;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
};

const server = createServer(async (req, res) => {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const target = path.join(ROOT, urlPath);
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(target)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});

/** Find a Chromium to drive. */
async function chromePath() {
  const { existsSync, readdirSync } = await import('node:fs');
  const home = process.env.HOME ?? '';
  const base = path.join(home, '.agent-browser', 'browsers');
  if (existsSync(base)) {
    const dirs = readdirSync(base).filter((d) => d.startsWith('chrome-')).sort();
    for (const dir of dirs.reverse()) {
      for (const candidate of ['chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome']) {
        const p = path.join(base, dir, candidate);
        if (existsSync(p)) return p;
      }
    }
  }
  for (const p of ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']) {
    if (existsSync(p)) return p;
  }
  return null;
}

const chrome = await chromePath();
if (!chrome) {
  console.error('No Chromium found. Install Chrome for Testing (agent-browser install) and retry.');
  process.exit(1);
}

await new Promise((resolve) => server.listen(PORT, resolve));

for (const lang of ['en', 'es']) {
  const out = path.join(ROOT, 'public', lang === 'es' ? 'share-es.png' : 'share.png');
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-sandbox',
    '--force-device-scale-factor=1',
    `--window-size=${WIDTH},${HEIGHT}`,
    `--screenshot=${out}`,
    `--virtual-time-budget=8000`,
    `http://localhost:${PORT}/tools/site/share.html?lang=${lang}`,
  ];
  await new Promise((resolve, reject) => {
    const child = spawn(chrome, args, { stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`chrome exited ${code}`))));
  });
  const size = (await readFile(out)).length;
  console.log(`wrote public/${path.basename(out)} (${WIDTH}x${HEIGHT}, ${Math.round(size / 1024)}KB)`);
}

server.close();

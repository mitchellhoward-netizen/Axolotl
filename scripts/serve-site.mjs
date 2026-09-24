/**
 * Static preview server for the marketing site, used by the orb portal.
 *
 *     node scripts/serve-site.mjs          # http://localhost:3000
 *     PORT=4000 node scripts/serve-site.mjs
 *
 * This exists only because `python3 -m http.server` cannot resolve the clean
 * URLs the live site uses. Production is Vercel with `cleanUrls: true`, so
 * /es serves public/es/index.html and /schools serves public/schools.html;
 * without this, the portal preview would 404 on every link in the header and
 * the Spanish page could not be reviewed at all.
 *
 * It serves files and nothing else: no API routes, so the forms on the preview
 * show their error state. That is deliberate — the preview must not pretend to
 * store a signup it has nowhere to put.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../public', import.meta.url)));
const PORT = Number(process.env.PORT) || 3000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff2': 'font/woff2',
};

const isFile = async (p) => {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
};

async function resolve(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  if (clean.includes('\0')) return null;
  const target = path.join(ROOT, clean);
  // Never serve outside public/, whatever the path claims.
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) return null;
  const candidates = [
    target,
    `${target}.html`, // cleanUrls: /schools -> schools.html
    path.join(target, 'index.html'), // /es -> es/index.html
  ];
  for (const candidate of candidates) if (await isFile(candidate)) return candidate;
  return null;
}

createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }
  const file = await resolve(new URL(req.url ?? '/', 'http://localhost').pathname);
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>404</h1><p>Not found in public/.</p>');
    return;
  }
  const body = await readFile(file);
  // `no-store` is the whole caching story here. A `Clear-Site-Data` header was
  // tried as well, to evict a copy cached before this one existed, but a preview
  // server that tells the browser to throw its cache away on every page load is
  // a blunt instrument — and the device art is versioned in its URL, so a stale
  // render cannot survive a reload anyway.
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
    'Content-Length': body.length,
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}).listen(PORT, () => console.log(`site preview on http://localhost:${PORT}`));

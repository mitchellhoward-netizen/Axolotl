/**
 * Builds the phone mockup: a staged, fictional conversation rendered inside
 * Apple's official iPhone bezel.
 *
 *     npm run build:phone            # both languages
 *     npm run build:phone -- --lang es
 *     npm run check:phone            # is the committed art still current?
 *
 * What it does, per language:
 *   1. renders tools/site/phone-screen.html at the device's own logical size
 *      (iPhone 17 Pro: 402x874pt) at 3x, in Chromium, in SF Pro;
 *   2. fails if the conversation is too short to fill the screen (a short thread
 *      leaves a white gap under the header); a longer one is anchored at the
 *      bottom and feathered at the top, the way a real conversation sits;
 *   3. composites the screen into Apple's official bezel PNG at 1:1;
 *   4. downscales to 2x of the size the site displays and writes
 *      public/phone-en.webp and public/phone-es.webp;
 *   5. records a hash of the copy so check:phone can tell when the art is stale.
 *
 * The bezel comes from Apple's Product Bezels download, which is published for
 * exactly this use — Apple's words: "When using product bezels in your marketing
 * materials, be sure to review these Marketing Resources and Identity Guidelines"
 * (https://developer.apple.com/design/resources/). The raw bezel is NOT committed:
 * only the composited marketing image is, which is what a product bezel is for.
 *
 * SF Pro is likewise downloaded, used here, and never committed: its licence
 * covers mock-ups of Apple-platform UI, which is what this is.
 */

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = path.join(ROOT, '.cache', 'phone');
const PORT = 8793;

// ── the device ───────────────────────────────────────────────────────────────
const DEVICE = {
  name: 'iPhone 17 Pro',
  bezelDmg: 'https://devimages-cdn.apple.com/design/resources/download/Bezel-iPhone-17.dmg',
  bezelMember: 'Bezel-iPhone-17/PNG/iPhone 17 Pro/iPhone 17 Pro - Silver - Portrait.png',
  // Screen rect inside the bezel PNG, measured from its transparent screen hole.
  // The hole is 1208x2622 at x71..1278, y69..2690; the screen is 1206x2622 (402x874
  // at 3x), so it is centred in the hole with a pixel either side.
  screen: { x: 71, y: 69, w: 1208, h: 2622 },
  bezelSize: { w: 1350, h: 2760 },
  logical: { w: 402, h: 874 },
  scale: 3,
  /** How wide the phone is displayed on the site, in CSS px. */
  displayWidth: 320,
};

/**
 * Two screens, both rendered per language:
 *   yes  — the consent loop in "How your yes works"
 *   week — the hero: the same five rows the paper folder held, as the card the
 *          parent actually receives, so the hero can be a device too.
 */
const SCREENS = [
  { key: 'yes', screen: 'yes', file: (lang) => `phone-${lang}.webp` },
  { key: 'week', screen: 'week', file: (lang) => `hero-phone-${lang}.webp` },
  { key: 'circles', screen: 'circles', file: (lang) => `circles-${lang}.webp` },
  // The four cards of the week section, one phone each. They sit in a row at a
  // third of the hero's width, so they render and ship smaller.
  ...[0, 1, 2, 3].map((i) => ({
    key: `weekcol${i}`,
    screen: 'weekcol',
    i,
    displayWidth: 328,
    file: (lang) => `week-${i + 1}-${lang}.webp`,
  })),
];

/** Screen-space rects -> percentages of the shipped image, so the page can put
 *  the pen circle and the stamp exactly where the card's rows are. */
function marksToPercent(marks) {
  const sx = DEVICE.screen.w / DEVICE.logical.w;
  const sy = DEVICE.screen.h / DEVICE.logical.h;
  const out = {};
  for (const [key, r] of Object.entries(marks)) {
    out[key] = {
      x: +(((DEVICE.screen.x + r.x * sx) / DEVICE.bezelSize.w) * 100).toFixed(3),
      y: +(((DEVICE.screen.y + r.y * sy) / DEVICE.bezelSize.h) * 100).toFixed(3),
      w: +((r.w * sx / DEVICE.bezelSize.w) * 100).toFixed(3),
      h: +((r.h * sy / DEVICE.bezelSize.h) * 100).toFixed(3),
    };
  }
  return out;
}

const SF_FONT_DMG = 'https://devimages-cdn.apple.com/design/resources/download/SF-Pro.dmg';

// ── helpers ──────────────────────────────────────────────────────────────────

const run = (cmd, args, opts = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...opts });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
    child.on('error', reject);
  });

const runCapture = (cmd, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('exit', (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}`))));
    child.on('error', reject);
  });

/** 7-Zip 23+ (`7zz`) when installed, else p7zip. Exit 1 is a warning; the caller checks the output. */
let sevenZipBin;
async function sevenZip(args) {
  if (!sevenZipBin) {
    sevenZipBin = await runCapture('7zz', ['i']).then(() => '7zz', () => '7z');
  }
  await new Promise((resolve, reject) => {
    const child = spawn(sevenZipBin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => (err += d));
    child.on('exit', (code) => (code === 0 || code === 1 ? resolve() : reject(new Error(`${sevenZipBin} exited ${code}: ${err.trim()}`))));
    child.on('error', reject);
  });
}

/** Every path under dir, relative, for error messages. */
async function listTree(dir, base = dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    out.push(path.relative(base, full) + (entry.isDirectory() ? '/' : ''));
    if (entry.isDirectory()) out.push(...(await listTree(full, base)));
  }
  return out.slice(0, 80);
}

/** Depth-first search for the first file (or directory) matching `test(name, fullPath)`. */
async function findFile(dir, test) {
  if (!existsSync(dir)) return undefined;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (test(entry.name, full) && (entry.isFile() || entry.name.endsWith('.pkg'))) return full;
    if (entry.isDirectory()) {
      const hit = await findFile(full, test);
      if (hit) return hit;
    }
  }
  return undefined;
}

/** Decode Apple's pbzx stream: a header, then chunks that are either xz or stored raw. */
async function unpbzx(buf) {
  const parts = [];
  let off = 12; // 'pbzx' + 8-byte flags
  while (off + 16 <= buf.length) {
    const size = Number(buf.readBigUInt64BE(off + 8));
    const chunk = buf.subarray(off + 16, off + 16 + size);
    off += 16 + size;
    const isXz = chunk.subarray(0, 6).equals(Buffer.from([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]));
    parts.push(isXz ? await xzDecode(chunk) : chunk);
  }
  return Buffer.concat(parts);
}

function xzDecode(chunk) {
  return new Promise((resolve, reject) => {
    const child = spawn('xz', ['-dc']);
    const out = [];
    child.stdout.on('data', (d) => out.push(d));
    child.on('exit', (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`xz exited ${code}`))));
    child.on('error', reject);
    child.stdin.end(chunk);
  });
}

async function chromePath() {
  const home = process.env.HOME ?? '';
  const base = path.join(home, '.agent-browser', 'browsers');
  if (existsSync(base)) {
    const dirs = (await readdir(base)).filter((d) => d.startsWith('chrome-')).sort().reverse();
    for (const dir of dirs) {
      for (const candidate of ['chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome']) {
        const p = path.join(base, dir, candidate);
        if (existsSync(p)) return p;
      }
    }
  }
  // A standard macOS install: the app bundle ships its own binary.
  const macApp = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (existsSync(macApp)) return macApp;
  for (const p of ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']) {
    if (existsSync(p)) return p;
  }
  return null;
}

/** Download once into .cache/ (gitignored) and extract what we need. */
async function ensureBezel() {
  await mkdir(CACHE, { recursive: true });
  // 7z `x` preserves the member's full path inside the output dir, so the file
  // lands at CACHE/<member>, not CACHE/<basename>.
  const png = path.join(CACHE, DEVICE.bezelMember);
  if (existsSync(png)) return png;
  const dmg = path.join(CACHE, 'bezel.dmg');
  if (!existsSync(dmg)) {
    console.log(`downloading Apple's ${DEVICE.name} bezel (${DEVICE.bezelDmg})`);
    await run('curl', ['-sL', '--max-time', '900', '-o', dmg, DEVICE.bezelDmg]);
  }
  console.log('extracting the bezel PNG');
  await run('7z', ['x', '-y', `-o${CACHE}`, dmg, DEVICE.bezelMember], { stdio: 'ignore' });
  if (!existsSync(png)) throw new Error(`bezel not found after extraction: ${png}`);
  return png;
}

async function ensureSfPro() {
  const dir = path.join(CACHE, 'fonts');
  const marker = path.join(dir, 'SF-Pro-Text-Regular.otf');
  if (existsSync(marker)) return dir;
  const dmg = path.join(CACHE, 'sfpro.dmg');
  if (!existsSync(dmg)) {
    console.log(`downloading SF Pro (${SF_FONT_DMG})`);
    await run('curl', ['-sL', '--max-time', '900', '-o', dmg, SF_FONT_DMG]);
  }
  console.log('extracting SF Pro');
  // Apple has moved the package around inside the image between releases, and newer images
  // are APFS with pbzx payloads that only 7-Zip 23+ (`7zz`) reads, so find each layer by
  // looking rather than by a fixed path.
  const sf = path.join(CACHE, 'sf');
  await rm(sf, { recursive: true, force: true });
  await sevenZip(['x', '-y', `-o${sf}/dmg`, dmg]);
  const pkg = await findFile(`${sf}/dmg`, (f) => f.endsWith('.pkg'));
  if (!pkg) throw new Error('no .pkg inside the SF Pro image');
  await sevenZip(['x', '-y', `-o${sf}/pkg`, pkg]);
  const payload = await findFile(`${sf}/pkg`, (f) => /^Payload/.test(f));
  if (!payload) {
    const listing = await listTree(`${sf}/pkg`);
    throw new Error(`no Payload inside the SF Pro package; it holds:\n${listing.join('\n')}`);
  }
  // Payload is compressed cpio: gzip in older packages, Apple's pbzx (chunked xz) in newer
  // ones. Unwrap the compression, then the cpio.
  let cpio;
  const head = (await readFile(payload)).subarray(0, 4).toString('latin1');
  if (head === 'pbzx') {
    cpio = `${sf}/payload.cpio`;
    await writeFile(cpio, await unpbzx(await readFile(payload)));
  } else {
    await sevenZip(['x', '-y', `-o${sf}/inner`, payload]);
    cpio = (await findFile(`${sf}/inner`, () => true)) ?? '';
  }
  await sevenZip(['x', '-y', `-o${sf}/fonts`, cpio]);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const anyFont = await findFile(path.join(sf, 'fonts'), (f) => f.startsWith('SF-Pro-Text-'));
  if (!anyFont) throw new Error('SF Pro Text did not extract');
  const extracted = path.dirname(anyFont);
  for (const file of await readdir(extracted)) {
    if (file.startsWith('SF-Pro-Text-') || file.startsWith('SF-Pro-Display-')) {
      await writeFile(path.join(dir, file), await readFile(path.join(extracted, file)));
    }
  }
  if (!existsSync(marker)) throw new Error('SF Pro Text did not extract');
  return dir;
}

/** Serve the repo so the screen can import the strings and the mascot. */
function serve() {
  const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.otf': 'font/otf',
  };
  const server = createServer(async (req, res) => {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const target = path.join(ROOT, urlPath);
    if (target !== ROOT && !target.startsWith(ROOT + path.sep)) return void res.writeHead(403).end();
    try {
      const body = await readFile(target);
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(target)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

// ── main ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const langs = args.includes('--lang') ? [args[args.indexOf('--lang') + 1]] : ['en', 'es'];
const check = args.includes('--check');

/**
 * A fingerprint of everything the rendered art is drawn from. It serves two
 * purposes: `check:phone` fails when the art no longer matches the copy, and the
 * site appends it to the image URLs so a re-render is never served from a cache.
 *
 * It has to cover every string the screens draw and the screen template itself,
 * not just the obvious ones. When it did not cover `week`, the four week screens
 * were re-rendered under unchanged URLs, and browsers kept showing the previous
 * conversations. The same happens if `tools/site/phone-screen.html` changes but
 * the fingerprint does not.
 */
const stringsHash = async () => {
  const h = createHash('sha256');
  for (const lang of ['en', 'es']) {
    const mod = (await import(`../tools/site/strings.${lang}.mjs`)).default;
    h.update(
      JSON.stringify({
        phone: mod.how.phone,
        band: mod.how.channel,
        hero: mod.hero.phone,
        folder: mod.hero.folder,
        week: mod.week,
        circles: mod.circles.chat,
        statuses: mod.statuses,
      }),
    );
  }
  h.update(await readFile(path.join(ROOT, 'tools', 'site', 'phone-screen.html'), 'utf8'));
  h.update(JSON.stringify(DEVICE));
  return h.digest('hex').slice(0, 16);
};

const LOCK = path.join(ROOT, 'tools', 'site', 'phone.lock.json');

if (check) {
  const want = await stringsHash();
  const lock = existsSync(LOCK) ? JSON.parse(await readFile(LOCK, 'utf8')) : {};
  const missing = [];
  for (const lang of langs) {
    for (const spec of SCREENS) {
      const file = path.join(ROOT, 'public', spec.file(lang));
      if (!existsSync(file)) missing.push(path.relative(ROOT, file));
    }
  }
  if (missing.length) {
    console.error(`missing art: ${missing.join(', ')} — run npm run build:phone`);
    process.exit(1);
  }
  if (lock.copyHash !== want) {
    console.error('the phone art is stale: the conversation copy changed since it was rendered.');
    console.error('run npm run build:phone and commit the new images.');
    process.exit(1);
  }
  console.log('ok: phone art matches the conversation copy.');
  process.exit(0);
}

const chrome = await chromePath();
if (!chrome) {
  console.error('No Chromium found. Install Chrome for Testing (agent-browser install) and retry.');
  process.exit(1);
}
const bezel = await ensureBezel();
const fonts = await ensureSfPro();
const server = await serve();

// Python does the pixel work: Pillow is already needed by the repo's checks.
const py = path.join(CACHE, 'compose.py');
await writeFile(
  py,
  `
import json, sys
from PIL import Image, ImageDraw

bezel = Image.open(${JSON.stringify(bezel)}).convert("RGBA")
screen = Image.open(sys.argv[1]).convert("RGB")
rect = json.loads(sys.argv[2])
out = sys.argv[3]
display_width = int(sys.argv[4])

# 1:1 with the bezel's own resolution: the screenshot is rendered at 3x for
# exactly this screen, so nothing is resampled on the way in.
screen = screen.resize((rect["w"], rect["h"]), Image.LANCZOS)

# Find the SCREEN HOLE, not "every transparent pixel". The bezel is transparent
# both inside the screen hole and outside the device's rounded outline, and the
# screen rect touches both, so a raw alpha mask would paint the screenshot over
# the device's corners: a white rectangle with square corners, sitting on top of
# a rounded phone. Flood-filling from the middle of the screen keeps only the
# connected region that is actually the glass, which also leaves the Dynamic
# Island (opaque in the bezel) on top of the screenshot, where it belongs.
alpha = bezel.split()[-1]
transparent = alpha.point(lambda a: 255 if a == 0 else 0)
ImageDraw.floodfill(transparent, (rect["x"] + rect["w"] // 2, rect["y"] + rect["h"] // 2), 128, thresh=0)
hole = transparent.point(lambda v: 255 if v == 128 else 0)
hole_box = hole.getbbox()
if not hole_box:
    raise SystemExit("could not find the screen hole in the bezel")

bezel.paste(screen, (rect["x"], rect["y"]), hole.crop(
    (rect["x"], rect["y"], rect["x"] + rect["w"], rect["y"] + rect["h"])
))

# The glass has to be fully covered: any pixel of the hole left transparent is a
# gap between the screenshot and the frame.
uncovered = sum(1 for v, h in zip(bezel.split()[-1].getdata(), hole.getdata()) if h == 255 and v == 0)
if uncovered:
    raise SystemExit(f"{uncovered} hole pixels left uncovered: the screenshot does not fill the screen")

# Then one single downscale of the finished device, to 2x of its display size.
box = bezel.getbbox()
target_w = round(display_width * 2 * bezel.width / (box[2] - box[0]))
scale = target_w / bezel.width
composed = bezel.resize((target_w, round(bezel.height * scale)), Image.LANCZOS)
composed.save(out, "WEBP", quality=90, method=6)
print(f"{out} {composed.width}x{composed.height} {round(len(open(out,'rb').read())/1024)}KB")
`,
);

// Recorded into phone.lock.json so the page can emit explicit width/height.
const art = {};
for (const lang of langs) {
  art[lang] = {};
  for (const spec of SCREENS) {
    const screenPng = path.join(CACHE, `screen-${spec.key}-${lang}.png`);
    const extra = spec.i === undefined ? '' : `&i=${spec.i}`;
    const url = `http://localhost:${PORT}/tools/site/phone-screen.html?lang=${lang}&screen=${spec.screen}${extra}`;

    // Pass 1: measure. --dump-dom gives us the <html> element after the script
    // ran, so the page's own fit verdict is read rather than assumed.
    const dom = await runCapture(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      `--window-size=${DEVICE.logical.w},${DEVICE.logical.h}`,
      '--virtual-time-budget=8000',
      '--dump-dom',
      url,
    ]);
    const fit = /data-fit="([^"]+)"/.exec(dom)?.[1];
    const measured = /data-measured="([^"]+)"/.exec(dom)?.[1];
    if (!fit || !fit.startsWith('ok')) {
      console.error(`phone screen ${spec.key} (${lang}) does not fill the screen: ${fit} (content/inner ${measured})`);
      console.error('add more to the conversation in tools/site/strings.*.mjs.');
      process.exit(1);
    }
    console.log(`phone screen ${spec.key} (${lang}): fills (${measured} content/inner)`);

    // Pass 2: render at 3x, with SF Pro available to the page.
    await run(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      `--force-device-scale-factor=${DEVICE.scale}`,
      `--window-size=${DEVICE.logical.w},${DEVICE.logical.h}`,
      `--screenshot=${screenPng}`,
      '--virtual-time-budget=8000',
      url,
    ]);

    const info = await runCapture('python3', [
      '-c',
      `from PIL import Image; im=Image.open(${JSON.stringify(screenPng)}); print(im.width, im.height)`,
    ]);
    console.log(`rendered screen ${spec.key}: ${info.trim()}`);

    const out = path.join(ROOT, 'public', spec.file(lang));
    await run('python3', [
      py,
      screenPng,
      JSON.stringify(DEVICE.screen),
      out,
      String(spec.displayWidth ?? DEVICE.displayWidth),
    ]);

    // The page needs explicit width/height, so record the 1x size of what shipped.
    const size = await runCapture('python3', [
      '-c',
      `from PIL import Image; im=Image.open(${JSON.stringify(out)}); print(round(im.width/2), round(im.height/2))`,
    ]);
    const [w, h] = size.trim().split(' ').map(Number);
    art[lang][spec.key] = { width: w, height: h };

    // Where the marks go, for the hero's pen circle and stamp.
    const raw = /data-marks="([^"]*)"/.exec(dom)?.[1];
    if (raw) {
      const marks = JSON.parse(raw.replace(/&quot;/g, '"'));
      if (marks.stamp || marks.pen) art[lang].marks = marksToPercent(marks);
    }
  }
}

await writeFile(LOCK, `${JSON.stringify({ device: DEVICE.name, copyHash: await stringsHash(), art }, null, 2)}\n`);
console.log('wrote tools/site/phone.lock.json');
server.close();

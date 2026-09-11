#!/usr/bin/env tsx
/**
 * Fail if a key-shaped string is committed to the repo.
 *
 * Scans every git-TRACKED file (so a gitignored `.env` is never read) for
 * well-known credential shapes. Run in CI (`npm run check:secrets`) so a leaked
 * key never lands on `main`. Exit 1 on any hit.
 *
 * Deliberately shape-based (not entropy-based) to keep false positives at zero:
 * a random-looking hex string is not a finding, a live `sk-...`/JWT/`AIza...` is.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

/** Known credential shapes → human label. */
const PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'OpenAI/Anthropic-style key', re: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'JWT', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'Slack token', re: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/ },
  { name: 'GitHub PAT', re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { name: 'GitHub fine-grained PAT', re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { name: 'AWS access key id', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'Stripe secret key', re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}\b/ },
  { name: 'SendGrid key', re: /\bSG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/ },
  { name: 'Resend key', re: /\bre_[A-Za-z0-9]{24,}\b/ },
  { name: 'Private key block', re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/ },
  { name: 'Skyvern/PEM-ish long secret literal', re: /(?:api[_-]?key|secret|token|password)\s*[:=]\s*['"][A-Za-z0-9_\-+/=]{32,}['"]/i },
];

/** Files/paths where a matched shape is expected (fixtures, this checker). */
const ALLOWLIST: RegExp[] = [
  /^scripts\/check-secrets\.ts$/,
  /\.env\.example$/,
];

/** Skip files that are binary or huge (a build artifact / lockfile). */
function isScannable(path: string): boolean {
  let size = 0;
  try {
    size = statSync(path).size;
  } catch {
    return false;
  }
  if (size > 2_000_000) return false;
  return /\.(ts|tsx|js|mjs|cjs|mts|cts|json|md|sql|yml|yaml|sh|txt|html|css|toml|env|example)$/i.test(path) || /(^|\/)\.env\.example$/.test(path);
}

function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

const findings: Array<{ file: string; line: number; name: string }> = [];
for (const file of trackedFiles()) {
  if (ALLOWLIST.some((re) => re.test(file))) continue;
  if (!isScannable(file)) continue;
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const { name, re } of PATTERNS) {
      if (re.test(lines[i]!)) findings.push({ file, line: i + 1, name });
    }
  }
}

if (findings.length) {
  console.error('✖ Possible committed secret(s) — remove them from the repo and rotate the key:\n');
  for (const f of findings) console.error(`  ${f.file}:${f.line}  ${f.name}`);
  console.error('\nIf this is a harmless fixture, add the path to ALLOWLIST in scripts/check-secrets.ts.');
  process.exit(1);
}

console.log(`✓ check-secrets: no key-shaped strings in ${trackedFiles().length} tracked files.`);

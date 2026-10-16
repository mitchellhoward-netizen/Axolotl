/**
 * Runs scripts/eval-pathways.ts once per family, in parallel processes, and prints the combined
 * scoreboard. For model-played parents and the model reader, whose calls are slow (a `claude`
 * process each) but independent per family.
 *
 *   npx tsx scripts/eval-parallel.ts --replicas linq,pvusd --from 1 --to 10 --jobs 10 \
 *     --out eval/results/dev --build dev1 -- --parent llm --understand cli
 *
 * --from / --to   families by makeFamilies order, 1-based, inclusive (dev 1-10, held-out 11-20)
 * --jobs N        processes at once (default 8)
 * --out DIR       results directory (each child appends its JSON line there)
 * --build ID      the build id written on every run (default: the git build)
 * everything after `--` is passed to each eval-pathways.ts run.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { gitBuild } from '../src/eval/runner.js';
import { aggregate, markdownTable, succeeded } from '../src/eval/scoreboard.js';
import type { RunRecord } from '../src/pathways/types.js';

const argv = process.argv.slice(2);
const dash = argv.indexOf('--');
const own = dash >= 0 ? argv.slice(0, dash) : argv;
const pass = dash >= 0 ? argv.slice(dash + 1) : [];
const opt = (k: string, d: string) => {
  const i = own.indexOf(`--${k}`);
  return i >= 0 && own[i + 1] ? own[i + 1]! : d;
};
const replicas = opt('replicas', 'linq,pvusd').split(',');
const from = Number(opt('from', '1'));
const to = Number(opt('to', '10'));
const jobs = Number(opt('jobs', '8'));
const out = opt('out', 'eval/results');
const build = opt('build', gitBuild());
mkdirSync(out, { recursive: true });

const tasks: Array<{ replica: string; offset: number }> = [];
for (const replica of replicas) for (let n = from; n <= to; n++) tasks.push({ replica, offset: n - 1 });

function run(t: { replica: string; offset: number }): Promise<void> {
  return new Promise((resolve) => {
    const args = ['tsx', 'scripts/eval-pathways.ts', '--agent', 'pathway', '--hook', 'src/eval/pathway-hook.ts', '--replica', t.replica, '--families', '1', '--offset', String(t.offset), '--seeds', '1', '--out', out, '--build', build, '--transcripts', path.join(out, `${build}-transcripts.jsonl`), ...pass];
    const child = spawn('npx', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', (d) => (log += d));
    child.stderr.on('data', (d) => (log += d));
    child.on('close', () => {
      const line = log.split('\n').find((l) => / seed 1 \[/.test(l));
      console.log(`${t.replica} #${t.offset + 1}: ${line ?? log.trim().split('\n').slice(-3).join(' | ')}`);
      resolve();
    });
  });
}

async function main() {
  const queue = [...tasks];
  await Promise.all(
    Array.from({ length: Math.min(jobs, queue.length) }, async () => {
      for (let t = queue.shift(); t; t = queue.shift()) await run(t);
    }),
  );
  const date = new Date().toISOString().slice(0, 10);
  const file = path.join(out, `${date}-${build}.jsonl`);
  if (!existsSync(file)) return;
  const runs = readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as RunRecord);
  console.log('');
  console.log(markdownTable(aggregate(runs)));
  for (const p of [...new Set(runs.map((r) => r.pathway))]) {
    const rs = runs.filter((r) => r.pathway === p);
    const cost = rs.reduce((x, r) => x + r.costUsd, 0);
    console.log(`${p}: ${rs.filter(succeeded).length}/${rs.length} succeeded, $${cost.toFixed(2)} total, $${(cost / rs.length).toFixed(3)}/run, mean turns ${(rs.reduce((x, r) => x + r.parentTurns, 0) / rs.length).toFixed(1)}`);
  }
}
main();

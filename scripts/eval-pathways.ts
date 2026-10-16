/**
 * The pathway scoreboard run (docs/PATHWAYS.md §4.4): synthetic families × seeds through the real
 * agent, graded field by field on a replica; one JSON line per run in eval/results/ and a table.
 *
 *   npx tsx scripts/eval-pathways.ts --agent baseline --families 20 --seeds 5 --replica fake
 *
 * --agent baseline|pathway   today's agent, or the pathway engine (needs --hook <module>)
 * --replica fake|linq|pvusd  fake is the harness's own stand-in; linq/pvusd load the real replicas
 * --families N --seeds K     N families (20 by default), K repeats each (pass^K)
 * --messiness 0-3            the scripted parent's mess (default 1)
 * --trusting                the parent says yes to a proposal that shows no values (default: asks to see them)
 * --max-turns N             per conversation (default 30)
 * --hook <module>            a module whose default export (or `hook`) is a PathwayHook
 * --out <dir>                results directory (default eval/results)
 * --build <id>               override the git build id
 * --llm none|cli             none (default): today's agent without a model key (its scripted
 *                            fallback). cli: today's agent WITH its brain, the model calls served
 *                            by the `claude` CLI (src/eval/cli-llm.ts; test-only, see its header)
 * --model <id>               the brain's model with --llm cli (default: production's DEFAULT_CLAUDE_MODEL)
 * --budget <usd>             with --llm cli: stop starting new runs once this much is spent (default 5)
 * --run-budget <usd>         with --llm cli: end a conversation before its next turn (as abandoned, noted) once it has cost this much (default 2.5)
 * --transcripts <file>       append each run's transcript and tool calls as JSON lines
 * --verbose                  keep the agent's console logs and print transcripts
 * --no-write                 print only
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ArchiveClient } from '../src/archive/client.js';
import { makeFamilies } from '../src/eval/families.js';
import { FakeReplica, fakeIncomeForm } from '../src/eval/fake.js';
import { appendFileSync } from 'node:fs';
import { DEFAULT_CLAUDE_MODEL, DEFAULT_CLAUDE_SMALL_MODEL } from '../src/agent/model-policy.js';
import type { ToolCall } from '../src/agent/llm.js';
import { cliLlmClient } from '../src/eval/cli-llm.js';
import { baselineAgentFactoryWith, gitBuild, runFamily, type AgentFactory, type PathwayHook } from '../src/eval/runner.js';
import { aggregate, markdownTable, writeResults } from '../src/eval/scoreboard.js';
import type { FormMap, Pathway, Replica, RunRecord } from '../src/pathways/types.js';

function args(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) continue;
    const [k, v] = a.slice(2).split('=', 2) as [string, string | undefined];
    if (v !== undefined) out[k] = v;
    else if (argv[i + 1] && !argv[i + 1]!.startsWith('--')) out[k] = argv[++i]!;
    else out[k] = true;
  }
  return out;
}

const isReplica = (x: unknown): x is Replica => !!x && typeof (x as Replica).start === 'function' && typeof (x as Replica).submissions === 'function';
const isForm = (x: unknown): x is FormMap => !!x && typeof (x as FormMap).fill === 'function' && typeof (x as FormMap).id === 'string';
const isPathway = (x: unknown): x is Pathway => !!x && isForm((x as Pathway).form) && Array.isArray((x as Pathway).facts);

/** Find a Replica / Pathway / FormMap among a module's exports (instances, or classes / factories
 * taking no arguments), so the CLI doesn't hard-code the parallel builders' export names. */
async function discover(mods: string[]): Promise<{ replica?: Replica; pathway?: Pathway; form?: FormMap; loaded: string[] }> {
  const found: { replica?: Replica; pathway?: Pathway; form?: FormMap; loaded: string[] } = { loaded: [] };
  for (const m of mods) {
    let mod: Record<string, unknown>;
    try {
      mod = (await import(pathToFileURL(path.resolve(m)).href)) as Record<string, unknown>;
    } catch {
      continue;
    }
    found.loaded.push(m);
    for (const v of Object.values(mod)) {
      let x: unknown = v;
      if (typeof v === 'function' && !isReplica(v)) {
        try {
          // Classes are constructed with no arguments; plain functions are left alone.
          x = /^class\s/.test(Function.prototype.toString.call(v)) ? new (v as new () => unknown)() : undefined;
        } catch {
          x = undefined;
        }
      }
      if (!found.replica && isReplica(x)) found.replica = x;
      if (!found.pathway && isPathway(x)) found.pathway = x;
      if (!found.form && isForm(x)) found.form = x;
    }
  }
  return found;
}

const REPLICA_MODULES: Record<string, string[]> = {
  linq: ['src/replicas/linq-income-form.ts', 'src/pathways/ca-psusd-linq.ts', 'src/pathways/ca-psusd-income-form.ts'],
  pvusd: ['src/replicas/pvusd-uba.ts', 'src/pathways/ca-pvusd-uba.ts', 'src/forms/ca-pvusd-uba-2026.ts'],
};

async function main(): Promise<void> {
  const a = args(process.argv.slice(2));
  const mode = (a.agent as string) ?? 'baseline';
  if (mode !== 'baseline' && mode !== 'pathway') throw new Error(`--agent baseline|pathway, not ${mode}`);
  const nFamilies = Number(a.families ?? 20);
  const seeds = Number(a.seeds ?? 1);
  const which = (a.replica as string) ?? 'fake';
  const messiness = Number(a.messiness ?? 1) as 0 | 1 | 2 | 3;
  const maxTurns = Number(a['max-turns'] ?? 30);
  const verbose = a.verbose === true;
  const build = (a.build as string) ?? gitBuild();

  let replica: Replica;
  let pathway: Pathway | undefined;
  let form: FormMap | undefined;
  if (which === 'fake') {
    replica = new FakeReplica();
    form = fakeIncomeForm;
  } else if (which === 'linq') {
    // Palm Springs' public web form: the graded copy, and its form map in the district's mode.
    const { LinqIncomeFormReplica } = await import('../src/replicas/linq-income-form.js');
    const { makeLinqIncomeForm, PSUSD_INCOME_MODE } = await import('../src/forms/ca-psusd-linq-income-form-2026.js');
    const { psusdLinq } = await import('../src/pathways/ca-psusd-linq.js');
    replica = new LinqIncomeFormReplica({ incomeMode: PSUSD_INCOME_MODE });
    pathway = psusdLinq;
    form = psusdLinq.form ?? makeLinqIncomeForm(PSUSD_INCOME_MODE);
  } else {
    const mods = REPLICA_MODULES[which];
    if (!mods) throw new Error(`--replica fake|linq|pvusd, not ${which}`);
    const d = await discover(mods);
    pathway = d.pathway;
    form = d.form ?? d.pathway?.form;
    if (!form) throw new Error(`no FormMap found for "${which}"`);
    // A paper form (Pajaro's PDF) has no web copy to submit to: the in-process stand-in
    // receives what the agent would file, graded against the real form's map.
    if (!d.replica && which !== 'pvusd') throw new Error(`no replica found for "${which}" (looked in ${mods.join(', ')}; loaded: ${d.loaded.join(', ') || 'none'})`);
    replica = d.replica ?? new FakeReplica({ requireAttestation: true, formId: form.id, confirms: false });
  }

  let hook: PathwayHook | undefined;
  if (mode === 'pathway') {
    if (typeof a.hook !== 'string') throw new Error('--agent pathway needs --hook <module> exporting a PathwayHook (the engine plugs in there)');
    const mod = (await import(pathToFileURL(path.resolve(a.hook)).href)) as { default?: PathwayHook; hook?: PathwayHook };
    hook = mod.hook ?? mod.default;
    if (!hook) throw new Error(`${a.hook} exports no PathwayHook`);
  }

  // --llm cli: the production model tiers (model-policy.ts chatModel / smallModel), via the CLI.
  const llmMode = (a.llm as string) ?? 'none';
  if (llmMode !== 'none' && llmMode !== 'cli') throw new Error(`--llm none|cli, not ${llmMode}`);
  const budget = Number(a.budget ?? 5);
  const runBudget = Number(a['run-budget'] ?? 2.5);
  let spent = 0;
  let runSpent = 0;
  let toolCalls: ToolCall[] = [];
  let agentFactory: AgentFactory | undefined;
  if (llmMode === 'cli') {
    if (mode !== 'baseline') throw new Error('--llm cli is for --agent baseline');
    const model = (a.model as string) ?? DEFAULT_CLAUDE_MODEL;
    agentFactory = baselineAgentFactoryWith((ctx) => {
      const onCost = (usd: number) => {
        spent += usd;
        runSpent += usd;
        ctx.addCost(usd);
      };
      const onToolCall = (c: ToolCall) => toolCalls.push(c);
      // chatModel(): the frontier model at medium effort; smallModel(): Haiku at low effort.
      const llm = cliLlmClient({ model, effort: 'medium', onCost, onToolCall }).client;
      const researchLlm = cliLlmClient({ model: DEFAULT_CLAUDE_SMALL_MODEL, effort: 'low', onCost }).client;
      return { llm, researchLlm };
    });
  }
  const transcripts = typeof a.transcripts === 'string' ? a.transcripts : undefined;

  const archive = new ArchiveClient();
  const families = await makeFamilies(nFamilies, { archive });
  const runs: RunRecord[] = [];
  const log = console.log;
  const warn = console.warn;
  try {
    outer: for (const family of families) {
      for (let seed = 1; seed <= seeds; seed++) {
        if (llmMode === 'cli' && spent >= budget) {
          log(`budget reached ($${spent.toFixed(2)} of $${budget}): stopping before ${family.id} seed ${seed}`);
          break outer;
        }
        toolCalls = [];
        runSpent = 0;
        if (!verbose) {
          console.log = () => {};
          console.warn = () => {};
        }
        let res;
        try {
          res = await runFamily({ family, seed, mode, hook, pathway, form, replica, messiness, trusting: a.trusting === true, maxTurns, build, agentFactory, stop: llmMode === 'cli' ? () => (runSpent >= runBudget ? `run cost cap $${runBudget} reached` : undefined) : undefined });
        } finally {
          console.log = log;
          console.warn = warn;
        }
        runs.push(res.record);
        const r = res.record;
        log(`${r.family} seed ${seed} [${family.lang}/${family.persona}] → ${r.outcome}  wrong ${r.wrongFields.length} missing ${r.missingFields.length} guessed ${r.guessedFacts.length}${r.sentWithoutYes ? ' SENT-WITHOUT-YES' : ''}${r.agentAttested ? ' AGENT-ATTESTED' : ''}  turns ${r.parentTurns}  ${r.ms} ms${llmMode === 'cli' ? `  $${r.costUsd.toFixed(3)} (total $${spent.toFixed(2)})  tools: ${toolCalls.map((c) => c.name).join(',') || 'none'}` : ''}`);
        if (transcripts) {
          appendFileSync(transcripts, JSON.stringify({ build, pathway: r.pathway, family: r.family, seed, llm: llmMode, outcome: r.outcome, costUsd: r.costUsd, notes: r.notes, transcript: res.transcript, gate: res.gate, toolCalls: toolCalls.map((c) => ({ name: c.name, arguments: c.arguments })), submission: res.submission ? { fields: res.submission.fields, reference: res.submission.reference ?? null } : null }) + '\n');
        }
        if (verbose) for (const t of res.transcript) log(`   ${t.from === 'parent' ? 'P' : 'A'}: ${t.text.replace(/\n+/g, ' ⏎ ').slice(0, 300)}`);
      }
    }
  } finally {
    archive.close();
  }

  log('');
  log(markdownTable(aggregate(runs)));
  if (a['no-write'] !== true) {
    const file = writeResults(runs, { dir: typeof a.out === 'string' ? a.out : undefined, build });
    log(`\n${runs.length} runs → ${path.relative(process.cwd(), file)}`);
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);

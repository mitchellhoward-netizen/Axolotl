import os from 'node:os';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { FamilyRecord } from '../family/facts.js';
import { directLane } from '../lanes/direct.js';
import { PdfLane } from '../lanes/pdf.js';
import { pathways as registry } from '../pathways/registry.js';
import { registerLaunchPathways } from '../pathways/index.js';
import type { AttestHow, FormFill, FormMap, Lang, LaneResult, LaneRunner } from '../pathways/types.js';
import type { PathwaySession } from '../pathways/engine.js';
import type { Agent } from '../agent/agent.js';
import type { GradeContext } from './scoreboard.js';
import type { HookContext, PathwayHook } from './runner.js';
import { cliLlmClient } from './cli-llm.js';
import { modelUnderstander } from '../pathways/understand.js';

/**
 * The pathway engine, plugged into the harness (`--agent pathway --hook src/eval/pathway-hook.ts`).
 *
 * Per run it binds each pathway's lane to the replica, starts the pathway with what the
 * district already knows (the students' names, dates of birth, schools, grades and IDs: "names
 * in"), and lets the simulated parent do the parent's part with their own hands: sign the PDF,
 * or open their certify link.
 */

registerLaunchPathways(registry);

/** What a district sends when it starts the helper for a family: each student's name (with
 * the middle initial the student system keeps), birth date, school, grade and ID. Nothing about
 * income or the rest of the household. */
const DISTRICT_FIELDS = ['first_name', 'last_name', 'middle_initial', 'dob', 'school', 'grade', 'student_id'];

function districtSeed(truth: FamilyRecord): FamilyRecord {
  const seed = new FamilyRecord(truth.state);
  for (const id of truth.memberIds()) {
    if (truth.get<boolean>(`member.${id}.student`)?.value !== true) continue;
    seed.set(`member.${id}.student`, true, { kind: 'district', ref: `sis:${id}` });
    seed.set(`member.${id}.relationship`, truth.get(`member.${id}.relationship`)?.value ?? 'child', { kind: 'district', ref: `sis:${id}` });
    for (const f of DISTRICT_FIELDS) {
      const v = truth.get(`member.${id}.${f}`);
      if (v) seed.set(`member.${id}.${f}`, v.value, { kind: 'district', ref: `sis:${id}` });
    }
  }
  for (const k of truth.keys()) if (k.startsWith('school.')) seed.set(k, truth.get(k)!.value, { kind: 'district', ref: 'district' });
  return seed;
}

/** The Pajaro PDF reaches the school only after the parent signs; the stand-in receives it. */
function paperDelivery(inner: LaneRunner, ctx: HookContext): LaneRunner {
  return {
    kind: inner.kind,
    async run(form: FormMap, fill: FormFill, lc: { lang: Lang; attest: (fields: string[], how?: AttestHow) => Promise<void> }): Promise<LaneResult> {
      const result = await inner.run(form, fill, lc);
      const receiver = ctx.replica as unknown as { receive?: (f: Record<string, unknown>, by: 'parent') => unknown } | undefined;
      // The parent carries the signed paper in. Only what the PDF actually holds arrives.
      if (result.status === 'sent_unconfirmed') receiver?.receive?.(result.readBack, 'parent');
      return result;
    },
  };
}

const sessions = new Map<string, Agent>();

/** The understanding layer's accounting per conversation (model spend, calls, latency). */
export interface UnderstandStats {
  costUsd: number;
  calls: number;
  failures: number;
  ms: number[];
}
const understandStats = new Map<string, UnderstandStats>();

/** PATHWAY_UNDERSTANDER=cli: the engine reads each message with the small model (Haiku), served
 * by the `claude` CLI (src/eval/cli-llm.ts strips the session's identity from its environment,
 * so no account detail reaches the model). Unset: the deterministic readers only. */
function harnessUnderstander(conversationId: string) {
  const mode = process.env.PATHWAY_UNDERSTANDER ?? 'none';
  if (mode === 'none') return undefined;
  if (mode !== 'cli') throw new Error(`PATHWAY_UNDERSTANDER=none|cli, not ${mode}`);
  const st: UnderstandStats = { costUsd: 0, calls: 0, failures: 0, ms: [] };
  understandStats.set(conversationId, st);
  const model = process.env.PATHWAY_UNDERSTAND_MODEL ?? 'claude-haiku-4-5';
  const { transport } = cliLlmClient({ model, timeoutMs: 120_000, onCost: (usd) => void (st.costUsd += usd) });
  return modelUnderstander({
    timeoutMs: 120_000,
    complete: (system, user, signal) => transport.complete(system, user, true, { signal }),
    onCall: ({ ms, ok }) => {
      st.calls++;
      st.ms.push(ms);
      if (!ok) st.failures++;
    },
  });
}

export function understandStatsFor(conversationId: string): UnderstandStats | undefined {
  return understandStats.get(conversationId);
}

const hook: PathwayHook = {
  name: 'pathway-engine',

  async install(agent: Agent, ctx: HookContext) {
    const pathway = ctx.pathway;
    if (!pathway) throw new Error('the pathway hook needs --replica linq or pvusd (a pathway to run)');
    sessions.set(ctx.conversationId, agent);
    const u = harnessUnderstander(ctx.conversationId);
    // The CLI is slower than the API (a process per call): give it room before falling back.
    if (u) agent.setPathwayUnderstander(u, { timeoutMs: 120_000 });

    if (pathway.lanes[0] === 'direct') {
      if (!ctx.replicaUrl) throw new Error('the direct lane needs a running replica');
      let link = '';
      registry.registerLane(directLane({ url: ctx.replicaUrl, parentUrl: ctx.parentUrl, statusWaitMs: 5, onParentLink: (l) => void (link = l) }));
      // The parent's own hands: open their link and certify.
      ctx.onParentAttest(async () => {
        if (!link) return;
        await fetch(link);
        const token = new URL(link).searchParams.get('token') ?? '';
        await fetch(new URL('/attest', link), {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token, certify: 'on' }).toString(),
        });
      });
    } else {
      const outDir = path.join(os.tmpdir(), 'axolotl-eval-pdf');
      mkdirSync(outDir, { recursive: true });
      registry.registerLane(paperDelivery(new PdfLane({ outDir }), ctx));
    }

    // The parent writes first in the harness (their opening line), so the district's opening
    // message isn't sent: the engine's first reply says what the form is and asks.
    await agent.startPathway(ctx.conversationId, pathway.id, districtSeed(ctx.family.record), { announce: false });
  },

  costUsd(conversationId) {
    return understandStats.get(conversationId)?.costUsd ?? 0;
  },

  record(conversationId) {
    const s = sessions.get(conversationId)?.getStateForTest(conversationId)?.pathway as PathwaySession | undefined;
    return s ? FamilyRecord.fromJSON(s.record) : undefined;
  },

  end(conversationId): GradeContext['end'] | undefined {
    const s = sessions.get(conversationId)?.getStateForTest(conversationId)?.pathway as PathwaySession | undefined;
    switch (s?.outcome) {
      case 'done_confirmed':
      case 'sent_unconfirmed':
        return 'done';
      case 'already_covered':
        return 'already_covered';
      case 'handoff':
        return 'handoff';
      case 'abandoned':
        return 'abandoned';
      case 'failed':
        return 'error';
      default:
        return undefined;
    }
  },
};

export default hook;

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * The agent's way into the rules archive (`archive/`, Python): eligibility, procedure and
 * cross-program links as tested code. The agent never re-implements a rule; it asks.
 *
 * One long-lived worker (`python3 -m rulesarchive.serve`), started on first use, answers
 * JSON lines. A cold start is about 0.6 s; after that a call is milliseconds. If the worker
 * can't start or doesn't answer in time, calls fail with ArchiveUnavailable, and callers treat
 * that as "undetermined", never as an answer.
 */

/** The household shape the archive takes (archive/rulesarchive/household.py). */
export interface ArchivePerson {
  id: string;
  age: number;
  relationship?: 'self' | 'spouse' | 'child' | 'parent' | 'other';
  disabled?: boolean;
  blind?: boolean;
  medicare_part_a?: boolean;
  medicare_part_b?: boolean;
  citizen_or_qualified?: boolean;
  student?: boolean;
  pregnant?: boolean;
  /** From the archive's BENEFIT_KINDS, e.g. "snap", "medicaid", "foster_care". */
  benefits?: string[];
  facts?: Record<string, unknown>;
}

export interface ArchiveHousehold {
  state: 'ca' | 'ny' | 'il';
  members: ArchivePerson[];
  incomes?: Array<{ kind: string; monthly: number; owner?: string; note?: string }>;
  assets?: Array<{ kind: string; value: number; owner?: string; note?: string }>;
  county?: string;
  expenses?: Record<string, number>;
  facts?: Record<string, unknown>;
}

export type ArchiveProgram = 'school_meals' | 'snap' | 'medicaid' | 'msp' | 'ltc_medicaid' | 'disability' | 'turning_65';

export interface Determination {
  program: ArchiveProgram;
  state: string;
  as_of: string;
  status: 'eligible' | 'ineligible' | 'undetermined';
  tier: string | null;
  /** Every rule that decided it, by stable id, with the numbers. */
  reasons: Array<{ rule: string; text: string; passed: boolean | null }>;
  parameters_used: Record<string, { effective_from: string; value: unknown }>;
  open_questions: string[];
  amounts: Record<string, number>;
  /** Cross-program effects, e.g. "federal_category:free", "ca:meal_application_for_lcff". */
  links: string[];
}

export interface ArchiveCase {
  id: string;
  title: string;
  as_of: string;
  tags?: string[];
  household: ArchiveHousehold;
  expect: Record<string, unknown>;
  file?: string;
}

export class ArchiveUnavailable extends Error {
  constructor(reason: string) {
    super(`rules archive unavailable: ${reason}`);
    this.name = 'ArchiveUnavailable';
  }
}

export interface ArchiveClientOptions {
  /** Python to run. Default: ARCHIVE_PYTHON or "python3". */
  python?: string;
  /** The archive directory. Default: <repo>/archive. */
  dir?: string;
  /** Per-call timeout. The first call also pays the cold start. Default 10 s. */
  timeoutMs?: number;
}

const REPO_ARCHIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../archive');

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout };

export class ArchiveClient {
  private proc?: ChildProcessWithoutNullStreams;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private readonly python: string;
  private readonly dir: string;
  private readonly timeoutMs: number;

  constructor(opts: ArchiveClientOptions = {}) {
    this.python = opts.python ?? process.env.ARCHIVE_PYTHON ?? 'python3';
    this.dir = opts.dir ?? process.env.ARCHIVE_DIR ?? REPO_ARCHIVE;
    this.timeoutMs = opts.timeoutMs ?? Number(process.env.ARCHIVE_TIMEOUT_MS ?? 10_000);
  }

  ping(): Promise<{ version: number; programs: ArchiveProgram[] }> {
    return this.call('ping', {}) as Promise<{ version: number; programs: ArchiveProgram[] }>;
  }

  /** The archive's determination for this household on this date. */
  evaluate(program: ArchiveProgram, household: ArchiveHousehold, asOf: string): Promise<Determination> {
    return this.call('evaluate', { program, household, as_of: asOf }) as Promise<Determination>;
  }

  /** The archive's synthetic household cases (ground truth for the harness). */
  cases(program: ArchiveProgram, state?: ArchiveHousehold['state']): Promise<ArchiveCase[]> {
    return this.call('cases', { program, state }) as Promise<ArchiveCase[]>;
  }

  close(): void {
    this.proc?.stdin.end();
    this.proc?.kill();
    this.proc = undefined;
    this.failAll('closed');
  }

  private start(): ChildProcessWithoutNullStreams {
    if (this.proc && this.proc.exitCode === null && !this.proc.killed) return this.proc;
    const proc = spawn(this.python, ['-m', 'rulesarchive.serve'], { cwd: this.dir, env: { ...process.env, PYTHONUNBUFFERED: '1' } });
    this.proc = proc;
    createInterface({ input: proc.stdout }).on('line', (line) => this.onLine(line));
    // The worker writes tracebacks to stderr; keep them in our logs, never in a reply.
    proc.stderr.on('data', (d: Buffer) => console.error(`[archive] ${d.toString().trimEnd()}`));
    proc.on('error', (e) => {
      if (this.proc === proc) this.proc = undefined;
      this.failAll(e.message);
    });
    proc.on('exit', (code) => {
      if (this.proc === proc) this.proc = undefined;
      this.failAll(`worker exited (${code})`);
    });
    // Don't keep the agent (or a test run) alive just for the worker.
    proc.unref();
    (proc.stdin as unknown as { unref?: () => void }).unref?.();
    (proc.stdout as unknown as { unref?: () => void }).unref?.();
    (proc.stderr as unknown as { unref?: () => void }).unref?.();
    return proc;
  }

  private call(op: string, args: Record<string, unknown>): Promise<unknown> {
    let proc: ChildProcessWithoutNullStreams;
    try {
      proc = this.start();
    } catch (e) {
      return Promise.reject(new ArchiveUnavailable((e as Error).message));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new ArchiveUnavailable(`no answer to ${op} in ${this.timeoutMs} ms`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      proc.stdin.write(JSON.stringify({ id, op, args }) + '\n');
    });
  }

  private onLine(line: string): void {
    let msg: { id?: number; ok?: boolean; result?: unknown; error?: string };
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    const p = msg.id !== undefined ? this.pending.get(msg.id) : undefined;
    if (!p) return;
    this.pending.delete(msg.id!);
    clearTimeout(p.timer);
    if (msg.ok) p.resolve(msg.result);
    else p.reject(new Error(`archive: ${msg.error ?? 'error'}`));
  }

  private failAll(reason: string): void {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new ArchiveUnavailable(reason));
      this.pending.delete(id);
    }
  }
}

let shared: ArchiveClient | undefined;
/** The process-wide client (one worker per agent process). */
export function archive(): ArchiveClient {
  return (shared ??= new ArchiveClient());
}

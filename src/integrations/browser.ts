import 'dotenv/config';
import type { Stagehand, StagehandBrowser, Page, StagehandCreateOptions } from '@browserbasehq/stagehand';
import { createDeepseekGenerate } from './stagehand-llm.js';

/**
 * Browser "hands" layer (Stagehand). Env-gated and graceful: every call returns a
 * tagged result so the caller falls back to static fetch when the browser is
 * absent. Configure `BROWSER_BACKEND=stagehand` (plus `BROWSERBASE_API_KEY` for
 * cloud, or local Chromium) and `STAGEHAND_MODEL` + an LLM key.
 *
 * Fallback hierarchy (see docs/BUILD-PLAN.md Phase 2):
 *   API → WebMCP → direct HTTP → DOM/accessibility (observe/act/extract) → vision.
 * Stagehand covers the DOM/automation rung; WebMCP + vision are later layers.
 *
 * IMPORTANT: `browserFill` only PRE-FILLS fields — it never submits. Submission
 * of a consequential form stays behind the StepExecutor consent gate.
 */

export type BrowserResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export function browserBackend(): 'stagehand' | 'none' {
  return process.env.BROWSER_BACKEND?.toLowerCase() === 'stagehand' ? 'stagehand' : 'none';
}

let stagehandPromise: Promise<Stagehand | null> | undefined;

async function getStagehand(): Promise<Stagehand | null> {
  if (browserBackend() !== 'stagehand') return null;
  if (stagehandPromise) return stagehandPromise;
  stagehandPromise = (async () => {
    try {
      const { Stagehand: SH, localBrowser, browserbase } = await import('@browserbasehq/stagehand');
      let browser: StagehandBrowser;
      if (process.env.BROWSERBASE_API_KEY) {
        browser = await browserbase.launch({ apiKey: process.env.BROWSERBASE_API_KEY });
      } else {
        browser = await localBrowser.launch({ headless: true });
      }
      const llmKey = process.env.STAGEHAND_API_KEY ?? process.env.OPENAI_API_KEY;
      let model: unknown;
      if (llmKey) {
        // OpenAI-compatible provider via modelName
        model = { modelName: process.env.STAGEHAND_MODEL ?? 'openai/gpt-4o-mini', apiKey: llmKey };
      } else if (process.env.DEEPSEEK_API_KEY) {
        // DeepSeek via the custom `generate` adapter
        model = { generate: createDeepseekGenerate() };
      }
      const options = { browser, ...(model ? { model } : {}) } as unknown as StagehandCreateOptions;
      return await SH.create(options);
    } catch (e) {
      console.error('[browser] Stagehand init failed:', (e as Error)?.message ?? e);
      return null;
    }
  })();
  return stagehandPromise;
}

async function getPage(): Promise<{ stagehand: Stagehand; page: Page } | null> {
  const s = await getStagehand();
  if (!s) return null;
  try {
    const pages = await s.browser.context.pages();
    const page = pages[0];
    return page ? { stagehand: s, page } : null;
  } catch {
    return null;
  }
}

export async function browserOpen(url: string): Promise<BrowserResult<string>> {
  const h = await getPage();
  if (!h) return { ok: false, reason: 'browser not configured' };
  try {
    await h.page.goto(url);
    return { ok: true, data: url };
  } catch (e) {
    return { ok: false, reason: String((e as Error)?.message ?? e) };
  }
}

export interface ActionableElement {
  selector: string;
  description: string;
}

export async function browserObserve(instruction?: string): Promise<BrowserResult<ActionableElement[]>> {
  const h = await getPage();
  if (!h) return { ok: false, reason: 'browser not configured' };
  try {
    const res = await h.stagehand.observe(instruction);
    const data = (res.data ?? []) as Array<{ selector?: string; description?: string }>;
    return { ok: true, data: data.map((a) => ({ selector: a.selector ?? '', description: a.description ?? '' })) };
  } catch (e) {
    return { ok: false, reason: String((e as Error)?.message ?? e) };
  }
}

export async function browserAct(instruction: string): Promise<BrowserResult<string>> {
  const h = await getPage();
  if (!h) return { ok: false, reason: 'browser not configured' };
  try {
    const res = await h.stagehand.act(instruction);
    return { ok: true, data: res.data?.message ?? 'done' };
  } catch (e) {
    return { ok: false, reason: String((e as Error)?.message ?? e) };
  }
}

export async function browserExtract(
  instruction: string,
  fields: string[],
): Promise<BrowserResult<Record<string, string>>> {
  const h = await getPage();
  if (!h) return { ok: false, reason: 'browser not configured' };
  try {
    // Fold the requested fields into the instruction (Stagehand's typed-schema
    // overload wants its own bundled zod, which would fork our zod version).
    const full = fields.length ? `${instruction} — return these fields: ${fields.join(', ')}` : instruction;
    const res = await h.stagehand.extract(full);
    return { ok: true, data: (res.data ?? {}) as Record<string, string> };
  } catch (e) {
    return { ok: false, reason: String((e as Error)?.message ?? e) };
  }
}

/** Normalize a label/name for fuzzy matching. */
function normLabel(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** One natural-language instruction to fill ALL fields at once (fewer LLM calls). */
function buildFillInstruction(fields: Array<{ label: string; value: string }>): string {
  const lines = fields.map((f) => `- ${f.label}: ${f.value}`);
  return `Fill this form with exactly these values:\n${lines.join('\n')}\nFill every one of these fields with its value. Do not submit.`;
}

interface FormField {
  label: string;
  value: string;
  selector?: string;
  type?: string;
}

/**
 * Read every form field's label + value straight from the DOM (deterministic, fast),
 * resolving the question via aria-labelledby (Google Forms + a11y-wired fields get
 * real labels like 'Child First Name', not generic 'Your answer'). Assigns data-axl
 * so we can fill by selector. Runs as a browser JS string (no DOM types in Node tsconfig).
 */
async function getFormFields(page: Page): Promise<FormField[]> {
  const JS = `(() => {
    const out = [];
    let n = 0;
    document.querySelectorAll('input, select, textarea').forEach((el) => {
      const t = (el.type || '').toLowerCase();
      if (['hidden','submit','button','checkbox','radio','file'].indexOf(t) !== -1) return;
      el.setAttribute('data-axl', String(n));
      let q = '';
      const lid = (el.getAttribute('aria-labelledby') || el.getAttribute('aria-describedby')) || '';
      if (lid) { const ref = document.getElementById(lid.split(' ')[0]); if (ref) q = ref.textContent || ''; }
      if (!q) q = el.getAttribute('aria-label') || el.placeholder || (el.labels && el.labels[0] ? el.labels[0].textContent : '') || el.getAttribute('name') || '';
      q = (q || '').replace(/\\s*\\*\\s*$/, '').trim();
      if (q) out.push({ label: q, selector: '[data-axl="' + n + '"]', type: el.tagName.toLowerCase() === 'select' ? 'select' : (t || 'text'), value: el.value || '' });
      n++;
    });
    return out;
  })()`;
  try {
    return (await (page as unknown as { evaluate: (expr: string) => Promise<unknown> }).evaluate(JS)) as FormField[];
  } catch {
    return [];
  }
}

/** Find the field whose label best matches the target label. */
function findField(state: FormField[], label: string): FormField | undefined {
  const target = normLabel(label).split(' ').filter(Boolean);
  if (!target.length) return undefined;
  let best: FormField | undefined;
  let bestScore = 0;
  for (const item of state) {
    const dl = normLabel(item.label);
    if (!dl) continue;
    const overlap = target.filter((t) => dl.includes(t)).length;
    const score = overlap / target.length;
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return bestScore >= 0.6 ? best : undefined;
}

function sameValue(a: string, b: string): boolean {
  return normLabel(a) === normLabel(b);
}

/** Deterministically fill one field by selector (text → fill, select → selectOption). */
async function fillByType(page: Page, selector: string, type: string, value: string): Promise<boolean> {
  const loc = page.locator(selector);
  try {
    if (type === 'select') await loc.selectOption(value);
    else await loc.fill(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Fill form fields by natural-language label. Strategy: read the fields + their DOM
 * selectors straight from the DOM (deterministic, fast), fill via page.locator().fill()
 * where we can match a label; fall back to one natural-language act for the rest.
 * Then machine-verify by reading the values back and self-heal any misses.
 * NEVER submits — submission stays behind the consent gate upstream.
 */
export async function browserFill(
  fields: Array<{ label: string; value: string }>,
): Promise<BrowserResult<{ filled: number; verified?: boolean; mismatches?: Array<{ label: string; value: string }> }>> {
  const h = await getPage();
  if (!h) return { ok: false, reason: 'browser not configured' };
  if (!fields.length) return { ok: true, data: { filled: 0, verified: true, mismatches: [] } };
  try {
    let formFields = await getFormFields(h.page);
    const used = new Set<string>();
    const leftovers: Array<{ label: string; value: string }> = [];

    for (const f of fields) {
      const target = findField(formFields, f.label);
      // Prefer deterministic selector fill; only reuse a selector once.
      if (target?.selector && target.type && !used.has(target.selector) && (await fillByType(h.page, target.selector, target.type, f.value))) {
        used.add(target.selector);
      } else {
        leftovers.push(f);
      }
    }
    if (leftovers.length) await h.stagehand.act(buildFillInstruction(leftovers));

    // Couldn't read the form: be optimistic but honest about it.
    let state = await getFormFields(h.page);
    if (state.length === 0) return { ok: true, data: { filled: fields.length, verified: false, mismatches: [] } };

    const isFilled = (f: { label: string; value: string }) => {
      const dom = findField(state, f.label);
      if (dom && sameValue(dom.value, f.value)) return true;
      return state.some((item) => sameValue(item.value, f.value));
    };

    let mismatches = fields.filter((f) => !isFilled(f));
    if (mismatches.length) {
      await h.stagehand.act(buildFillInstruction(mismatches));
      state = await getFormFields(h.page);
      mismatches = fields.filter((f) => !isFilled(f));
    }

    return {
      ok: true,
      data: { filled: fields.length - mismatches.length, verified: mismatches.length === 0, mismatches },
    };
  } catch (e) {
    return { ok: false, reason: String((e as Error)?.message ?? e) };
  }
}

export async function browserClose(): Promise<void> {
  const s = await getStagehand();
  await s?.close().catch(() => {});
}

/** Extract text from a PDF by URL. Scanned PDFs may yield no text (→ OCR later). */
export async function extractPdf(url: string): Promise<BrowserResult<{ text: string }>> {
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false, reason: `fetch ${res.status}` };
    const buf = new Uint8Array(await res.arrayBuffer());
    const { extractText } = await import('unpdf');
    const out = await extractText(buf, { mergePages: true });
    const text = String(out?.text ?? '').trim();
    return text.length ? { ok: true, data: { text } } : { ok: false, reason: 'no text extracted (scanned PDF?)' };
  } catch (e) {
    return { ok: false, reason: String((e as Error)?.message ?? e) };
  }
}

/** True when a URL looks like a PDF (route to extractPdf instead of static fetch). */
export function isPdfUrl(url: string): boolean {
  return /\.pdf(\?|#|$)/i.test(url);
}

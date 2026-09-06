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

/** Fill form fields by natural-language label. NEVER submits — consent-gated upstream. */
export async function browserFill(
  fields: Array<{ label: string; value: string }>,
): Promise<BrowserResult<{ filled: number }>> {
  const h = await getPage();
  if (!h) return { ok: false, reason: 'browser not configured' };
  try {
    let filled = 0;
    for (const f of fields) {
      const res = await h.stagehand.act(`type "${f.value}" into the field labeled "${f.label}"`);
      if (res.data?.success) filled++;
    }
    return { ok: true, data: { filled } };
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

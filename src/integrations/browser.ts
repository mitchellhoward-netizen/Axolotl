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

/** A radio/checkbox option group: a question with selectable options. */
interface OptionGroup {
  question: string;
  type: 'radio' | 'checkbox';
  options: Array<{ label: string; selector: string }>;
}

interface FormMap {
  fields: FormField[];
  optionGroups: OptionGroup[];
}

/**
 * Read every form field (text/select/textarea → fillable) plus radio/checkbox
 * option groups straight from the DOM (deterministic, fast). Resolves the question
 * via aria-labelledby so Google Form fields get real labels, not generic 'Your answer'.
 * Assigns data-axl so we can fill/check by selector.
 */
async function getFormMap(page: Page): Promise<FormMap> {
  const JS = `(() => {
    const out = [];
    const groups = {};
    let n = 0;
    const questionOf = (el) => {
      const lid = (el.getAttribute('aria-labelledby') || el.getAttribute('aria-describedby')) || '';
      if (lid) { const ref = document.getElementById(lid.split(' ')[0]); if (ref) return (ref.textContent || '').trim(); }
      return '';
    };
    document.querySelectorAll('input, select, textarea').forEach((el) => {
      const t = (el.type || '').toLowerCase();
      if (['hidden','submit','button','checkbox','radio','file'].indexOf(t) !== -1) return;
      el.setAttribute('data-axl', String(n));
      const q = questionOf(el) || el.getAttribute('aria-label') || el.placeholder || (el.labels && el.labels[0] ? el.labels[0].textContent : '') || el.getAttribute('name') || '';
      if (q.trim()) out.push({ label: (q || '').replace(/\\s*\\*\\s*$/, '').trim(), selector: '[data-axl="' + n + '"]', type: el.tagName.toLowerCase() === 'select' ? 'select' : (t || 'text'), value: el.value || '' });
      n++;
    });
    return { fields: out, optionGroups: Object.values(groups) };
  })()`;
  try {
    return (await (page as unknown as { evaluate: (expr: string) => Promise<unknown> }).evaluate(JS)) as FormMap;
  } catch {
    return { fields: [], optionGroups: [] };
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
): Promise<BrowserResult<{ filled: number; verified?: boolean; mismatches?: Array<{ label: string; value: string }>; url?: string }>> {
  const h = await getPage();
  if (!h) return { ok: false, reason: 'browser not configured' };
  const pageUrl = (await h.page.url().catch(() => '')) as string;
  if (!fields.length) return { ok: true, data: { filled: 0, verified: true, mismatches: [], url: pageUrl } };
  try {
    let form = await getFormMap(h.page);
    const used = new Set<string>();
    const leftovers: Array<{ label: string; value: string }> = [];

    for (const f of fields) {
      // Text/select/textarea → deterministic fill. Radio/checkbox/dropdown fall
      // through to a natural-language act (Stagehand reads the accessibility tree).
      const target = findField(form.fields, f.label);
      if (target?.selector && target.type && !used.has(target.selector) && (await fillByType(h.page, target.selector, target.type, f.value))) {
        used.add(target.selector);
      } else {
        leftovers.push(f);
      }
    }
    if (leftovers.length) await h.stagehand.act(buildFillInstruction(leftovers));

    if (form.fields.length === 0) return { ok: true, data: { filled: fields.length, verified: false, mismatches: [], url: pageUrl } };

    const isFilled = (f: { label: string; value: string }) => {
      const dom = findField(form.fields, f.label);
      if (dom && sameValue(dom.value, f.value)) return true;
      return form.fields.some((item) => sameValue(item.value, f.value));
    };

    let mismatches = fields.filter((f) => !isFilled(f));
    if (mismatches.length) {
      await h.stagehand.act(buildFillInstruction(mismatches));
      form = await getFormMap(h.page);
      mismatches = fields.filter((f) => !isFilled(f));
    }

    return {
      ok: true,
      data: { filled: fields.length - mismatches.length, verified: mismatches.length === 0, mismatches, url: pageUrl },
    };
  } catch (e) {
    return { ok: false, reason: String((e as Error)?.message ?? e) };
  }
}

export interface PageAssessment {
  ok: boolean;
  url: string;
  title: string;
  hasForm: boolean;
  fieldCount: number;
  contentLength: number;
  blank: boolean;
  text: string;
  score: number;
  signals: string[];
  problem?: string;
}

/**
 * Evaluate the quality + correctness of a web page before we trust it. This is
 * the "wrong form is a blank shell" guard: a page that's basically empty, has no
 * real form fields, or doesn't mention the target school/program is flagged so
 * the agent moves to the next candidate instead of filling a dead page.
 */
export async function browserAssessPage(url: string, target?: string): Promise<BrowserResult<PageAssessment>> {
  const h = await getPage();
  if (!h) return { ok: false, reason: 'browser not configured' };
  try {
    await h.page.goto(url, { waitUntil: 'domcontentloaded' as 'load' }).catch(() => {});
    await h.page.waitForTimeout(6000);
    const raw = (await h.page.evaluate(
      `(() => {
        const title = (document.title || '').trim();
        const bodyText = ((document.body && document.body.innerText) || '').trim();
        let fieldCount = 0;
        document.querySelectorAll('input, select, textarea').forEach((el) => {
          const t = (el.type || '').toLowerCase();
          if (['hidden','submit','button','checkbox','radio','file'].indexOf(t) !== -1) return;
          fieldCount++;
        });
        return { title, contentLength: bodyText.length, fieldCount, text: bodyText.slice(0, 300) };
      })()`,
    )) as { title: string; contentLength: number; fieldCount: number; text: string };

    const blank = raw.contentLength < 60;
    const hasForm = raw.fieldCount > 0;
    // Space-insensitive so "afterschool" matches "after school", "afterschool", etc.
    const strip = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const mentionsTarget = target ? strip(raw.title + ' ' + raw.text).includes(strip(target)) : true;
    const signals: string[] = [];
    if (blank) signals.push('blank');
    if (hasForm) signals.push('has-form');
    if (raw.contentLength > 300) signals.push('has-content');
    if (!mentionsTarget) signals.push('no-target-match');
    const ok = !blank && (hasForm || raw.contentLength > 250);
    const score = (hasForm ? 0.5 : 0) + (!blank && raw.contentLength > 250 ? 0.3 : 0) + (mentionsTarget ? 0.2 : 0);
    return {
      ok: true,
      data: {
        ok,
        url,
        title: raw.title,
        hasForm,
        fieldCount: raw.fieldCount,
        contentLength: raw.contentLength,
        blank,
        text: raw.text,
        score: Number(score.toFixed(2)),
        signals,
        problem: blank ? 'blank page' : !hasForm ? 'no form fields found' : mentionsTarget ? undefined : 'does not mention the target school/program',
      },
    };
  } catch (e) {
    return { ok: false, reason: String((e as Error)?.message ?? e) };
  }
}

/** Read the Google Forms "view my response" link from the post-submit page, else the page URL. */
async function captureResponseLink(page: Page): Promise<string> {
  try {
    const link = (await page.evaluate(
      `(() => {
        const a = [...document.querySelectorAll('a')].find((a) => /view my response|your response|responses/i.test((a.textContent || '') + ' ' + (a.getAttribute('href') || '')));
        return a ? a.href : '';
      })()`,
    )) as string;
    if (link) return link;
  } catch {
    /* fall through */
  }
  try {
    return page.url();
  } catch {
    return '';
  }
}

/**
 * Submit the form on the current page and capture the post-submit response link,
 * so we can hand the parent the "filled form" link. Returns the response link.
 */
export async function browserSubmit(): Promise<BrowserResult<{ responseLink: string }>> {
  const h = await getPage();
  if (!h) return { ok: false, reason: 'browser not configured' };
  const sub = await browserAct('click the submit button');
  if (!sub.ok) return { ok: false, reason: sub.reason };
  await h.page.waitForTimeout(5000); // let the confirmation page load
  const responseLink = await captureResponseLink(h.page);
  return { ok: true, data: { responseLink } };
}

export async function browserClose(): Promise<void> {
  const s = await getStagehand();
  await s?.close().catch(() => {});
}

/** Pause the shared browser (lets a SPA finish re-rendering after a click/submit). */
export async function browserWait(ms: number): Promise<BrowserResult<void>> {
  const h = await getPage();
  if (!h) return { ok: false, reason: 'browser not configured' };
  try {
    await h.page.waitForTimeout(ms);
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, reason: String((e as Error)?.message ?? e) };
  }
}

export interface BrowserState {
  url: string;
  title: string;
  text: string;
  hasCodePrompt: boolean;
  isLoggedIn: boolean;
  hasLoginForm: boolean;
}

/**
 * Snapshot the current page's auth-relevant state: is there a verification-code
 * prompt, are we logged in, is a login form present. Heuristic (text + input
 * shape) — good enough to steer the account flow.
 */
export async function browserState(): Promise<BrowserResult<BrowserState>> {
  const h = await getPage();
  if (!h) return { ok: false, reason: 'browser not configured' };
  try {
    const raw = (await (h.page as unknown as { evaluate: (expr: string) => Promise<unknown> }).evaluate(
      `(() => {
        const text = ((document.body && document.body.innerText) || '').trim();
        const inputs = [...document.querySelectorAll('input')].filter(
          (e) => ['hidden', 'submit', 'button'].indexOf((e.type || '').toLowerCase()) === -1,
        );
        const codeLike = inputs.length > 0 && inputs.length <= 3 && /code|verification|confirm your|enter the|otp|6-digit/i.test(text);
        const loginLike = /log in|login|sign in|password|logon/i.test(text);
        const loggedIn = !loginLike && /welcome|dashboard|sign out|log out|my account|my connections|my applications/i.test(text);
        return {
          url: location.href,
          title: (document.title || '').trim(),
          text: text.slice(0, 2000),
          hasCodePrompt: codeLike,
          isLoggedIn: loggedIn,
          hasLoginForm: loginLike,
        };
      })()`,
    )) as BrowserState;
    return { ok: true, data: raw };
  } catch (e) {
    return { ok: false, reason: String((e as Error)?.message ?? e) };
  }
}

/**
 * Click the first button/link/submit whose visible text equals (then contains)
 * the given label. Uses a TRUSTED Playwright click (not a synthetic DOM .click(),
 * which some SPAs ignore for async actions like "send code").
 */
export async function browserClickByText(text: string): Promise<BrowserResult<boolean>> {
  const h = await getPage();
  if (!h) return { ok: false, reason: 'browser not configured' };
  try {
    const idx = (await (h.page as unknown as { evaluate: (expr: string) => Promise<unknown> }).evaluate(
      `((t) => {
        const norm = (s) => (s || '').trim().toLowerCase().replace(/\\s+/g, ' ');
        const els = [...document.querySelectorAll('button, a, [role="button"], input[type="submit"], input[type="button"]')];
        els.forEach((el, i) => el.setAttribute('data-axl-click', String(i)));
        const exact = els.findIndex((e) => norm(e.textContent || e.value || '') === norm(t));
        if (exact !== -1) return exact;
        return els.findIndex((e) => norm(e.textContent || e.value || '').includes(norm(t)));
      })(${JSON.stringify(text)})`,
    )) as number;
    if (idx < 0) return { ok: true, data: false };
    await h.page.locator(`[data-axl-click="${idx}"]`).click();
    return { ok: true, data: true };
  } catch (e) {
    return { ok: false, reason: String((e as Error)?.message ?? e) };
  }
}

export interface BrowserFieldInfo {
  label: string;
  type: string;
  value: string;
}

export interface BrowserRadioGroup {
  question: string;
  type: 'radio' | 'checkbox';
  options: string[];
}

/** Read the current page's fillable fields + radio/checkbox groups (deterministic). */
export async function browserFields(): Promise<
  BrowserResult<{ fields: BrowserFieldInfo[]; optionGroups: BrowserRadioGroup[] }>
> {
  const h = await getPage();
  if (!h) return { ok: false, reason: 'browser not configured' };
  try {
    const map = await getFormMap(h.page);
    return {
      ok: true,
      data: {
        fields: map.fields.map((f) => ({ label: f.label, type: f.type ?? 'text', value: f.value })),
        optionGroups: map.optionGroups.map((g) => ({
          question: g.question,
          type: g.type,
          options: g.options.map((o) => o.label),
        })),
      },
    };
  } catch (e) {
    return { ok: false, reason: String((e as Error)?.message ?? e) };
  }
}

/** Read the current page's clickable button/link labels (deterministic). */
export async function browserButtons(): Promise<BrowserResult<string[]>> {
  const h = await getPage();
  if (!h) return { ok: false, reason: 'browser not configured' };
  try {
    const btns = (await (h.page as unknown as { evaluate: (expr: string) => Promise<unknown> }).evaluate(
      `(() => [...document.querySelectorAll('button, a, [role="button"], input[type="submit"], input[type="button"]')]
        .map((b) => ((b.textContent || b.value || '') || '').trim().replace(/\\s+/g, ' '))
        .filter(Boolean))()`,
    )) as string[];
    return { ok: true, data: btns };
  } catch (e) {
    return { ok: false, reason: String((e as Error)?.message ?? e) };
  }
}

export interface BrowserButtonState {
  text: string;
  disabled: boolean;
}
export interface BrowserInputState {
  type: string;
  checked: boolean;
  disabled: boolean;
  placeholder: string;
  name: string;
  value: string;
  required: boolean;
}
export interface BrowserInspect {
  url: string;
  title: string;
  text: string;
  buttons: BrowserButtonState[];
  inputs: BrowserInputState[];
  errors: string[];
}

/** Deep DOM snapshot: buttons (disabled state), inputs (checked/disabled), and validation errors. */
export async function browserInspect(): Promise<BrowserResult<BrowserInspect>> {
  const h = await getPage();
  if (!h) return { ok: false, reason: 'browser not configured' };
  try {
    const raw = (await (h.page as unknown as { evaluate: (expr: string) => Promise<unknown> }).evaluate(
      `(() => {
        const text = ((document.body && document.body.innerText) || '').trim();
        const buttons = [...document.querySelectorAll('button, input[type="submit"], input[type="button"], a[role="button"]')]
          .map((b) => ({ text: ((b.textContent || b.value || '') || '').trim().replace(/\\s+/g, ' '), disabled: Boolean(b.disabled) || b.getAttribute('aria-disabled') === 'true' }))
          .filter((b) => b.text);
        const inputs = [...document.querySelectorAll('input, select, textarea')].map((e) => ({
          type: (e.type || e.tagName || '').toLowerCase(),
          checked: Boolean(e.checked),
          disabled: Boolean(e.disabled),
          placeholder: e.getAttribute('placeholder') || '',
          name: e.getAttribute('name') || '',
          value: e.value || '',
          required: Boolean(e.required),
        }));
        const errors = [...document.querySelectorAll('[role="alert"], .error, .invalid, [class*="error"], [class*="invalid"]')]
          .map((e) => (e.textContent || '').trim().replace(/\\s+/g, ' '))
          .filter((t) => t && t.length < 200);
        return { url: location.href, title: (document.title || '').trim(), text: text.slice(0, 3000), buttons, inputs, errors };
      })()`,
    )) as BrowserInspect;
    return { ok: true, data: raw };
  } catch (e) {
    return { ok: false, reason: String((e as Error)?.message ?? e) };
  }
}

/** Click the first element matching a CSS selector (trusted Playwright click). */
export async function browserClickBySelector(selector: string): Promise<BrowserResult<boolean>> {
  const h = await getPage();
  if (!h) return { ok: false, reason: 'browser not configured' };
  try {
    await h.page.locator(selector).click();
    return { ok: true, data: true };
  } catch (e) {
    return { ok: false, reason: String((e as Error)?.message ?? e) };
  }
}

export interface SelectControl {
  name: string;
  options: Array<{ value: string; text: string }>;
}
export interface RoleControl {
  role: string;
  text: string;
  checked: boolean;
}

/** Read native <select> options and custom checkbox/radio widgets (Angular Material etc.). */
export async function browserFormControls(): Promise<
  BrowserResult<{ selects: SelectControl[]; roleControls: RoleControl[] }>
> {
  const h = await getPage();
  if (!h) return { ok: false, reason: 'browser not configured' };
  try {
    const raw = (await (h.page as unknown as { evaluate: (expr: string) => Promise<unknown> }).evaluate(
      `(() => {
        const selects = [...document.querySelectorAll('select')].map((s) => ({
          name: s.getAttribute('name') || '',
          options: [...s.options].map((o) => ({ value: o.value, text: (o.textContent || '').trim() })),
        }));
        const roleControls = [...document.querySelectorAll('[role="radio"], [role="checkbox"], mat-radio-button, mat-checkbox, .mat-radio-button, .mat-checkbox')].map((e) => ({
          role: e.getAttribute('role') || e.tagName.toLowerCase(),
          text: (e.textContent || '').trim().replace(/\\s+/g, ' '),
          checked: e.getAttribute('aria-checked') === 'true' || e.classList.contains('mat-radio-checked') || e.classList.contains('mat-checkbox-checked'),
        }));
        return { selects, roleControls };
      })()`,
    )) as { selects: SelectControl[]; roleControls: RoleControl[] };
    return { ok: true, data: raw };
  } catch (e) {
    return { ok: false, reason: String((e as Error)?.message ?? e) };
  }
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

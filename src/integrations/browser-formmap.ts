/**
 * The pure half of the Stagehand fill: read a form map out of the DOM, decide which element
 * each requested value goes into, and check AFTER filling that each value landed in its own
 * element. No browser here, so it can be unit-tested (scripts/test-honesty.ts).
 *
 * Two rules this module exists to enforce (docs/AGENT-PLAN.md Phase 1, fix 4):
 *  - read-back runs against a form map captured AFTER the fill, never the one from before;
 *  - each requested field is matched to ITS OWN element. "Some field on the page holds this
 *    value" is not a pass: a ZIP code typed into the phone box is a wrong field, not a fill.
 */

export interface FormField {
  label: string;
  value: string;
  selector?: string;
  type?: string;
}

/** One selectable option of a radio/checkbox group, with its state when the map was read. */
export interface GroupOption {
  label: string;
  selector: string;
  checked?: boolean;
}

/** A radio/checkbox option group: a question with selectable options. */
export interface OptionGroup {
  question: string;
  type: 'radio' | 'checkbox';
  options: GroupOption[];
}

export interface FormMap {
  fields: FormField[];
  optionGroups: OptionGroup[];
}

export interface WantedField {
  label: string;
  value: string;
}

/**
 * Browser-side script that reads text/select/textarea fields AND radio/checkbox groups.
 * Element ids (data-axl / data-axl-opt) are assigned once per element and kept on re-reads,
 * so a selector recorded before the fill still names the same element after it, even when a
 * conditional field appears in between.
 */
export const FORM_MAP_JS = `(() => {
  const out = [];
  const groups = {};
  const order = [];
  window.__axlN = window.__axlN || 0;
  const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();
  const byId = (ids) => {
    const id = (ids || '').split(' ').filter(Boolean)[0];
    const ref = id ? document.getElementById(id) : null;
    return ref ? norm(ref.textContent) : '';
  };
  const questionOf = (el) => byId(el.getAttribute('aria-labelledby') || el.getAttribute('aria-describedby'));
  const idOf = (el, attr) => {
    if (!el.hasAttribute(attr)) el.setAttribute(attr, String(++window.__axlN));
    return '[' + attr + '="' + el.getAttribute(attr) + '"]';
  };
  document.querySelectorAll('input, select, textarea').forEach((el) => {
    const t = (el.type || '').toLowerCase();
    if (['hidden','submit','button','checkbox','radio','file','image','reset'].indexOf(t) !== -1) return;
    const q = questionOf(el) || el.getAttribute('aria-label') || el.placeholder || (el.labels && el.labels[0] ? el.labels[0].textContent : '') || el.getAttribute('name') || '';
    if (!norm(q)) return;
    out.push({ label: norm(q).replace(/\\s*\\*\\s*$/, ''), selector: idOf(el, 'data-axl'), type: el.tagName.toLowerCase() === 'select' ? 'select' : (t || 'text'), value: el.value || '' });
  });
  const optionLabel = (el) => {
    const own = el.getAttribute('aria-label') || el.getAttribute('data-value') || '';
    if (norm(own)) return norm(own);
    if (el.labels && el.labels[0]) return norm(el.labels[0].textContent);
    const l = el.closest('label');
    if (l) return norm(l.textContent);
    return norm(el.textContent) || norm(el.value);
  };
  const groupOf = (el) => {
    const container = el.closest('[role="radiogroup"], [role="group"], fieldset');
    let question = '';
    if (container) {
      const legend = container.tagName.toLowerCase() === 'fieldset' ? container.querySelector('legend') : null;
      question = (legend ? norm(legend.textContent) : '') || byId(container.getAttribute('aria-labelledby')) || norm(container.getAttribute('aria-label'));
    }
    const name = el.getAttribute('name') || '';
    const key = name ? 'n:' + name : (container ? 'c:' + idOf(container, 'data-axl-grp') : 'e:' + idOf(el, 'data-axl-opt'));
    return { key, question: question || norm(name.replace(/[_\\[\\].-]+/g, ' ')) };
  };
  document.querySelectorAll('input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"]').forEach((el) => {
    const isRadio = (el.type || '').toLowerCase() === 'radio' || el.getAttribute('role') === 'radio';
    const g = groupOf(el);
    if (!groups[g.key]) { groups[g.key] = { question: g.question, type: isRadio ? 'radio' : 'checkbox', options: [] }; order.push(g.key); }
    groups[g.key].options.push({
      label: optionLabel(el),
      selector: idOf(el, 'data-axl-opt'),
      checked: el.checked === true || el.getAttribute('aria-checked') === 'true',
    });
  });
  return { fields: out, optionGroups: order.map((k) => groups[k]).filter((g) => g.question || g.options.length === 1) };
})()`;

/** Normalize a label/name for fuzzy matching. */
export function normLabel(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function sameValue(a: string, b: string): boolean {
  return normLabel(a) === normLabel(b);
}

/** How well a DOM label matches the requested label: share of the request's words present. */
function labelScore(domLabel: string, label: string): number {
  const target = normLabel(label).split(' ').filter(Boolean);
  const dl = normLabel(domLabel);
  if (!target.length || !dl) return 0;
  if (dl === target.join(' ')) return 1.01; // exact beats a superset label
  const words = new Set(dl.split(' '));
  return target.filter((t) => words.has(t) || (t.length >= 3 && dl.includes(t))).length / target.length;
}

/** Find the field whose label best matches the target label, skipping already-claimed ones. */
export function findField(fields: FormField[], label: string, taken?: Set<string>): FormField | undefined {
  let best: FormField | undefined;
  let bestScore = 0;
  for (const item of fields) {
    if (item.selector && taken?.has(item.selector)) continue;
    const score = labelScore(item.label, label);
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return bestScore >= 0.6 ? best : undefined;
}

function groupKey(g: OptionGroup): string {
  return g.options.map((o) => o.selector).join('|');
}

/** Find the option group whose question best matches the label. */
export function findGroup(groups: OptionGroup[], label: string, taken?: Set<string>): { group: OptionGroup; score: number } | undefined {
  let best: OptionGroup | undefined;
  let bestScore = 0;
  for (const g of groups) {
    if (taken?.has(groupKey(g))) continue;
    // A lone checkbox's question is often its own option text ("I agree to the photo release").
    const q = g.question || (g.options.length === 1 ? g.options[0]!.label : '');
    const score = labelScore(q, label);
    if (score > bestScore) {
      bestScore = score;
      best = g;
    }
  }
  return best && bestScore >= 0.6 ? { group: best, score: bestScore } : undefined;
}

const YES = /^(yes|y|true|checked|check|x|on|agree|i agree)$/i;
const NO = /^(no|n|false|unchecked|uncheck|off|none)$/i;

function optionMatches(option: string, wanted: string): boolean {
  const o = normLabel(option);
  const w = normLabel(wanted);
  if (!o || !w) return false;
  if (o === w) return true;
  // "Yes" must not match "Yes, but only mornings" and also not "No"; whole-word containment only.
  return ` ${o} `.includes(` ${w} `) && w.length >= 3;
}

/**
 * Which options of a group the value selects. Radio: exactly one, or none when nothing
 * matches. Checkbox: a list ("Mon, Wed") picks each named option; on a single-box group
 * "yes"/"no" checks or clears it. Returns undefined when the value cannot be read as options.
 */
export function selectionFor(group: OptionGroup, value: string): Set<string> | undefined {
  const v = value.trim();
  if (group.type === 'checkbox' && group.options.length === 1) {
    const only = group.options[0]!;
    if (YES.test(v) || optionMatches(only.label, v)) return new Set([only.selector]);
    if (NO.test(v)) return new Set();
    return undefined;
  }
  if (group.type === 'radio') {
    const exact = group.options.filter((o) => sameValue(o.label, v));
    const hit = exact.length ? exact : group.options.filter((o) => optionMatches(o.label, v));
    return hit.length === 1 ? new Set([hit[0]!.selector]) : undefined;
  }
  const parts = v.split(/\s*(?:,|;|\band\b|\/)\s*/i).filter(Boolean);
  const picked = new Set<string>();
  for (const part of parts) {
    const exact = group.options.filter((o) => sameValue(o.label, part));
    const hit = exact.length ? exact : group.options.filter((o) => optionMatches(o.label, part));
    if (hit.length !== 1) return undefined;
    picked.add(hit[0]!.selector);
  }
  return picked;
}

export type FillTarget =
  | { kind: 'field'; want: WantedField; field: FormField }
  | { kind: 'group'; want: WantedField; group: OptionGroup; select: Set<string> };

export interface FillPlan {
  targets: FillTarget[];
  /** Requested values no element on the page could be matched to. */
  unmatched: WantedField[];
}

/**
 * Decide where each value goes. Each element is claimed by at most one value, so two values
 * can never both "pass" by pointing at the same box. A group wins over a text field only when
 * the value names one of its options.
 */
export function planFill(map: FormMap, wanted: WantedField[]): FillPlan {
  const takenFields = new Set<string>();
  const takenGroups = new Set<string>();
  const targets: FillTarget[] = [];
  const unmatched: WantedField[] = [];
  for (const want of wanted) {
    const field = findField(map.fields, want.label, takenFields);
    const g = findGroup(map.optionGroups, want.label, takenGroups);
    const select = g ? selectionFor(g.group, want.value) : undefined;
    const fieldScore = field ? labelScore(field.label, want.label) : 0;
    if (g && select && g.score >= fieldScore) {
      takenGroups.add(groupKey(g.group));
      targets.push({ kind: 'group', want, group: g.group, select });
    } else if (field?.selector) {
      takenFields.add(field.selector);
      targets.push({ kind: 'field', want, field });
    } else {
      unmatched.push(want);
    }
  }
  return { targets, unmatched };
}

/** Which options must be clicked to move a group from its current state to the selection. */
export function clicksFor(group: OptionGroup, select: Set<string>): string[] {
  if (group.type === 'radio') {
    const [want] = [...select];
    const opt = group.options.find((o) => o.selector === want);
    return opt && !opt.checked ? [opt.selector] : [];
  }
  return group.options.filter((o) => Boolean(o.checked) !== select.has(o.selector)).map((o) => o.selector);
}

export interface ReadBackMiss {
  label: string;
  value: string;
  /** What the value's own element holds after the fill ('' = empty; undefined = element not found). */
  found?: string;
}

function checkedLabels(g: OptionGroup): string {
  return g.options.filter((o) => o.checked).map((o) => o.label).join(', ');
}

/**
 * Read-back against the form map captured AFTER the fill. A value passes only when the element
 * it was planned into (same selector) — or, for values filled by a fallback path, the element
 * whose label matches it — holds that value. Nothing else on the page counts.
 */
export function readBack(after: FormMap, wanted: WantedField[], plan?: FillPlan): ReadBackMiss[] {
  const bySelector = new Map(after.fields.filter((f) => f.selector).map((f) => [f.selector!, f]));
  const optionState = new Map<string, boolean>();
  for (const g of after.optionGroups) for (const o of g.options) optionState.set(o.selector, Boolean(o.checked));
  const planned = new Map<WantedField, FillTarget>();
  for (const t of plan?.targets ?? []) planned.set(t.want, t);

  const misses: ReadBackMiss[] = [];
  const takenFields = new Set<string>();
  const takenGroups = new Set<string>();
  for (const want of wanted) {
    const t = planned.get(want);
    if (t?.kind === 'group') {
      const ok = t.group.options.every((o) => (optionState.get(o.selector) ?? false) === t.select.has(o.selector));
      const now = after.optionGroups.find((g) => g.options.some((o) => o.selector === t.group.options[0]?.selector));
      if (!ok) misses.push({ label: want.label, value: want.value, found: now ? checkedLabels(now) : undefined });
      continue;
    }
    if (t?.kind === 'field') {
      const el = t.field.selector ? bySelector.get(t.field.selector) : undefined;
      if (!el || !sameValue(el.value, want.value)) misses.push({ label: want.label, value: want.value, found: el?.value });
      continue;
    }
    // Filled by a fallback (placeholder/name match or the model's act): find its own element now.
    const field = findField(after.fields, want.label, takenFields);
    const g = findGroup(after.optionGroups, want.label, takenGroups);
    const select = g ? selectionFor(g.group, want.value) : undefined;
    if (g && select && g.score >= (field ? labelScore(field.label, want.label) : 0)) {
      takenGroups.add(groupKey(g.group));
      if (!g.group.options.every((o) => Boolean(o.checked) === select.has(o.selector))) {
        misses.push({ label: want.label, value: want.value, found: checkedLabels(g.group) });
      }
    } else if (field) {
      if (field.selector) takenFields.add(field.selector);
      if (!sameValue(field.value, want.value)) misses.push({ label: want.label, value: want.value, found: field.value });
    } else {
      misses.push({ label: want.label, value: want.value });
    }
  }
  return misses;
}

/**
 * What the page says after a submit, as evidence. A confirmation needs the page's own words
 * ("your response has been recorded", "thank you for your application") or a reference number
 * printed next to a confirmation word. A page that merely changed is not evidence.
 */
export function detectConfirmation(text: string): { confirmed: boolean; reference?: string; quote?: string } {
  const body = (text || '').replace(/\s+/g, ' ');
  // A reference counts only with a word that says it is one, and only if it has a digit
  // ("Application form" is not a reference; "Confirmation #A12345" is).
  const ref =
    body.match(/\b(?:confirmation|reference|receipt|tracking)\s*(?:number|no\.?|#|id|code)?\s*(?:is|:|#)?\s*([A-Z0-9][A-Z0-9-]{3,})\b/i) ??
    body.match(/\b(?:application|submission|case|ticket|request)\s*(?:number|no\.?|#|id|code)\s*(?:is|:|#)?\s*([A-Z0-9][A-Z0-9-]{3,})\b/i);
  const reference = ref && /\d/.test(ref[1]!) ? ref[1] : undefined;
  const phrase = body.match(
    /(thank you for your (?:response|submission|application|registration)|your (?:response|application|submission|registration|form|request) (?:has been|was) (?:recorded|received|submitted)|(?:has been|was) submitted successfully|submitted successfully|we (?:have )?received your (?:application|form|submission|registration)|response submitted|application received|registration complete)/i,
  );
  if (!reference && !phrase) return { confirmed: false };
  const at = phrase?.index ?? ref?.index ?? 0;
  return { confirmed: true, reference, quote: body.slice(Math.max(0, at - 20), at + 140).trim() };
}

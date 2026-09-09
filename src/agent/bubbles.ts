/**
 * "Multi-bubble" replies — send 1–3 short iMessage bubbles with human typing
 * pacing instead of one long bubble. Purely presentational; never changes what is
 * said or the consent/YES gates. Behind MULTI_BUBBLE (default on; 'false' restores
 * single-send).
 */

export function splitIntoBubbles(text: string): string[] {
  const t = (text ?? '').trim();
  if (!t) return [];

  const isConsent = (s: string) =>
    /\byes\b[^.]{0,40}\bconfirm\b/i.test(s) ||
    /reply (yes|no)\b/i.test(s) ||
    /\bYES\b\s*(to|\/)/i.test(s) ||
    /\bYES\b[\s\S]{0,24}\b(confirm|submit|proceed|send it)\b/i.test(s);
  const isQuestion = (s: string) => /\?\s*$/.test(s.trim());
  const isList = (s: string) => /^\s*[•\-*]/.test(s.trim());

  const paras = t.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);

  // Acknowledgment-only fragment ("Got it!", "Here's what I found:") — never its own
  // bubble, and never after real content. A preamble ("Got it! Here's what I found:")
  // at the start of a content segment gets stripped so the bubble opens with substance.
  const isAckOnly = (s: string) =>
    /^(got it|ok(ay)?|sure|great news|here'?s what i (found|got)|here you go|alright|perfect)[:!.?\s]*$/i.test(s.trim()) ||
    (s.trim().length < 25 && /[:!]\s*$/.test(s.trim()));
  const stripPreamble = (s: string) =>
    s.replace(/^\s*(got it|ok(ay)?|sure|great news|hey!? so|here'?s what i (found|got))[:!,\s]+/i, '').trim();

  // One paragraph → conservative fallback: ≤2 bubbles on sentence boundaries,
  // never mid-sentence; don't over-split short/list/consent/question text.
  if (paras.length === 1) {
    const single0 = paras[0]!;
    if (isAckOnly(single0)) return [];
    const single = stripPreamble(single0);
    const sentenceCount = (single.match(/[.!?](?=\s|$)/g) ?? []).length;
    if (!isList(single) && !isConsent(single) && !isQuestion(single) && single.length > 140 && sentenceCount >= 2) {
      const sentences = single.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
      const first = sentences.slice(0, 2).join(' ');
      const rest = sentences.slice(2).join(' ');
      return rest ? [first, rest] : [first];
    }
    return [single];
  }

  // Multi-paragraph: keep bullet lists whole; isolate consent + clarifying
  // questions as their own bubble. Drop ack-only fragments; strip ack preambles.
  const segs: string[] = [];
  let buf: string[] = [];
  const flush = () => {
    const b = buf.join('\n\n').trim();
    if (b) segs.push(stripPreamble(b));
    buf = [];
  };
  for (const p of paras) {
    if (isAckOnly(p)) continue; // never its own bubble; never after content
    if (isConsent(p) || isQuestion(p) || isList(p)) {
      flush();
      segs.push(p);
    } else {
      buf.push(p);
    }
  }
  flush();

  if (segs.length <= 3) return segs;
  // Cap at 3: keep the LAST (special) as its own final bubble; merge the rest.
  const last = segs[segs.length - 1]!;
  const rest = segs.slice(0, -1).join('\n\n');
  return rest ? [rest, last] : [last];
}

import { toPlainText } from '../lib/plain.js';

export interface BubbleSpace {
  send(t: string): Promise<unknown>;
  startTyping?(): Promise<unknown>;
  stopTyping?(): Promise<unknown>;
}

const MULTI_BUBBLE = process.env.MULTI_BUBBLE !== 'false';
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
// ≈18ms/char, clamped to 0.4–1.2s; bounded so 3 bubbles add ≲2.5s total.
const pace = (s: string) => Math.min(1200, Math.max(400, Math.round(s.length * 18)));

/** Send 1–3 bubbles. Bubble 1 goes immediately (no pre-delay); bubbles 2–3 are
 * paced with typing indicators. Every operation is best-effort. Markdown is stripped
 * per-bubble so NO send path can leak **bold**, #, or - to iMessage. */
export async function sendBubbles(space: BubbleSpace, text: string): Promise<void> {
  const send = (s: string) => space.send(toPlainText(s)).catch(() => {});
  if (!MULTI_BUBBLE) {
    await send(text);
    return;
  }
  const bubbles = splitIntoBubbles(text);
  if (!bubbles.length) return;
  await send(bubbles[0]!);
  for (let i = 1; i < bubbles.length; i++) {
    const b = bubbles[i]!;
    await space.startTyping?.().catch(() => {});
    await delay(pace(b));
    await space.stopTyping?.().catch(() => {});
    await send(b);
  }
}

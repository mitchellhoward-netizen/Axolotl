import { detectLocale } from '../lib/bilingual.js';
import { archive as sharedArchive, type ArchiveClient, type Determination } from '../archive/client.js';
import { FamilyRecord, type FactKey } from '../family/facts.js';
import {
  approvesYes,
  decide,
  jevEnabled,
  probablyYes,
  vetoesYes,
  yesQuestion,
  type Decision,
  type DecisionType,
} from '../agent/decide.js';
import { checkApproval, consentRecord, shownIn, stampApproval, type ApprovalStamp } from '../agent/steps/approval.js';
import type { Step, StepPayload } from '../agent/steps/types.js';
import { acceptModelFacts, extractFacts, fold, type Extraction, type ModelExtractor, type Slot } from './extract.js';
import { pathways as defaultRegistry, type PathwayHints, type PathwayRegistry } from './registry.js';
import { replies, type Replies } from './reply.js';
import type { FactSpec, FieldValue, FormFill, Lang, LaneKind, LaneResult, LaneRunner, Pathway } from './types.js';

/**
 * The pathway engine: one turn of a parent working through one pathway (docs/PATHWAYS.md §3).
 *
 * Code owns the task. Per turn:
 *  1. Gates: crisis, distress, "talk to a person", stop, off-topic → hand the turn back to the
 *     normal agent (the session pauses or ends). Regex always; Jev too when it is configured.
 *  2. Extraction: the parent's words → facts, each with the turn and the quote as its source
 *     (extract.ts). A correction replaces the fact and is said back.
 *  3. Next question: the missing required fact that saves the most questions (a "yes, we get
 *     CalFresh" ends the form, so it goes first), otherwise the form's order; related facts
 *     together; never the same question a third time (a person is offered instead).
 *  4. Precheck: once its facts are in, the archive says whether there's anything to file.
 *  5. Proposal: every value the form will carry, in the family's language, bound to the
 *     parent's yes by the same digest the agent's consent gate uses (steps/approval.ts). On a
 *     yes the lane runs exactly that fill; attestations go back to the parent.
 *  6. Replies from templates (reply.ts).
 *
 * Why the proposal isn't put in `state.pendingSteps`: the agent's gate would run it through
 * the step executor (no lanes there) and its amendment parser would edit the payload instead of
 * the family record. So the engine keeps its one consent-gated Step in the session and checks
 * it with the same functions (stampApproval, checkApproval, shownIn, consentRecord): the yes is
 * bound to the digest of exactly the values shown, a changed value re-shows, it expires the
 * same way, and the consent log row has the same shape.
 */

export type PathwayStage = 'asking' | 'paused' | 'handoff_offered' | 'proposed' | 'attesting' | 'offered_next' | 'closed';
export type PathwayOutcome = 'done_confirmed' | 'sent_unconfirmed' | 'already_covered' | 'handoff' | 'abandoned' | 'failed';

/** Kept on ConversationState.pathway. Plain data only. */
export interface PathwaySession {
  id: string;
  record: ReturnType<FamilyRecord['toJSON']>;
  /** Times each fact was asked. */
  asked: Record<string, number>;
  stage: PathwayStage;
  lang: Lang;
  /** Parent turns this session has handled (the source ref of each fact). */
  turn: number;
  /** What the last question asked, as concrete keys. */
  lastAsked: FactKey[];
  /** Facts set by the parent, newest first. */
  recent: FactKey[];
  /** Optional facts the parent chose to skip. */
  skipped: FactKey[];
  /** A question asked again (the harness's repeatedQuestions). */
  repeatedQuestions: number;
  precheckRan?: boolean;
  determination?: Determination;
  /** The staged proposal: the Step the parent was shown and its stamp. */
  proposal?: { step: Step; stamp: ApprovalStamp; fill: FormFill; confirmAsked?: boolean; unclear?: number };
  /** The fill the parent approved (what the lane got). */
  approved?: FormFill;
  attesting?: { fields: string[]; how?: string; asked: number };
  offered?: string[];
  pausedFrom?: PathwayStage;
  /** "dont_know": the parent will text the answer later, so a plain answer resumes. */
  pauseReason?: 'dont_know';
  outcome?: PathwayOutcome;
  lane?: LaneKind;
  result?: LaneResult;
}

export interface EngineTurn {
  text: string;
  phase: 'clarifying' | 'confirming' | 'done' | 'idle';
  resolved?: boolean;
}

export type GateLabel = 'crisis' | 'distress' | 'person' | 'stop' | 'reset' | 'off_topic';

export interface PathwayEngineOptions {
  registry?: PathwayRegistry;
  archive?: () => ArchiveClient;
  now?: () => Date;
  env?: NodeJS.ProcessEnv;
  /** For facts regex can't read. Its facts count only with a real quote. */
  extractor?: ModelExtractor;
  /** A second gate beside the regexes. Default: Jev, when configured. */
  gate?: (text: string, asked: string) => Promise<{ label: GateLabel | 'answer'; confidence: number } | undefined>;
  /** Reads a reply that isn't a plain yes. Default: Jev, when configured. */
  readYes?: (asked: string, reply: string) => Promise<Decision<'approve' | 'not_approve'> | undefined>;
  /** Whole-message yes / no. The agent passes its own (isStrictConsent / isStrictDecline). */
  isYes?: (text: string) => boolean;
  isNo?: (text: string) => boolean;
  /** Where an approval is recorded (the agent passes logConsent). */
  logConsent?: (conversationId: string, detail: Record<string, unknown>) => void;
}

// ── gates ────────────────────────────────────────────────────────────────────

const CRISIS = /\b(suicid\w*|kill (myself|me)|end my life|want to die|wanna die|hurt (myself|me)|self[- ]harm|not safe (at home|here)|he hits|she hits|hits me|beats me|abus\w+|overdos\w*|me quiero morir|quiero morir(me)?|matarme|suicidarme|hacerme dano|no estoy a salvo|me pega|me golpea|violencia|abuso)\b/;
const DISTRESS = /\b(overwhelmed|can'?t do this|can'?t take (it|this)|i'?m crying|so stressed|falling apart|i give up|desperate|panic\w*|no puedo mas|estoy llorando|agobiad[oa]|desesperad[oa]|estresad[oa]|ya no aguanto)\b/;
const PERSON = /\b((talk|speak|chat) (to|with) (a |an |some |a real )?(person|human|someone|somebody|agent|people)|real person|a human|hablar con (una persona|alguien|un humano|una persona real)|quiero (una persona|un humano))\b/;
const STOP = /^(stop|not now|later|pause|let me think|i'?ll do it later|ahorita no|despues|luego|mas tarde|ahora no)\b[\s.!]*$/;
const RESUME = /^(continue|let'?s continue|go on|keep going|resume|let'?s (do|finish) (it|this)|let'?s go|ok let'?s (do|finish) (it|this)|sigamos|seguir|continuar|continuemos|seguimos|vamos|terminemos)\b/;
const RESET = /^(\/reset|reset|start over|fresh start|start again)\b/;
const ATTESTED = /^(done|signed|i signed( it)?|i did( it)?|did it|ok|okay|yes|yep|all set|finished|listo|ya|ya firme|firme|firmado|hecho|lo hice|ya lo hice|si)\b/;

export function regexGate(text: string): GateLabel | undefined {
  const t = fold(text.trim());
  if (CRISIS.test(t)) return 'crisis';
  if (PERSON.test(t)) return 'person';
  if (RESET.test(t)) return 'reset';
  if (DISTRESS.test(t)) return 'distress';
  if (STOP.test(t)) return 'stop';
  return undefined;
}

const DEFAULT_YES = /^(y|yes|yeah|yep|yup|sure|ok|okay|confirm|do it|go ahead|please|submit|submit it|send it|yes send it|yes please|go for it|sounds good|looks good|s[ií]|s[ií] por favor|dale|claro|claro que s[ií]|[aá]ndale|env[ií]alo|s[ií] env[ií]alo)\s*$/u;
const DEFAULT_NO = /^(n|no|nope|cancel|cancel it|forget it|stop|don'?t|dont|never mind|nevermind|no gracias|no lo env[ií]es|cancela)\s*$/;
const strip = (t: string) => t.trim().toLowerCase().replace(/[.!?]+$/, '');

// ── keys and patterns ────────────────────────────────────────────────────────

const PLACEHOLDER = /<[^>.]+>/g;
const hasPlaceholder = (k: FactKey) => /<[^>.]+>/.test(k);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patternRe = (pattern: FactKey) => new RegExp(`^${pattern.split(PLACEHOLDER).map(escapeRe).join('([^.]+)')}$`);
const shape = (k: FactKey) => k.replace(PLACEHOLDER, '<*>');
const matchKey = (pattern: FactKey, key: FactKey) => (hasPlaceholder(pattern) ? patternRe(pattern).test(key) || shape(pattern) === shape(key) : pattern === key);

function specFor(specs: FactSpec[], key: FactKey): FactSpec | undefined {
  if (hasPlaceholder(key)) return specs.find((s) => shape(s.key) === shape(key));
  return specs.find((s) => s.key === key) ?? specs.find((s) => hasPlaceholder(s.key) && patternRe(s.key).test(key));
}

function hintFor<T>(map: Record<FactKey, T> | undefined, key: FactKey): T | undefined {
  if (!map) return undefined;
  if (key in map) return map[key];
  for (const [k, v] of Object.entries(map)) if (hasPlaceholder(k) && patternRe(k).test(key)) return v;
  return undefined;
}

const isRequired = (spec: FactSpec, rec: FamilyRecord) => (typeof spec.required === 'function' ? spec.required(rec) : spec.required);

/** "income.0.amount" → "income amount"; "child_first_name" → "child first name". */
function humanize(id: string): string {
  return id
    .replace(/<[^>]+>/g, '')
    .split('.')
    .filter((p) => p && !/^\d+$/.test(p) && !/^[a-z]\d+$/.test(p))
    .join(' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

interface Live {
  result: Promise<{ ok: true; r: LaneResult } | { ok: false; e: unknown }>;
  attest?: { fields: string[]; how?: string; resolve: () => void; reject: (e: Error) => void };
  signal?: () => void;
  lane: LaneRunner;
}

export class PathwayEngine {
  private readonly registry: PathwayRegistry;
  private readonly now: () => Date;
  private readonly env: NodeJS.ProcessEnv;
  private readonly live = new Map<string, Live>();

  constructor(private readonly opts: PathwayEngineOptions = {}) {
    this.registry = opts.registry ?? defaultRegistry;
    this.now = opts.now ?? (() => new Date());
    this.env = opts.env ?? process.env;
  }

  // ── entry points ───────────────────────────────────────────────────────────

  /** Start a session. `seed` is what we already know (the district's record, a finished
   * pathway's facts), each fact with its own source. */
  async start(conversationId: string, state: { pathway?: PathwaySession }, pathwayId: string, opts: { seed?: FamilyRecord; lang?: Lang } = {}): Promise<EngineTurn> {
    const pathway = this.registry.pathway(pathwayId);
    if (!pathway) throw new Error(`no pathway registered as ${pathwayId}`);
    const rec = opts.seed ? FamilyRecord.fromJSON(opts.seed.toJSON()) : new FamilyRecord(pathway.state);
    const s: PathwaySession = {
      id: pathway.id,
      record: rec.toJSON(),
      asked: {},
      stage: 'asking',
      lang: opts.lang ?? 'en',
      turn: 0,
      lastAsked: [],
      recent: [],
      skipped: [],
      repeatedQuestions: 0,
    };
    state.pathway = s;
    const t = await this.advance(conversationId, s, pathway, rec);
    if (s.stage === 'asking') t.text = this.r(s).start(pathway.title[s.lang], t.text);
    return t;
  }

  /** One parent message. `undefined` means the engine is not handling it: the normal agent
   * answers (no session, a paused session the message doesn't resume, or a gate). */
  async turn(conversationId: string, state: { pathway?: PathwaySession; profile?: { locale?: Lang } }, text: string): Promise<EngineTurn | undefined> {
    const s = state.pathway;
    if (!s || s.stage === 'closed') {
      const hit = this.registry.match(text);
      return hit ? this.start(conversationId, state, hit.id, { lang: state.profile?.locale ?? 'en' }) : undefined;
    }
    const pathway = this.registry.pathway(s.id);
    if (!pathway) {
      s.stage = 'closed';
      return undefined;
    }
    s.turn++;
    // The family's language: the profile's when there is one, else Spanish once they write it.
    if (state.profile?.locale) s.lang = state.profile.locale;
    else if (s.lang === 'en' && detectLocale(text) === 'es') s.lang = 'es';
    const R = this.r(s);
    const rec = FamilyRecord.fromJSON(s.record);
    const t = fold(text.trim());

    // 1. Gates. A person in danger or upset gets the normal agent, not the next question.
    const gate = regexGate(text);
    if (gate === 'crisis' || gate === 'distress') return this.pause(s);
    if (gate === 'reset') return this.close(s, 'abandoned');
    if (gate === 'person') {
      this.close(s, 'handoff');
      return { text: R.handoff, phase: 'done' };
    }
    if (gate === 'stop' && s.stage !== 'attesting') {
      this.pause(s);
      return { text: R.paused, phase: 'idle' };
    }

    // Jev runs beside extraction; only consulted when the words alone don't settle it.
    const second = this.secondGate(text, s, pathway);

    switch (s.stage) {
      case 'attesting':
        return this.attestTurn(conversationId, s, pathway, rec, text);
      case 'offered_next': {
        if (this.isYes(text) || RESUME.test(t)) {
          const next = (s.offered ?? []).find((id) => this.registry.pathway(id));
          if (next) return this.start(conversationId, state, next, { seed: rec, lang: s.lang });
        }
        s.stage = 'closed';
        return undefined;
      }
      case 'paused': {
        // While paused the normal agent has the conversation, so a bare "yes" or "4" is its
        // answer, not ours. Only "continue" or a fact the message names brings the session
        // back (or a plain answer after "I don't know", which is what we asked them to send).
        const ex = this.extract(text, s, pathway, rec, s.pauseReason === 'dont_know');
        if (RESUME.test(t) || ex.facts.length) {
          s.pauseReason = undefined;
          s.stage = s.pausedFrom ?? 'asking';
          s.pausedFrom = undefined;
          if (!ex.facts.length) return this.resume(conversationId, s, pathway, rec);
          break; // carry on below with this message
        }
        return undefined;
      }
      case 'handoff_offered': {
        if (this.isYes(text)) {
          this.close(s, 'handoff');
          return { text: R.handoff, phase: 'done' };
        }
        if (this.isNo(text)) {
          s.stage = 'asking';
          for (const k of s.lastAsked) s.asked[k] = 1;
          return this.advance(conversationId, s, pathway, rec);
        }
        s.stage = 'asking';
        break;
      }
      case 'proposed': {
        if (this.isYes(text)) {
          const d = jevEnabled(this.env) && !s.proposal?.confirmAsked ? await this.readYes(s, text) : undefined;
          if (d && vetoesYes(d, this.env)) {
            s.proposal!.confirmAsked = true;
            return { text: R.confirmOnce, phase: 'confirming' };
          }
          return this.approve(conversationId, s, pathway, rec, 'clear yes');
        }
        if (this.isNo(text)) {
          s.proposal = undefined;
          this.pause(s, 'asking');
          return { text: R.declined, phase: 'idle' };
        }
        break;
      }
    }

    // 2. Extraction.
    const ex = this.extract(text, s, pathway, rec);
    if (!ex.facts.length && this.opts.extractor) {
      const slots = this.slots(pathway, rec, s);
      try {
        const found = await this.opts.extractor.extract({
          text,
          lang: s.lang,
          slots: slots.map((x) => ({ key: x.key, kind: x.spec.kind, ask: x.spec.ask[s.lang], options: x.spec.options })),
          asked: s.lastAsked,
        });
        ex.facts.push(...acceptModelFacts(text, found, slots));
      } catch {
        // A model that fails reads nothing; we ask again.
      }
    }
    const changes = this.apply(conversationId, s, pathway, rec, text, ex);

    if (!ex.facts.length) {
      const g = await second;
      if (g === 'crisis' || g === 'distress') return this.pause(s);
      if (g === 'person') {
        this.close(s, 'handoff');
        return { text: R.handoff, phase: 'done' };
      }
      return this.nothingRead(conversationId, s, pathway, rec, text, ex, g);
    }

    const prefix = changes.length ? R.corrected(changes) : undefined;
    return this.advance(conversationId, s, pathway, rec, prefix);
  }

  // ── reading the message ────────────────────────────────────────────────────

  private extract(text: string, s: PathwaySession, pathway: Pathway, rec: FamilyRecord, bare = true): Extraction {
    const hints = this.registry.hints(pathway.id);
    return extractFacts(text, {
      lang: s.lang,
      slots: this.slots(pathway, rec, s),
      asked: s.stage === 'proposed' || !bare ? [] : s.lastAsked,
      recent: s.recent,
      cueFor: (key) => hintFor(hints.cues, key),
    });
  }

  /** Record what the parent said, each with this turn and their words. Returns corrections. */
  private apply(conversationId: string, s: PathwaySession, pathway: Pathway, rec: FamilyRecord, _text: string, ex: Extraction) {
    const changes: Array<{ label: string; from: string; to: string }> = [];
    const ref = `${conversationId}#${s.turn}`;
    const kept: typeof ex.facts = [];
    for (const f of ex.facts) {
      const spec = specFor(pathway.facts, f.key);
      if (!spec || !spec.sources.includes('parent')) continue;
      const prev = rec.get(f.key);
      if (prev && same(prev.value, f.value)) continue;
      rec.set(f.key, f.value, { kind: 'parent', ref, quote: f.quote }, this.now().toISOString());
      kept.push(f);
      s.recent = [f.key, ...s.recent.filter((k) => k !== f.key)].slice(0, 20);
      if (prev && !same(prev.value, f.value)) {
        changes.push({ label: this.factLabel(pathway, rec, f.key, s.lang), from: this.show(prev.value, s.lang), to: this.show(f.value, s.lang) });
      }
    }
    // A value we already had isn't news: only what changed counts as read.
    ex.facts = kept;
    s.record = rec.toJSON();
    return changes;
  }

  /** The message gave us nothing we could record. */
  private async nothingRead(conversationId: string, s: PathwaySession, pathway: Pathway, rec: FamilyRecord, text: string, ex: Extraction, g: GateLabel | undefined): Promise<EngineTurn | undefined> {
    const R = this.r(s);
    const hints = this.registry.hints(pathway.id);
    if (s.stage === 'proposed' && s.proposal) {
      if (ex.question && !ex.whyAsked) return this.pause(s);
      const d = await this.readYes(s, text);
      if (d && approvesYes(d)) return this.approve(conversationId, s, pathway, rec, `read as yes (${d.confidence.toFixed(2)})`);
      if (d && probablyYes(d) && !s.proposal.confirmAsked) {
        s.proposal.confirmAsked = true;
        return { text: R.confirmOnce, phase: 'confirming' };
      }
      s.proposal.unclear = (s.proposal.unclear ?? 0) + 1;
      if (s.proposal.unclear > 2) return this.offerHandoff(s);
      return { text: R.proposalUnclear, phase: 'confirming' };
    }
    const asked = s.lastAsked.map((k) => ({ key: k, spec: specFor(pathway.facts, k) })).filter((x): x is { key: string; spec: FactSpec } => Boolean(x.spec));
    if (!asked.length) return this.advance(conversationId, s, pathway, rec);
    const askText = this.askText(s, pathway, asked);
    if (ex.whyAsked && asked.length) {
      const why = asked.map((a) => hintFor(hints.why, a.key)?.[s.lang]).find(Boolean);
      return { text: R.why(why, askText), phase: 'clarifying' };
    }
    if (ex.declined && asked.length) {
      if (asked.some((a) => isRequired(a.spec, rec))) {
        s.stage = 'handoff_offered';
        return { text: R.declinedRequired, phase: 'clarifying' };
      }
      s.skipped.push(...asked.map((a) => a.key));
      return this.advance(conversationId, s, pathway, rec, R.skipped);
    }
    if (ex.dontKnow) {
      this.pause(s, 'asking');
      s.pauseReason = 'dont_know';
      return { text: R.dontKnow, phase: 'idle' };
    }
    if (g === 'off_topic' || g === 'stop' || ex.question) return this.pause(s);
    // Not an answer we can read: ask again (counted), or offer a person.
    return this.ask(s, pathway, rec, asked.map((a) => a.key), R.didntCatch.bind(R));
  }

  private async secondGate(text: string, s: PathwaySession, pathway: Pathway): Promise<GateLabel | undefined> {
    const asked = s.lastAsked.map((k) => specFor(pathway.facts, k)?.ask.en).filter(Boolean).join(' ') || 'whether to send the form as shown';
    const fn = this.opts.gate ?? (jevEnabled(this.env) ? (t: string, a: string) => jevGate(t, a, this.env) : undefined);
    if (!fn) return undefined;
    try {
      const g = await fn(text, asked);
      if (!g || g.label === 'answer') return undefined;
      if (g.label === 'crisis' && g.confidence >= 0.5) return 'crisis';
      return g.confidence >= 0.9 ? g.label : undefined;
    } catch {
      return undefined;
    }
  }

  private async readYes(s: PathwaySession, text: string): Promise<Decision<'approve' | 'not_approve'> | undefined> {
    const asked = 'We asked the parent: want me to send the form, exactly as shown?';
    if (this.opts.readYes) return this.opts.readYes(asked, text);
    if (!jevEnabled(this.env)) return undefined;
    return decide('yes_to_exact_values', yesQuestion(asked, text), { env: this.env });
  }

  // ── what's missing, and what to ask ────────────────────────────────────────

  /** The record with only facts the pathway accepts from their source. Everything the form or
   * the precheck sees comes from here: a fact from a source the spec doesn't allow doesn't count. */
  private usable(pathway: Pathway, rec: FamilyRecord): FamilyRecord {
    const out = new FamilyRecord(rec.state);
    const data = rec.toJSON();
    const facts = data.facts.filter(([k, f]) => {
      const spec = specFor(pathway.facts, k);
      return spec && spec.sources.includes(f.source.kind);
    });
    return FamilyRecord.fromJSON({ state: out.state, facts });
  }

  private asOf(): string {
    return this.now().toISOString().slice(0, 10);
  }

  /** Required facts still missing, in the form's order, as concrete keys. */
  private needs(pathway: Pathway, rec: FamilyRecord, s: PathwaySession): { askable: Slot[]; blocked: FactKey[]; fill: FormFill } {
    const use = this.usable(pathway, rec);
    const fill = pathway.form.fill(use, this.asOf());
    const keys: FactKey[] = [];
    for (const spec of pathway.facts) {
      if (hasPlaceholder(spec.key) || !isRequired(spec, use)) continue;
      if (!use.has(spec.key)) keys.push(spec.key);
    }
    for (const k of fill.missing) keys.push(k);
    const order = (k: FactKey) => {
      const spec = specFor(pathway.facts, k);
      return spec ? pathway.facts.indexOf(spec) : pathway.facts.length;
    };
    const seen = new Set<string>();
    const askable: Slot[] = [];
    const blocked: FactKey[] = [];
    const ids = new Map<string, string>();
    for (const raw of [...new Set(keys)].sort((a, b) => order(a) - order(b))) {
      const spec = specFor(pathway.facts, raw);
      const key = hasPlaceholder(raw) ? this.instantiate(raw, use, ids) : raw;
      if (seen.has(key) || s.skipped.includes(key)) continue;
      seen.add(key);
      if (spec && spec.sources.includes('parent')) askable.push({ key, spec });
      else blocked.push(key);
    }
    return { askable, blocked, fill };
  }

  /** A pattern key the form reports missing ("member.<m>.dob") → the next new instance. */
  private instantiate(pattern: FactKey, rec: FamilyRecord, ids: Map<string, string>): FactKey {
    return pattern.replace(/(income\.)?<([^>.]+)>/g, (_m, income: string | undefined, name: string) => {
      const tag = `${income ? 'income' : 'member'}:${name}`;
      let id = ids.get(tag);
      if (!id) {
        if (income) {
          const used = rec.incomeIndexes();
          id = String(used.length ? Math.max(...used) + 1 : 0);
        } else {
          const used = new Set(rec.memberIds());
          let k = used.size + 1;
          while (used.has(`m${k}`)) k++;
          id = `m${k}`;
        }
        ids.set(tag, id);
      }
      return `${income ?? ''}${id}`;
    });
  }

  /** Everything extraction may set: what's missing, what was asked, and what's already known. */
  private slots(pathway: Pathway, rec: FamilyRecord, s: PathwaySession): Slot[] {
    const out = new Map<FactKey, Slot>();
    for (const x of this.needs(pathway, rec, s).askable) out.set(x.key, x);
    for (const k of [...s.lastAsked, ...rec.keys()]) {
      const spec = specFor(pathway.facts, k);
      if (spec && !out.has(k)) out.set(k, { key: k, spec });
    }
    return [...out.values()];
  }

  /**
   * Which question saves the most questions. For each candidate: one question now, plus the
   * questions expected after its answer. A short-circuit answer (CalFresh: yes → already
   * covered) ends it; a yes/no or a choice that changes what's required is tried both ways on
   * a copy of the record; anything else leaves the rest as it is. Ties keep the form's order.
   */
  private chooseNext(pathway: Pathway, rec: FamilyRecord, s: PathwaySession, askable: Slot[]): Slot {
    const hints = this.registry.hints(pathway.id);
    const m = askable.length;
    let best = askable[0]!;
    let bestCost = Infinity;
    for (const slot of askable) {
      let expected = m - 1;
      const sc = hintFor(hints.shortCircuit, slot.key);
      if (sc) {
        expected = (1 - (sc.prior ?? 0.3)) * (m - 1);
      } else if (slot.spec.kind === 'boolean' || (slot.spec.kind === 'enum' && (slot.spec.options?.length ?? 0) <= 6)) {
        const outcomes: unknown[] = slot.spec.kind === 'boolean' ? [true, false] : slot.spec.options!;
        expected = 0;
        for (const o of outcomes) {
          const sim = FamilyRecord.fromJSON(rec.toJSON());
          sim.set(slot.key, o, { kind: 'parent', ref: 'simulated', quote: 'simulated' });
          expected += this.needs(pathway, sim, s).askable.length / outcomes.length;
        }
      }
      const cost = 1 + expected;
      if (cost < bestCost - 1e-9) {
        best = slot;
        bestCost = cost;
      }
    }
    return best;
  }

  /** The facts asked with this one: a pathway's group, or the same person's plain facts. */
  private group(pathway: Pathway, first: Slot, askable: Slot[]): Slot[] {
    const hints = this.registry.hints(pathway.id);
    const inst = (k: FactKey) => /^(member|income)\.[^.]+/.exec(k)?.[0] ?? '';
    const g = hints.groups?.find((gr) => gr.keys.some((k) => matchKey(k, first.key)));
    if (g) return askable.filter((x) => (x === first || g.keys.some((k) => matchKey(k, x.key))) && inst(x.key) === inst(first.key));
    const groupable = (x: Slot) => !x.spec.sensitive && ['string', 'date', 'number'].includes(x.spec.kind);
    if (!inst(first.key) || !groupable(first)) return [first];
    return [first, ...askable.filter((x) => x !== first && inst(x.key) === inst(first.key) && groupable(x))].slice(0, 3);
  }

  private askText(s: PathwaySession, pathway: Pathway, slots: Array<{ key: FactKey; spec: FactSpec }>): string {
    const hints = this.registry.hints(pathway.id);
    if (!slots.length) return '';
    const g = slots.length > 1 ? hints.groups?.find((gr) => slots.every((x) => gr.keys.some((k) => matchKey(k, x.key)))) : undefined;
    const base = g?.ask?.[s.lang] ?? slots.map((x) => x.spec.ask[s.lang]).join(' ');
    const sensitive = slots.find((x) => x.spec.sensitive);
    if (!sensitive) return base;
    const rec = FamilyRecord.fromJSON(s.record);
    return this.r(s).sensitive(base, hintFor(hints.why, sensitive.key)?.[s.lang], !isRequired(sensitive.spec, rec));
  }

  /** Ask these facts, counting. The third time, offer a person instead. */
  private ask(s: PathwaySession, pathway: Pathway, rec: FamilyRecord, keys: FactKey[], wrap?: (q: string) => string, prefix?: string): EngineTurn {
    if (!keys.length) return this.offerHandoff(s);
    if (keys.some((k) => (s.asked[k] ?? 0) >= 2)) return this.offerHandoff(s);
    const slots = keys.map((k) => ({ key: k, spec: specFor(pathway.facts, k)! }));
    for (const k of keys) {
      if ((s.asked[k] ?? 0) >= 1) s.repeatedQuestions++;
      s.asked[k] = (s.asked[k] ?? 0) + 1;
    }
    s.lastAsked = keys;
    s.stage = 'asking';
    s.record = rec.toJSON();
    const q = this.askText(s, pathway, slots);
    const text = wrap ? wrap(q) : q;
    return { text: prefix ? `${prefix}\n\n${text}` : text, phase: 'clarifying' };
  }

  private offerHandoff(s: PathwaySession): EngineTurn {
    s.stage = 'handoff_offered';
    return { text: this.r(s).handoffOffer, phase: 'clarifying' };
  }

  // ── moving the task forward ────────────────────────────────────────────────

  private async advance(conversationId: string, s: PathwaySession, pathway: Pathway, rec: FamilyRecord, prefix?: string): Promise<EngineTurn> {
    const R = this.r(s);
    const hints = this.registry.hints(pathway.id);
    s.record = rec.toJSON();
    const with_ = (t: EngineTurn): EngineTurn => (prefix ? { ...t, text: `${prefix}\n\n${t.text}` } : t);

    // Precheck as soon as its facts are in (or a short-circuit answer was just given).
    if (pathway.precheck && !s.precheckRan) {
      const use = this.usable(pathway, rec);
      const factsIn = hints.precheckFacts?.length ? hints.precheckFacts.every((k) => (hasPlaceholder(k) ? use.keys().some((x) => patternRe(k).test(x)) : use.has(k))) : false;
      const shortCircuited = Object.entries(hints.shortCircuit ?? {}).some(([k, sc]) =>
        use.keys().some((x) => (hasPlaceholder(k) ? patternRe(k).test(x) : x === k) && sc.when(use.get(x)!.value)),
      );
      if (factsIn || shortCircuited) {
        const done = await this.precheck(s, pathway, use, factsIn);
        if (done) return with_(done);
      }
    }

    const { askable, blocked, fill } = this.needs(pathway, rec, s);
    if (askable.length) {
      const first = this.chooseNext(pathway, rec, s, askable);
      const keys = this.group(pathway, first, askable).map((x) => x.key);
      return this.ask(s, pathway, rec, keys, undefined, prefix);
    }
    if (blocked.length || fill.missing.length) {
      const labels = [...new Set([...blocked, ...fill.missing])].map((k) => humanize(k));
      this.close(s, 'handoff');
      return with_({ text: R.cantAsk(labels), phase: 'done' });
    }
    if (pathway.precheck && !s.precheckRan) {
      const done = await this.precheck(s, pathway, this.usable(pathway, rec), true);
      if (done) return with_(done);
    }
    return this.propose(s, pathway, rec, prefix);
  }

  /** Ask the archive (through the pathway) whether there is anything to file. An archive that
   * can't answer is "undetermined": we carry on and file. */
  private async precheck(s: PathwaySession, pathway: Pathway, use: FamilyRecord, final: boolean): Promise<EngineTurn | undefined> {
    let res: Awaited<ReturnType<NonNullable<Pathway['precheck']>>>;
    try {
      res = await pathway.precheck!(use, (this.opts.archive ?? sharedArchive)(), this.asOf());
    } catch (e) {
      console.warn(`[pathway] precheck ${pathway.id} undetermined: ${(e as Error)?.message ?? e}`);
      if (final) s.precheckRan = true;
      return undefined;
    }
    if (res.determination) s.determination = res.determination;
    if (res.file) {
      if (final) s.precheckRan = true;
      return undefined;
    }
    s.precheckRan = true;
    s.outcome = 'already_covered';
    s.proposal = undefined;
    return this.finish(s, pathway, this.r(s).covered(res.why[s.lang]));
  }

  private label(pathway: Pathway, id: string, lang: Lang): string {
    const hints = this.registry.hints(pathway.id);
    const fromForm = (pathway.form as unknown as { labels?: Record<string, Partial<Record<Lang, string>>> }).labels?.[id]?.[lang];
    const l = hints.labels?.[id]?.[lang] ?? fromForm ?? humanize(id);
    return l ? l[0]!.toUpperCase() + l.slice(1) : id;
  }

  /** A fact by the label of the field it fills ("monthly income"), else by its key. */
  private factLabel(pathway: Pathway, rec: FamilyRecord, key: FactKey, lang: Lang): string {
    const fill = pathway.form.fill(this.usable(pathway, rec), this.asOf());
    const field = Object.entries(fill.sources).find(([, ks]) => ks.includes(key))?.[0];
    const l = field ? this.label(pathway, field, lang) : humanize(key);
    return /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(l) ? l[0]!.toLowerCase() + l.slice(1) : l;
  }

  private show(v: unknown, lang: Lang): string {
    const R = replies(lang);
    if (v === true) return R.yes;
    if (v === false) return R.no;
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'number') return v.toLocaleString('en-US');
    return String(v);
  }

  /** The fill the form would carry now, with attestations kept out of it whatever the map says. */
  private buildFill(pathway: Pathway, rec: FamilyRecord): FormFill {
    const fill = pathway.form.fill(this.usable(pathway, rec), this.asOf());
    const att = new Set(fill.attestations);
    const values: Record<string, FieldValue> = {};
    // The form's own order (the digest sorts keys itself, so order never changes the binding).
    for (const k of Object.keys(fill.values)) {
      if (att.has(k)) {
        console.warn(`[pathway] ${pathway.form.id}: attestation ${k} was in the fill; dropped (the parent completes it)`);
        continue;
      }
      values[k] = fill.values[k]!;
    }
    return { ...fill, values };
  }

  /** The consent-gated step for this fill: every value, labelled, as the parent will see it. */
  private buildStep(pathway: Pathway, fill: FormFill, lang: Lang): Step {
    const fields: Record<string, string> = {};
    for (const [id, v] of Object.entries(fill.values)) {
      let label = this.label(pathway, id, lang);
      if (label in fields) label = `${label} (${id})`;
      fields[label] = this.show(v, lang);
    }
    const payload = { channel: 'form' as const, formId: pathway.form.id, fields, fill: fill.values, attestations: [...fill.attestations].sort() };
    return {
      id: `pathway-${pathway.id}`,
      caseId: `pathway:${pathway.id}`,
      intent: `pathway:${pathway.id}`,
      channel: 'form',
      counterparty: { role: 'DISTRICT', ...(pathway.district ? { name: pathway.district } : {}) },
      payload: payload as StepPayload,
      successCondition: { describe: pathway.confirmation.describe.en, kind: 'confirmation_parsed' },
      requiresConsent: true,
      status: 'awaiting_consent',
    };
  }

  private proposalText(s: PathwaySession, pathway: Pathway, step: Step, fill: FormFill): string {
    const fields = (step.payload as { fields: Record<string, string> }).fields;
    const lines = Object.entries(fields).map(([k, v]) => `  - ${k}: ${v}`);
    return this.r(s).proposal(lines, fill.attestations.length > 0);
  }

  /** Show every value and bind the next yes to exactly them. */
  private propose(s: PathwaySession, pathway: Pathway, rec: FamilyRecord, prefix?: string, wrap?: (p: string) => string): EngineTurn {
    const fill = this.buildFill(pathway, rec);
    const step = this.buildStep(pathway, fill, s.lang);
    const before = s.proposal?.stamp.hash;
    let text = this.proposalText(s, pathway, step, fill);
    if (wrap) text = wrap(text);
    else if (before && !prefix) text = this.r(s).updated(text);
    if (prefix) text = `${prefix}\n\n${text}`;
    s.stage = 'proposed';
    s.lastAsked = [];
    // Fail closed: only a message that really shows every value arms the yes.
    if (!shownIn([text], [step])) {
      s.proposal = undefined;
      this.close(s, 'handoff');
      return { text: this.r(s).noLane, phase: 'done' };
    }
    s.proposal = { step, stamp: stampApproval([step], Date.now(), this.env), fill };
    return { text, phase: 'confirming' };
  }

  private async resume(conversationId: string, s: PathwaySession, pathway: Pathway, rec: FamilyRecord): Promise<EngineTurn> {
    const R = this.r(s);
    if (s.stage === 'proposed') return this.propose(s, pathway, rec, R.resume, (p) => p);
    if (s.stage === 'asking' && s.lastAsked.length && s.lastAsked.every((k) => !rec.has(k))) {
      // Asking again after a pause isn't a failed attempt; it isn't counted.
      const slots = s.lastAsked.map((k) => ({ key: k, spec: specFor(pathway.facts, k)! })).filter((x) => x.spec);
      return { text: `${R.resume}\n\n${this.askText(s, pathway, slots)}`, phase: 'clarifying' };
    }
    return this.advance(conversationId, s, pathway, rec, R.resume);
  }

  // ── the yes, the lane, the result ──────────────────────────────────────────

  private async approve(conversationId: string, s: PathwaySession, pathway: Pathway, rec: FamilyRecord, how: string): Promise<EngineTurn> {
    const R = this.r(s);
    if (!s.proposal) return this.propose(s, pathway, rec);
    const fill = this.buildFill(pathway, rec);
    const step = this.buildStep(pathway, fill, s.lang);
    const check = checkApproval([step], s.proposal.stamp, Date.now());
    if (!check.ok) {
      // Changed, expired or overtaken: nothing runs; show it again and ask.
      return this.propose(s, pathway, rec, undefined, (p) => (check.reason === 'changed' ? R.updated(p) : p));
    }
    const stamp = s.proposal.stamp;
    s.proposal = undefined;
    s.approved = fill;
    this.opts.logConsent?.(conversationId, {
      pathway: pathway.id,
      formId: pathway.form.id,
      ...consentRecord(step),
      approval: { proposal: stamp.hash, how, shownAt: new Date(stamp.shownAt).toISOString() },
    });
    const lane = this.registry.laneFor(pathway);
    if (!lane) {
      this.close(s, 'handoff');
      return { text: R.noLane, phase: 'done' };
    }
    s.lane = lane.kind;
    // The lane gets exactly the approved fill (a copy, so nothing it does changes our record).
    const approved: FormFill = JSON.parse(JSON.stringify(fill));
    const live: Live = { lane, result: undefined as unknown as Live['result'] };
    live.result = lane
      .run(pathway.form, approved, {
        lang: s.lang,
        attest: (fields: string[], how?: string) =>
          new Promise<void>((resolve, reject) => {
            live.attest = { fields, how, resolve, reject };
            live.signal?.();
          }),
      } as Parameters<LaneRunner['run']>[2])
      .then(
        (r) => ({ ok: true as const, r }),
        (e) => ({ ok: false as const, e }),
      );
    this.live.set(conversationId, live);
    return this.awaitLane(conversationId, s, pathway, live);
  }

  /** Wait for the lane to finish or to ask the parent for their signature. */
  private async awaitLane(conversationId: string, s: PathwaySession, pathway: Pathway, live: Live): Promise<EngineTurn> {
    const attestAsked = new Promise<'attest'>((res) => {
      live.signal = () => res('attest');
      if (live.attest) res('attest');
    });
    const first = await Promise.race([live.result, attestAsked]);
    live.signal = undefined;
    if (first === 'attest') {
      const a = live.attest!;
      s.stage = 'attesting';
      s.attesting = { fields: a.fields, how: a.how, asked: 1 };
      return { text: this.r(s).attest(a.fields.map((f) => this.label(pathway, f, s.lang)), a.how), phase: 'confirming' };
    }
    this.live.delete(conversationId);
    return this.report(s, pathway, first);
  }

  private async attestTurn(conversationId: string, s: PathwaySession, pathway: Pathway, rec: FamilyRecord, text: string): Promise<EngineTurn> {
    const R = this.r(s);
    const live = this.live.get(conversationId);
    if (!live?.attest) {
      // The run didn't survive (a restart): nothing is confirmed, and it needs a fresh yes.
      this.live.delete(conversationId);
      s.attesting = undefined;
      return this.propose(s, pathway, rec, undefined, (p) => R.interrupted(p));
    }
    const t = fold(text.trim());
    if (this.isNo(text) || /^(no|i won'?t|i will not|no voy a|no quiero)\b/.test(t)) {
      const a = live.attest;
      live.attest = undefined;
      a.reject(new Error('the parent did not attest'));
      const res = await live.result;
      this.live.delete(conversationId);
      s.attesting = undefined;
      if (res.ok && (res.r.status === 'done' || res.r.status === 'sent_unconfirmed')) return this.report(s, pathway, res);
      s.result = res.ok ? res.r : undefined;
      this.close(s, 'abandoned');
      return { text: R.attestDeclined, phase: 'done' };
    }
    if (ATTESTED.test(t) || this.isYes(text)) {
      // The parent says they did it. The lane checks it on its side (the replica records who
      // attested); we only pass their word on.
      const a = live.attest;
      live.attest = undefined;
      s.attesting = undefined;
      a.resolve();
      return this.awaitLane(conversationId, s, pathway, live);
    }
    s.attesting = { ...s.attesting!, asked: (s.attesting?.asked ?? 1) + 1 };
    if (s.attesting.asked > 3) return this.offerHandoff(s);
    return { text: R.attestAgain, phase: 'confirming' };
  }

  /** Say what happened, honestly: done only with a confirmation, and only when what the form
   * holds is what the parent approved. */
  private report(s: PathwaySession, pathway: Pathway, res: { ok: true; r: LaneResult } | { ok: false; e: unknown }): EngineTurn {
    const R = this.r(s);
    s.attesting = undefined;
    if (!res.ok) {
      console.warn(`[pathway] lane ${s.lane} failed: ${(res.e as Error)?.message ?? res.e}`);
      s.outcome = 'failed';
      this.close(s, 'failed');
      return { text: R.failed(''), phase: 'done' };
    }
    const r = res.r;
    s.result = r;
    const summary = r.parentSummary?.[s.lang] ?? '';
    const approved = s.approved?.values ?? {};
    const mismatched = Object.keys(approved).filter((k) => k in r.readBack && String(r.readBack[k]) !== String(approved[k]));
    const confirmed =
      r.status === 'done' && Boolean(r.reference) && (!pathway.confirmation.pattern || pathway.confirmation.pattern.test(r.reference!));
    let text: string;
    if (mismatched.length && (r.status === 'done' || r.status === 'sent_unconfirmed')) {
      s.outcome = 'sent_unconfirmed';
      text = R.mismatch(mismatched.map((k) => this.label(pathway, k, s.lang)), summary);
    } else if (confirmed) {
      s.outcome = 'done_confirmed';
      text = R.done(summary, r.reference!);
    } else if (r.status === 'done' || r.status === 'sent_unconfirmed') {
      s.outcome = 'sent_unconfirmed';
      text = R.unconfirmed(summary);
    } else if (r.status === 'handoff') {
      s.outcome = 'handoff';
      this.close(s, 'handoff');
      return { text: R.laneHandoff(summary), phase: 'done' };
    } else {
      s.outcome = 'failed';
      this.close(s, 'failed');
      return { text: R.failed(summary), phase: 'done', resolved: false };
    }
    return { ...this.finish(s, pathway, text), resolved: s.outcome === 'done_confirmed' };
  }

  /** End the job and offer what it opens next. */
  private finish(s: PathwaySession, pathway: Pathway, text: string): EngineTurn {
    const offers = pathway.opensNext.filter((id) => id !== pathway.id);
    if (!offers.length) {
      s.stage = 'closed';
      return { text, phase: 'done' };
    }
    s.offered = offers;
    s.stage = 'offered_next';
    const titles = offers.map((id) => this.registry.pathway(id)?.title[s.lang] ?? humanize(id));
    return { text: `${text}\n\n${this.r(s).next(titles)}`, phase: 'done' };
  }

  // ── small helpers ──────────────────────────────────────────────────────────

  private pause(s: PathwaySession, from: PathwayStage = s.stage): undefined {
    if (s.stage !== 'paused') s.pausedFrom = from;
    s.stage = 'paused';
    s.pauseReason = undefined;
    // A yes to a proposal from before the pause would answer something else: it re-shows.
    if (s.proposal) s.proposal.stamp.stale = true;
    return undefined;
  }

  private close(s: PathwaySession, outcome: PathwayOutcome): undefined {
    s.stage = 'closed';
    s.outcome ??= outcome;
    s.proposal = undefined;
    return undefined;
  }

  private r(s: PathwaySession): Replies {
    return replies(s.lang);
  }

  private isYes(text: string): boolean {
    return (this.opts.isYes ?? ((t: string) => DEFAULT_YES.test(strip(t))))(text);
  }

  private isNo(text: string): boolean {
    return (this.opts.isNo ?? ((t: string) => DEFAULT_NO.test(strip(t))))(text);
  }
}

/** Jev as the second gate. `decide` has no pathway decision type yet (see the report), so the
 * thresholds are applied here: crisis at 0.5 (safety first), the rest at 0.9. */
export async function jevGate(text: string, asked: string, env: NodeJS.ProcessEnv = process.env): Promise<{ label: GateLabel | 'answer'; confidence: number } | undefined> {
  const d = await decide(
    'pathway_gate' as unknown as DecisionType,
    {
      state: { we_asked: asked, parent_reply: text },
      instructions: 'We are helping a parent fill out a school form by text and just asked them `we_asked`. What is `parent_reply`?',
      criteria: {
        answer: 'An answer to the question, or anything about the form: a correction, a question about the form, yes or no.',
        crisis: 'Someone may be in danger or at risk of harm, or the parent is in crisis.',
        distress: 'The parent is upset, overwhelmed or struggling, and is not answering.',
        person: 'The parent asks to talk to a person.',
        off_topic: 'Something unrelated to this form.',
      },
    },
    { env },
  );
  if (d.answer === 'unsure') return undefined;
  return { label: d.answer as GateLabel | 'answer', confidence: d.confidence };
}

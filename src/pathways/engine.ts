import { detectLocale, explicitLocaleChoice } from '../lib/bilingual.js';
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
import { acceptModelFacts, extractFacts, fold, lexiconCue, type Extraction, type Found, type ModelExtractor, type Slot } from './extract.js';
import {
  SELF,
  isQuestion,
  parseAddress,
  parseFlag,
  parseIncomes,
  parsePersonName,
  parseRoster,
  sentences,
  splitName,
  relWord,
  parseRel,
  type MemberRef,
  type Rel,
} from './household.js';
import { pathways as defaultRegistry, type FaqEntry, type PathwayHints, type PathwayRegistry } from './registry.js';
import { replies, type Replies } from './reply.js';
import type { Understander, Understanding, UnderstandInput } from './understand.js';
import type { AttestHow, FactSpec, FieldValue, FormFill, Lang, LaneKind, LaneResult, LaneRunner, Pathway, Text } from './types.js';

/**
 * The pathway engine: one turn of a parent working through one pathway (docs/PATHWAYS.md §3).
 *
 * Code owns the task. Per turn:
 *  1. Gates: crisis, distress, "talk to a person", stop, off-topic → hand the turn back to the
 *     normal agent (the session pauses or ends). Regex always; Jev too when it is configured.
 *  2. Extraction: the parent's words → facts, each with the turn and the quote as its source
 *     (extract.ts, household.ts). A question is never a fact; a fact from the district changes
 *     only on an explicit correction; a correction replaces the fact and is said back.
 *  3. Next question: in "people" mode (the income forms) a fixed, natural order: benefits (a yes
 *     can end the form), the parent's name, who lives at home, each adult's income, each
 *     child's status, the address. Otherwise the missing required fact that saves the most
 *     questions. Related facts together; an unreadable answer is asked again with an example;
 *     "what do you mean?" is said another way; never the same question a third time after two
 *     unreadable answers (a person is offered instead).
 *  4. Side questions about the form ("does this affect my immigration status?", "do I have to?")
 *     are answered in place, and the form question is asked again; the first message of a
 *     session says what the form is and why.
 *  5. Precheck: once its facts are in, the archive says whether there's anything to file.
 *  6. Proposal: every value the form will carry, in the family's language and in words the
 *     parent can check (a school's name, not its code), bound to the parent's yes by the same
 *     digest the agent's consent gate uses (steps/approval.ts). On a yes the lane runs exactly
 *     that fill; attestations go back to the parent.
 *  7. Replies from templates (reply.ts).
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
  /** The last question's words, to ask it again exactly. */
  lastAskText?: string;
  /** The same, before the gentle wrapping a personal question gets. */
  lastAskBase?: string;
  /** Facts set by the parent, newest first. */
  recent: FactKey[];
  /** Optional facts the parent chose to skip. */
  skipped: FactKey[];
  /** A question asked again (the harness's repeatedQuestions). */
  repeatedQuestions: number;
  /** The parent has seen what the form is and why (the first message says it). */
  introduced?: boolean;
  /** "What do you mean?" per question: said another way, up to twice. */
  confused?: Record<string, number>;
  precheckRan?: boolean;
  determination?: Determination;
  /** The staged proposal: the Step the parent was shown and its stamp. */
  proposal?: { step: Step; stamp: ApprovalStamp; fill: FormFill; confirmAsked?: boolean; unclear?: number };
  /** The fill the parent approved (what the lane got). */
  approved?: FormFill;
  attesting?: { fields: string[]; how?: string; asked: number };
  offered?: string[];
  pausedFrom?: PathwayStage;
  /** "dont_know": the parent will text the answer later, so a plain answer resumes. "crisis":
   * a person in danger or upset; only "continue" brings the form back. "side": a question
   * about something else, handed to the normal agent. */
  pauseReason?: 'dont_know' | 'crisis' | 'side';
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
  /** Reads each message with a small model (understand.ts). Without it, or when it fails or
   * times out, the deterministic readers are the whole reading. */
  understander?: Understander;
  /** How long to wait for it before reading deterministically. Default 6 s. */
  understandTimeoutMs?: number;
}

// ── gates ────────────────────────────────────────────────────────────────────

const CRISIS = /\b(suicid\w*|kill (myself|me)|end my life|want to die|wanna die|hurt (myself|me)|self[- ]harm|not safe (at home|here)|he hits|she hits|hits me|beats me|abus\w+|overdos\w*|me quiero morir|quiero morir(me)?|matarme|suicidarme|hacerme dano|no estoy a salvo|me pega|me golpea|violencia|abuso)\b/;
const DISTRESS = /\b(overwhelmed|can'?t do this|can'?t take (it|this)|i'?m crying|so stressed|falling apart|i give up|desperate|panic\w*|no puedo mas|estoy llorando|agobiad[oa]|desesperad[oa]|estresad[oa]|ya no aguanto)\b/;
const PERSON = /\b((talk|talking|speak|speaking|chat) (to|with) (a |an |some |a real )?(person|human|someone|somebody|agent|people)|real person|a human|connect me (to|with)|conect(a|e)me|comunic(a|e)me con|hablar con (una persona|alguien|un humano|una persona real)|quiero (una persona|un humano))\b/;
/** A yes to "want me to connect you with a person?", however it starts. */
const AFFIRM = /^(y|yes|yeah|yep|yup|sure|ok|okay|k|please|si|claro|dale|ándale|andale|bueno|esta bien|go ahead|connect|conect\w*|do it|that'?d help|that would help)\b/;
const NEGATE = /^(no|nope|nah|not now|no gracias|no thanks)\b/;
const STOP = /^(stop|not now|later|pause|let me think|i'?ll do it later|ahorita no|despues|luego|mas tarde|ahora no)\b[\s.!]*$/;
const RESUME = /^(continue|let'?s continue|go on|keep going|resume|let'?s (do|finish) (it|this)|let'?s go|ok let'?s (do|finish) (it|this)|sigamos|seguir|continuar|continuemos|seguimos|vamos|terminemos)\b/;
const RESET = /^(\/reset|reset|start over|fresh start|start again)\b/;
const ATTESTED = /^(done|signed|i signed( it)?|i did( it)?|did it|ok|okay|yes|yep|all set|finished|listo|ya|ya firme|firme|firmado|hecho|lo hice|ya lo hice|si)\b|\b(i (just |have |already )?signed|signed (it|the)|i checked the box|ya (lo )?firme|lo firme|ya esta firmad[oa])\b/;
/** "I'm not sure what you mean": the question, not the answer, was the problem. */
const CONFUSED = /\b(not sure what you mean|what do you mean|i don'?t understand|don'?t get (it|what)|confus\w+|no entiendo|no le entiendo|no te entiendo|que quiere decir|que quieres decir|que significa|no se a que se refiere)\b/;
/** "What exactly are you going to put on the form?": show the proposal again. */
const SHOW_ME = /\b(what (exactly )?(are you|will you|is it|is going) (going to )?(put|send|say|write)|show me|i want to see|let me see|can i see|que va a poner|que va a enviar|quiero ver(lo)?|muestreme|ensename|enseneme)\b/;
/** "That's wrong", on a proposal. */
const WRONG = /\b(wrong|not right|incorrect|mistake|esta mal|no esta bien|incorrecto|equivocad[oa])\b/;
/** "So can you help me fill out the form?": they want to get on with it. */
const FORM_HELP = /\b(help|ayud\w*)\b.*\b(form|formulario|fill|llenar|it|lo|la)\b|\b(fill (it|this|the form) out|fill out the form|llenar(lo|la)? (el|este) formulario|llenarlo)\b|^(can you help|me ayuda)\b/;

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

/** A whole message that only says yes to sending ("yes, send it", "sí, mándalo", "sí, está
 * bien"): every word is a yes word and at least one is a plain yes. Anything else (a "but", a
 * value, a question) is not a clear yes. */
const YES_CORE = new Set(['yes', 'yeah', 'yep', 'yup', 'sure', 'ok', 'okay', 'si', 'dale', 'claro', 'andale', 'correct', 'correcto', 'ahead', 'adelante']);
const YES_WORDS = new Set([
  ...YES_CORE, 'please', 'go', 'ahead', 'send', 'it', 'submit', 'file', 'do', 'sounds', 'looks', 'good', 'great', 'perfect', 'thats', 'right', 'fine', 'all',
  'thanks', 'thank', 'you', 'por', 'favor', 'mandalo', 'envialo', 'esta', 'bien', 'perfecto', 'adelante', 'de', 'acuerdo', 'gracias', 'todo', 'hazlo', 'that', 'is',
  // "Yeah that all looks right to me, send it", "yes send it i already said it looks good".
  'to', 'me', 'everything', 'everythings', 'as', 'shown', 'its', 'just', 'now', 'i', 'already', 'said', 'mandale', 'manda', 'ya', 'correcto', 'listo', 'ahora', 'awesome',
]);
export function clearYes(text: string): boolean {
  const words = fold(text).replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 12) return false;
  return words.every((w) => YES_WORDS.has(w)) && words.some((w) => YES_CORE.has(w));
}

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

/** Facts the people mode reads with its own parsers (household.ts), not the generic extractor. */
const PEOPLE_KEY = /^(member\.[^.]+\.(first_name|last_name|middle_initial|relationship|age|has_income|income_done|foster|homeless|migrant)|income\..+|household\.(roster|incomes_complete|income_reported)|contact\.(street|city|state|zip|signer))$/;
const FLAGS = ['foster', 'homeless', 'migrant'] as const;
const FLAG_WORDS: Record<string, RegExp> = {
  foster: /\b(foster|crianza|hogar temporal|tutela)\b/,
  homeless: /\b(homeless|shelter|motel|car|steady|sin hogar|refugio|albergue|carro|hogar fijo)\b/,
  migrant: /\b(migrant|migrante|farm|campo|agricola|pesca|fishing)\b/,
};
type Flag = (typeof FLAGS)[number];

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
  // "Watsonville" and "watsonville" are the same answer, not a correction.
  if (typeof a === 'string' && typeof b === 'string') return a.trim().toLowerCase() === b.trim().toLowerCase();
  return JSON.stringify(a) === JSON.stringify(b);
}

const MONTHS: Record<Lang, string[]> = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
};
const FREQ_WORDS: Record<Lang, Record<string, string>> = {
  en: { weekly: 'every week', biweekly: 'every two weeks', twice_monthly: 'twice a month', monthly: 'once a month', annual: 'once a year' },
  es: { weekly: 'cada semana', biweekly: 'cada dos semanas', twice_monthly: 'dos veces al mes', monthly: 'una vez al mes', annual: 'una vez al año' },
};
const money = (n: number) => `$${n.toLocaleString('en-US')}`;

/** A date in words, so nobody has to guess which number is the month. */
export function dateInWords(v: string, lang: Lang): string | undefined {
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  let y: number, mo: number, d: number;
  if (m) [y, mo, d] = [+m[1]!, +m[2]!, +m[3]!];
  else {
    m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
    if (!m) return undefined;
    [mo, d, y] = [+m[1]!, +m[2]!, +m[3]!];
  }
  const name = MONTHS[lang][mo - 1];
  if (!name) return undefined;
  return lang === 'es' ? `${d} de ${name} de ${y}` : `${name} ${d}, ${y}`;
}

interface Live {
  result: Promise<{ ok: true; r: LaneResult } | { ok: false; e: unknown }>;
  attest?: { fields: string[]; how?: AttestHow; resolve: () => void; reject: (e: Error) => void };
  signal?: () => void;
  lane: LaneRunner;
}

/** A form map may also say how to show a value and label a field (duck-typed, not in the
 * contract): a school's name for its option code, a band's dollar range for its id. */
interface FormExtras {
  labels?: Record<string, Partial<Record<Lang, string>>>;
  display?: (id: string, value: FieldValue, lang: Lang, values: Record<string, FieldValue>) => string | undefined;
}

/** What the next question asks: the keys, and its words when they aren't the spec's. */
interface Ask {
  keys: FactKey[];
  text?: string;
  /** What a good answer looks like, for "I didn't catch that" and "what do you mean?". */
  example?: string;
}

export class PathwayEngine {
  private readonly registry: PathwayRegistry;
  private readonly now: () => Date;
  private readonly env: NodeJS.ProcessEnv;
  private readonly live = new Map<string, Live>();

  private understander?: Understander;
  private understandTimeoutMs?: number;

  constructor(private readonly opts: PathwayEngineOptions = {}) {
    this.understander = opts.understander;
    this.registry = opts.registry ?? defaultRegistry;
    this.now = opts.now ?? (() => new Date());
    this.env = opts.env ?? process.env;
  }

  // ── entry points ───────────────────────────────────────────────────────────

  /** Start a session. `seed` is what we already know (the district's record, a finished
   * pathway's facts), each fact with its own source. With `announce: false` nothing is sent
   * yet (the parent will write first): the first turn then says what the form is and asks. */
  async start(
    conversationId: string,
    state: { pathway?: PathwaySession },
    pathwayId: string,
    opts: { seed?: FamilyRecord; lang?: Lang; announce?: boolean } = {},
  ): Promise<EngineTurn> {
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
      introduced: opts.announce !== false,
    };
    state.pathway = s;
    if (opts.announce === false) return { text: '', phase: 'idle' };
    const t = await this.advance(conversationId, s, pathway, rec);
    if (s.stage === 'asking') t.text = this.introText(s, pathway, t.text);
    return t;
  }

  /** One parent message. `undefined` means the engine is not handling it: the normal agent
   * answers (no session, a paused session the message doesn't resume, or a gate). */
  async turn(conversationId: string, state: { pathway?: PathwaySession; profile?: { locale?: Lang } }, text: string): Promise<EngineTurn | undefined> {
    const s = state.pathway;
    if (!s || s.stage === 'closed') {
      const hit = this.registry.match(text);
      if (!hit) return undefined;
      const lang = state.profile?.locale === 'es' || detectLocale(text) === 'es' ? 'es' : 'en';
      return this.start(conversationId, state, hit.id, { lang });
    }
    const pathway = this.registry.pathway(s.id);
    if (!pathway) {
      s.stage = 'closed';
      return undefined;
    }
    s.turn++;
    const rec = FamilyRecord.fromJSON(s.record);
    const t = fold(text.trim());

    // 1. Gates. A person in danger or upset gets the normal agent, not the next question.
    const gate = regexGate(text);
    // The model reads every message the words alone don't settle (a clear yes to a proposal,
    // a gate, the signature step and the "what's next" offer are settled by code).
    const settled =
      gate !== undefined ||
      s.stage === 'attesting' ||
      s.stage === 'offered_next' ||
      (s.stage === 'paused' && s.pauseReason === 'crisis') ||
      (s.stage === 'proposed' && (this.isYes(text) || this.isNo(text))) ||
      (s.stage === 'handoff_offered' && (this.isYes(text) || this.isNo(text) || PERSON.test(t)));
    const m = settled ? undefined : await this.understand(text, s, pathway, rec);
    this.updateLang(s, text, rec, state.profile?.locale, m?.language);
    const R = this.r(s);
    if (gate === 'crisis' || gate === 'distress') return this.pause(s, s.stage, 'crisis');
    if (gate === 'reset') return this.close(s, 'abandoned');
    if (gate === 'person') {
      this.close(s, 'handoff');
      return { text: R.handoff, phase: 'done' };
    }
    if (gate === 'stop' && s.stage !== 'attesting') {
      this.pause(s);
      return { text: R.paused, phase: 'idle' };
    }
    // The model's gates: the same, read from how it was said.
    if (m?.intent === 'crisis') return this.pause(s, s.stage, 'crisis');
    if (m?.intent === 'wants_person' && s.stage !== 'paused') {
      this.close(s, 'handoff');
      return { text: R.handoff, phase: 'done' };
    }
    if (m?.intent === 'stop' && s.stage !== 'paused' && !this.hasModelFacts(m)) {
      this.pause(s);
      return { text: R.paused, phase: 'idle' };
    }

    // The parent wrote first: say what this is, read anything they told us, and ask.
    if (!s.introduced) return this.opening(conversationId, s, pathway, rec, text, m);

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
        // answer, not ours. Only "continue", a fact the message names, "help me with the form"
        // or "what do you mean?" brings the session back (or a plain answer after "I don't
        // know", which is what we asked them to send). With the model: a message it reads as
        // facts or a correction for this form is ours too (never after a crisis).
        const ex = this.read(text, s, pathway, rec, s.pauseReason === 'dont_know');
        const mx = m && s.pauseReason !== 'crisis' ? this.fromModel(m, text, s, pathway, rec) : undefined;
        // After "let me check", whatever they send next that isn't a question of their own is
        // for us: the form is still what we're doing together.
        const forUs = s.pauseReason === 'dont_know' && (m ? m.intent !== 'off_topic' && m.intent !== 'question' : !ex.question);
        const modelForUs = Boolean(mx && (mx.facts.length || m!.intent === 'correction'));
        if (RESUME.test(t) || ex.facts.length || FORM_HELP.test(t) || CONFUSED.test(t) || forUs || modelForUs) {
          s.pauseReason = undefined;
          s.stage = s.pausedFrom ?? 'asking';
          s.pausedFrom = undefined;
          if (!ex.facts.length && !mx?.facts.length && !(forUs && m)) return this.resume(conversationId, s, pathway, rec);
          break; // carry on below with this message
        }
        return undefined;
      }
      case 'handoff_offered': {
        // "Yes", "ok sure, have them call me", "sí, conéctame": a person it is.
        if (this.isYes(text) || AFFIRM.test(t) || PERSON.test(t) || m?.intent === 'approve' || m?.intent === 'wants_person') {
          this.close(s, 'handoff');
          return { text: R.handoff, phase: 'done' };
        }
        const bareNo = this.isNo(text) || RESUME.test(t) || (NEGATE.test(t) && t.replace(NEGATE, '').replace(/[^a-z0-9]+/g, '').length === 0);
        if (bareNo || (m?.intent === 'decline' && !this.hasModelFacts(m))) {
          s.stage = s.proposal ? 'proposed' : 'asking';
          for (const k of s.lastAsked) s.asked[k] = 1;
          if (s.proposal) return this.propose(s, pathway, rec, undefined, (p) => p);
          return this.advance(conversationId, s, pathway, rec);
        }
        // "No, it's Javier Castillo": not a person, and the rest of it is an answer.
        if (NEGATE.test(t)) for (const k of s.lastAsked) s.asked[k] = 1;
        s.stage = s.proposal ? 'proposed' : 'asking';
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

    // 2. Extraction: the model's reading first, the deterministic readers beside it (and
    // instead of it, when there is no model or it failed).
    let ex = s.stage === 'proposed' ? this.readCorrections(text, s, pathway, rec) : this.read(text, s, pathway, rec, true);
    if (m) ex = this.merge(ex, this.fromModel(m, text, s, pathway, rec), m, s);
    else if (!ex.facts.length && this.opts.extractor) {
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
    const asked = [...s.lastAsked];
    const changes = this.apply(conversationId, s, pathway, rec, text, ex);
    const faq = this.faq(text, s, pathway);

    if (!ex.facts.length) {
      const g = await second;
      if (g === 'crisis' || g === 'distress') return this.pause(s, s.stage, 'crisis');
      if (g === 'person') {
        this.close(s, 'handoff');
        return { text: R.handoff, phase: 'done' };
      }
      return this.nothingRead(conversationId, s, pathway, rec, text, ex, g, faq, m);
    }

    // Progress on a question resets its count: "never a third time" is about failing, not
    // about a loop that moves ("any other income?" after each new income).
    const keys = new Set(ex.facts.map((f) => f.key));
    const incomeMoved = ex.facts.some((f) => /^income\./.test(f.key));
    for (const k of asked) if (keys.has(k) || (incomeMoved && /\.(income_done|has_income)$|^household\.incomes_complete$/.test(k))) s.asked[k] = 0;

    // A question asked alongside the answer that no FAQ covers: say so, never guess.
    const unanswered = m && (m.alsoAsks || m.intent === 'question') && !faq.length && ex.question ? R.notSure : '';
    const prefix = [changes.length ? R.corrected(changes) : '', ...faq, unanswered].filter(Boolean).join(' ') || undefined;
    return this.advance(conversationId, s, pathway, rec, prefix);
  }

  // ── language ───────────────────────────────────────────────────────────────

  /** The family's language: an explicit choice wins; the first message sets it; after that
   * Spanish is sticky and English flips to Spanish only on Spanish words, never on a name
   * ("Mía", "José") or a school. */
  private updateLang(s: PathwaySession, text: string, rec: FamilyRecord, profile?: Lang, model?: Lang | 'other'): void {
    const choice = explicitLocaleChoice(text);
    if (choice) {
      s.lang = choice;
      return;
    }
    const stripped = this.withoutNames(text, rec);
    if (!s.introduced) {
      const det = detectLocale(stripped) === 'es' ? 'es' : 'en';
      // The model reads a mixed message better than word lists; it decides when it can.
      const read = model === 'es' || model === 'en' ? model : det;
      s.lang = read === 'es' ? 'es' : profile === 'es' ? 'es' : s.lang;
      return;
    }
    // An answer to "what's your name?" or "who lives with you?" is mostly names ("efraín h.
    // reyes, my husband"): it says nothing about the family's language.
    if (s.stage === 'asking' && s.lastAsked.some((k) => /\.(first_name|last_name)$|^household\.roster$/.test(k))) return;
    // English flips to Spanish only when the words say so and the model (if any) agrees.
    if (s.lang === 'en' && detectLocale(stripped) === 'es' && model !== 'en' && model !== 'other') s.lang = 'es';
  }

  private withoutNames(text: string, rec: FamilyRecord): string {
    let out = text;
    const names = new Set<string>();
    for (const k of rec.keys()) {
      if (/\.(first_name|last_name|school)$/.test(k)) for (const w of String(rec.get(k)?.value ?? '').split(/\s+/)) if (w.length > 1) names.add(w);
    }
    for (const n of names) out = out.replace(new RegExp(`(^|[^\\p{L}])${escapeRe(n)}(?=$|[^\\p{L}])`, 'giu'), '$1');
    // A capitalized word inside a sentence is a name we don't know yet.
    return out.replace(/(?<=[\p{L},]\s+)\p{Lu}[\p{L}'’-]*/gu, '');
  }

  // ── the model's reading (understand.ts) ────────────────────────────────────

  /** Use a model to read messages (or stop: `undefined`). */
  setUnderstander(u: Understander | undefined, opts: { timeoutMs?: number } = {}): void {
    this.understander = u;
    if (opts.timeoutMs !== undefined) this.understandTimeoutMs = opts.timeoutMs;
  }

  /** Back to the form after the normal agent couldn't help with a side message (its "I'm not
   * sure I can help with that" or a menu would only confuse a parent mid-form). Never after a
   * crisis pause: then the normal agent keeps the conversation. */
  async backToForm(conversationId: string, state: { pathway?: PathwaySession }): Promise<EngineTurn | undefined> {
    const s = state.pathway;
    if (!s || s.stage !== 'paused' || s.pauseReason === 'crisis') return undefined;
    const pathway = this.registry.pathway(s.id);
    if (!pathway) return undefined;
    const rec = FamilyRecord.fromJSON(s.record);
    s.stage = s.pausedFrom ?? 'asking';
    s.pausedFrom = undefined;
    s.pauseReason = undefined;
    const t = await this.resume(conversationId, s, pathway, rec);
    return { ...t, text: `${this.r(s).notHere}\n\n${t.text}` };
  }

  /** Ask the model what this message says, with only what it needs (understand.ts). A model
   * that fails or is slow reads nothing: the deterministic readers carry the turn. */
  private async understand(text: string, s: PathwaySession, pathway: Pathway, rec: FamilyRecord): Promise<Understanding | undefined> {
    const u = this.understander;
    if (!u) return undefined;
    const stage: UnderstandInput['stage'] = !s.introduced ? 'opening' : s.stage === 'paused' ? 'paused' : s.stage === 'proposed' ? 'proposed' : s.stage === 'handoff_offered' ? 'handoff_offered' : 'asking';
    const asked = s.lastAsked
      .map((key) => ({ key, spec: specFor(pathway.facts, key) }))
      .filter((x): x is { key: string; spec: FactSpec } => Boolean(x.spec))
      .map((x) => ({ key: x.key, kind: x.spec.kind, ...(x.spec.options ? { options: x.spec.options } : {}) }));
    const ids = [SELF, ...rec.memberIds().filter((id) => id !== SELF)];
    const people = ids.map((id) => ({
      id,
      ...(rec.get<string>(`member.${id}.first_name`) ? { first: rec.get<string>(`member.${id}.first_name`)!.value } : {}),
      ...(rec.get<string>(`member.${id}.last_name`) ? { last: rec.get<string>(`member.${id}.last_name`)!.value } : {}),
      relationship: id === SELF ? 'self' : rec.get<string>(`member.${id}.relationship`)?.value,
      ...(rec.get<boolean>(`member.${id}.student`)?.value === true ? { student: true } : {}),
    }));
    const specs = pathway.facts.filter((f) => f.sources.includes('parent') && f.ask.en).map((f) => ({ key: f.key, kind: f.kind, ...(f.options ? { options: f.options } : {}) }));
    const R = this.r(s);
    let question = s.lastAskText;
    let proposal: UnderstandInput['proposal'];
    if (s.stage === 'proposed' && s.proposal) {
      const fields = (s.proposal.step.payload as { fields: Record<string, string> }).fields;
      proposal = Object.entries(fields).map(([label, v], i) => ({ line: i + 1, text: `${label}: ${v}` }));
      question = R.proposalUnclear;
    } else if (s.stage === 'handoff_offered') question = R.handoffOffer;
    const input: UnderstandInput = { message: text, lang: s.lang, stage, ...(question ? { question } : {}), asked, people, specs, ...(proposal ? { proposal } : {}) };
    const ctl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        u.understand(input, { signal: ctl.signal }),
        new Promise<undefined>((res) => {
          timer = setTimeout(() => {
            ctl.abort();
            res(undefined);
          }, this.understandTimeoutMs ?? this.opts.understandTimeoutMs ?? 6000);
        }),
      ]);
    } catch {
      return undefined;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private hasModelFacts(m: Understanding): boolean {
    return Boolean(m.people.length || m.incomes.length || m.noIncome.length || m.facts.length || m.corrections.length);
  }

  /**
   * The model's reading → facts the engine can record, by the engine's rules. People get the
   * archive's ids (a new spouse is q, a child c#, anyone else g#), and only once we've asked
   * who lives at home; an income needs whose it is (or is asked); a sensitive fact counts only
   * when we asked it or the words name it; a fact we already have changes only when it was
   * asked again or the parent is correcting. Every fact keeps the parent's quote.
   */
  private fromModel(m: Understanding, text: string, s: PathwaySession, pathway: Pathway, rec: FamilyRecord): { facts: Found[]; correction: boolean } {
    const out: Found[] = [];
    const put = (key: FactKey, value: unknown, quote: string) => {
      if (!specFor(pathway.facts, key) || out.some((f) => f.key === key)) return;
      out.push({ key, value, quote, named: true });
    };
    const stage = s.stage === 'paused' ? s.pausedFrom ?? 'asking' : s.stage;
    const L = stage === 'proposed' ? [] : s.lastAsked;
    const correcting = m.intent === 'correction' || stage === 'proposed';
    const may = (k: FactKey) => !rec.has(k) || correcting || L.includes(k);
    const known = new Set([SELF, ...rec.memberIds()]);
    const roster = rec.get<string[]>('household.roster')?.value;
    const rosterAsked = L.includes('household.roster');
    const used = new Set(rec.memberIds());
    const nextId = (rel: string | undefined) => {
      if (rel === 'spouse' && !used.has('q')) return 'q';
      const p = rel === 'child' ? 'c' : 'g';
      let k = 1;
      while (used.has(`${p}${k}`)) k++;
      return `${p}${k}`;
    };
    const refs = new Map<string, string>();
    const resolve = (ref: string | undefined): string | undefined => {
      if (!ref) return undefined;
      const r = ref.trim();
      if (r === SELF || /^(me|self|yo|i)$/i.test(r)) return SELF;
      if (refs.has(r)) return refs.get(r);
      if (known.has(r)) return r;
      const byName = rec.memberIds().find((id) => fold(rec.get<string>(`member.${id}.first_name`)?.value ?? '\u0000') === fold(r));
      return byName;
    };

    // 1. People: names, relationship, age; and who lives at home.
    const listed: string[] = [];
    const added: string[] = [];
    for (const p of m.people) {
      let id = p.relationship === 'self' ? SELF : resolve(p.ref);
      if (!id && p.first_name) id = rec.memberIds().find((x) => fold(rec.get<string>(`member.${x}.first_name`)?.value ?? '\u0000') === fold(p.first_name!));
      if (!id) {
        // Someone new: only once we've asked who lives here (or are adding to that list), and
        // never "the kids" with no name (the district's students are already known).
        if (!(rosterAsked || roster)) continue;
        if (!p.first_name && (!p.relationship || p.relationship === 'child')) continue;
        id = nextId(p.relationship);
        used.add(id);
        added.push(id);
      }
      refs.set(p.ref, id);
      if (!listed.includes(id)) listed.push(id);
      if (p.first_name && may(`member.${id}.first_name`)) put(`member.${id}.first_name`, p.first_name, p.quote);
      if (p.last_name && may(`member.${id}.last_name`)) put(`member.${id}.last_name`, p.last_name, p.quote);
      if (p.middle_initial && may(`member.${id}.middle_initial`)) put(`member.${id}.middle_initial`, p.middle_initial, p.quote);
      // A relationship only as the parent said it: unsaid, it is asked ("How is Javier related
      // to you?"), never assumed.
      if (!rec.has(`member.${id}.relationship`) && (id === SELF || p.relationship)) put(`member.${id}.relationship`, id === SELF ? 'self' : p.relationship!, p.quote);
      if (p.age !== undefined && !rec.has(`member.${id}.dob`) && may(`member.${id}.age`)) put(`member.${id}.age`, p.age, p.quote);
    }
    if (rosterAsked && listed.length) {
      // The parent is in the home even when they listed only the others, and so is every
      // student the district knows unless the parent says otherwise.
      const ids = [SELF, ...listed.filter((id) => id !== SELF)];
      for (const id of rec.memberIds()) if (rec.get<boolean>(`member.${id}.student`)?.value === true && !ids.includes(id)) ids.push(id);
      put('household.roster', ids, text.trim());
    } else if (roster && added.length) {
      put('household.roster', [...roster, ...added], m.people.find((p) => added.includes(refs.get(p.ref) ?? ''))?.quote ?? text.trim());
    }
    const inHome = new Set([SELF, ...(roster ?? []), ...listed]);

    // 2. Money, by whose it is.
    const askedOwner = L.map((k) => /^member\.([^.]+)\.(has_income|income_done)$/.exec(k)?.[1]).find(Boolean);
    const askedWork = L.some((k) => /\.has_income$/.test(k));
    const freqAsked = L.map((k) => /^income\.(\d+)\.frequency$/.exec(k)?.[1]).find((x) => x !== undefined);
    const existing = rec.incomeIndexes().map((n) => ({
      n,
      owner: rec.get<string>(`income.${n}.owner`)?.value,
      amount: rec.get<number>(`income.${n}.amount`)?.value,
      frequency: rec.get<string>(`income.${n}.frequency`)?.value,
    }));
    let next = existing.length ? Math.max(...existing.map((e) => e.n)) + 1 : 0;
    const ownersNow = new Set(existing.map((e) => e.owner).filter(Boolean));
    for (const inc of m.incomes) {
      if (inc.frequency === 'hourly') continue; // a rate: the engine asks for the paycheck
      let owner = inc.owner === 'unknown' ? undefined : resolve(inc.owner);
      if (!owner && askedOwner) owner = askedOwner;
      if (owner && !inHome.has(owner) && !known.has(owner)) owner = undefined;
      if (inc.replaces !== undefined) {
        const hit = existing.find((e) => e.amount === inc.replaces && (!owner || !e.owner || e.owner === owner));
        if (hit) {
          put(`income.${hit.n}.amount`, inc.amount, inc.quote);
          if (inc.frequency && inc.frequency !== hit.frequency) put(`income.${hit.n}.frequency`, inc.frequency, inc.quote);
          continue;
        }
      }
      // "How often is the $1,100?" answered with the amount again.
      if (freqAsked !== undefined && inc.frequency && existing.find((e) => String(e.n) === freqAsked)?.amount === inc.amount) {
        put(`income.${freqAsked}.frequency`, inc.frequency, inc.quote);
        continue;
      }
      // Said again: fill in only what that income lacks.
      const dup = existing.find((e) => e.amount === inc.amount && (!owner || !e.owner || e.owner === owner));
      if (dup) {
        if (inc.frequency && !dup.frequency) put(`income.${dup.n}.frequency`, inc.frequency, inc.quote);
        if (!dup.owner && owner) put(`income.${dup.n}.owner`, owner, inc.quote);
        if (inc.kind && !rec.has(`income.${dup.n}.kind`)) put(`income.${dup.n}.kind`, inc.kind, inc.quote);
        continue;
      }
      const n = next++;
      if (owner) put(`income.${n}.owner`, owner, inc.quote);
      put(`income.${n}.amount`, inc.amount, inc.quote);
      if (inc.frequency) put(`income.${n}.frequency`, inc.frequency, inc.quote);
      const kind = inc.kind ?? (askedWork && owner === askedOwner ? 'earned' : undefined);
      if (kind) put(`income.${n}.kind`, kind, inc.quote);
      if (rec.get('household.income_reported')?.value !== true) put('household.income_reported', true, inc.quote);
      if (owner) {
        ownersNow.add(owner);
        if (rec.get(`member.${owner}.has_income`)?.value !== true) put(`member.${owner}.has_income`, true, inc.quote);
      }
    }
    for (const ni of m.noIncome) {
      const id = resolve(ni.person);
      if (!id || !inHome.has(id)) continue;
      const has = ownersNow.has(id);
      if (!has && (ni.scope === 'none' || !rec.has(`member.${id}.has_income`))) put(`member.${id}.has_income`, false, ni.quote);
      put(`member.${id}.income_done`, true, ni.quote);
    }

    // 3. Everything else the form takes (benefits, each child's status, the address…).
    const STRUCT = /^member\.[^.]+\.(first_name|last_name|middle_initial|relationship|age|has_income|income_done)$|^household\.(roster|income_reported)$|^income\.\d+\.amount$/;
    for (const f of m.facts) {
      if (STRUCT.test(f.key)) continue;
      const mm = /^member\.([^.]+)\.(.+)$/.exec(f.key);
      let key = f.key;
      if (mm) {
        const id = resolve(mm[1]);
        if (!id) continue;
        key = `member.${id}.${mm[2]}`;
      }
      if (/^income\./.test(key) && !L.includes(key)) continue;
      if (key === 'household.incomes_complete' && !L.includes(key)) continue;
      const spec = specFor(pathway.facts, key);
      if (!spec || !spec.sources.includes('parent')) continue;
      let value: unknown = f.value;
      if (/^income\.\d+\.owner$/.test(key)) value = resolve(String(f.value));
      if (value === undefined) continue;
      if (spec.kind === 'enum' && typeof value === 'string') value = value.trim().toLowerCase();
      if (spec.kind === 'list' && typeof value === 'string') value = [value];
      if (spec.kind === 'number' && typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim())) value = Number(value);
      if (spec.kind === 'string' && typeof value === 'string') value = value.trim();
      if (!acceptModelFacts(text, [{ key, value, quote: f.quote }], [{ key, spec }]).length) continue;
      if (spec.kind === 'list' && spec.options && !(value as string[]).every((v) => spec.options!.includes(v))) continue;
      // Sensitive facts: asked, or named in the parent's words. Never inferred.
      if (spec.sensitive && !L.includes(key)) {
        const flag = /\.(foster|homeless|migrant)$/.exec(key)?.[1];
        const cue = flag ? FLAG_WORDS[flag] : hintFor(this.registry.hints(pathway.id).cues, key) ?? lexiconCue(key);
        if (!cue || !cue.test(fold(f.quote))) continue;
      }
      if (!may(key)) continue;
      put(key, value, f.quote);
      const flag = /^member\.([^.]+)\.foster$/.exec(key);
      if (flag && value === true) put(`member.${flag[1]}.benefits`, [...new Set([...(rec.get<string[]>(`member.${flag[1]}.benefits`)?.value ?? []), 'foster_care'])], f.quote);
    }

    // 4. Lines of the proposal the parent says are wrong.
    if (stage === 'proposed' && s.proposal && m.corrections.length) {
      const fill = s.proposal.fill;
      const ids = Object.keys(fill.values);
      for (const c of m.corrections) {
        const id = ids[c.line - 1];
        if (!id) continue;
        const keys = (fill.sources[id] ?? []).filter((k) => specFor(pathway.facts, k)?.sources.includes('parent'));
        const key = keys[0];
        if (!key) continue;
        const spec = specFor(pathway.facts, key)!;
        if (/middle_initial$/.test(key)) {
          const mi = /^\s*([A-Za-zÀ-ÿ])\.?\s*$/.exec(c.value)?.[1] ?? splitName(c.value)?.mi;
          if (mi) put(key, mi.toUpperCase(), c.quote);
          continue;
        }
        const one = extractFacts(c.value, { lang: s.lang, slots: [{ key, spec }], asked: [key], recent: [] });
        const hit = one.facts.find((x) => x.key === key);
        if (hit) put(key, hit.value, c.quote);
        else if (spec.kind === 'string') put(key, c.value.trim(), c.quote);
      }
    }
    return { facts: out, correction: correcting && out.length > 0 };
  }

  /** The model's facts first; the deterministic readers add what it didn't cover, except the
   * household's people and money (where the regex readers make the mistakes the model was
   * brought in for: "Oh right!" as a name, "no income from him" on the parent). */
  private merge(det: Extraction, mx: { facts: Found[]; correction: boolean }, m: Understanding, s: PathwaySession): Extraction {
    const STRUCT = /^member\.[^.]+\.(first_name|last_name|middle_initial|relationship|age|has_income|income_done)$|^income\.|^household\.(roster|incomes_complete|income_reported)$/;
    const keys = new Set(mx.facts.map((f) => f.key));
    // When the model read nothing about people or money, the regex readers' reading stands.
    const modelTouched = mx.facts.some((f) => STRUCT.test(f.key)) || m.people.length > 0 || m.incomes.length > 0 || m.noIncome.length > 0;
    const extra = ['answer', 'correction', 'approve'].includes(m.intent) ? det.facts.filter((f) => !keys.has(f.key) && (!STRUCT.test(f.key) || !modelTouched)) : [];
    return {
      facts: [...mx.facts, ...extra],
      correction: det.correction || mx.correction,
      dontKnow: m.intent === 'unsure',
      declined: m.intent === 'decline' && s.stage !== 'proposed',
      question: m.intent === 'question' || m.intent === 'off_topic' || (m.alsoAsks && det.question),
      whyAsked: det.whyAsked,
    };
  }

  // ── reading the message ────────────────────────────────────────────────────

  /** Everything this message tells us. `bare`: a plain answer lands on what we just asked. */
  private read(text: string, s: PathwaySession, pathway: Pathway, rec: FamilyRecord, bare = true): Extraction {
    const hints = this.registry.hints(pathway.id);
    const people = Boolean(hints.people);
    const slots = this.slots(pathway, rec, s).filter((x) => !people || !PEOPLE_KEY.test(x.key));
    const ex = extractFacts(text, {
      lang: s.lang,
      slots,
      asked: s.stage === 'proposed' || !bare ? [] : s.lastAsked.filter((k) => !people || !PEOPLE_KEY.test(k)),
      // In people mode a bare "actually, it's $1,650" is read by the income parser, which knows
      // which income it corrects; nothing else takes an unnamed correction.
      recent: people ? [] : s.recent,
      cueFor: (key) => hintFor(hints.cues, key),
    });
    if (people) ex.facts.push(...this.readPeople(text, s, pathway, rec, bare && s.stage !== 'proposed'));
    return ex;
  }

  private memberRefs(rec: FamilyRecord): MemberRef[] {
    return rec.memberIds().map((id) => ({
      id,
      ...(rec.get<string>(`member.${id}.first_name`) ? { first: rec.get<string>(`member.${id}.first_name`)!.value } : {}),
      ...(rec.get<string>(`member.${id}.relationship`) ? { rel: rec.get<string>(`member.${id}.relationship`)!.value } : {}),
    }));
  }

  /** The people mode's parsers: the parent's name, who lives at home, money, each child's
   * status, the address. Each fact carries the sentence it came from. */
  private readPeople(text: string, s: PathwaySession, pathway: Pathway, rec: FamilyRecord, bare: boolean): Found[] {
    const out: Found[] = [];
    const L = bare ? s.lastAsked : [];
    const put = (key: FactKey, value: unknown, quote: string) => {
      if (!specFor(pathway.facts, key)) return;
      if (out.some((f) => f.key === key)) return;
      out.push({ key, value, quote, named: true });
    };
    const members = this.memberRefs(rec);

    // The parent's own name.
    const askedFirst = L.includes(`member.${SELF}.first_name`);
    const askedLast = L.includes(`member.${SELF}.last_name`);
    if (askedFirst || askedLast || !rec.has(`member.${SELF}.first_name`)) {
      const n = parsePersonName(text, askedFirst || askedLast);
      const volunteered = !askedFirst && !askedLast;
      // A name nobody asked for counts only as the parent typed it, capitalized ("I'm Rosa").
      const typed = volunteered ? new RegExp(`(^|[^\\p{L}])${escapeRe(n?.first ?? '')}(?=$|[^\\p{L}])`, 'u').test(text) : true;
      if (n && (!volunteered || (typed && /^\p{Lu}/u.test(n.first)))) {
        const quote = text.trim();
        if (askedLast && !askedFirst && !n.last && rec.has(`member.${SELF}.first_name`)) {
          // "García López" when we asked only the last name: all of it is the last name.
          const whole = splitName(`${rec.get<string>(`member.${SELF}.first_name`)!.value} ${text.trim()}`);
          const last = text.trim().replace(/[.!]+$/, '');
          if (whole && last.split(/\s+/).length <= 3) put(`member.${SELF}.last_name`, last, quote);
        } else {
          if (!(askedLast && !askedFirst && n.first !== rec.get(`member.${SELF}.first_name`)?.value && !n.last)) put(`member.${SELF}.first_name`, n.first, quote);
          if (n.last) put(`member.${SELF}.last_name`, n.last, quote);
          if (n.mi) put(`member.${SELF}.middle_initial`, n.mi, quote);
        }
        if (!rec.has(`member.${SELF}.relationship`)) put(`member.${SELF}.relationship`, 'self', quote);
      }
    }

    // Another member's name, when we asked for it ("What's your partner's first and last name?").
    const other = L.map((k) => /^member\.([^.]+)\.first_name$/.exec(k)?.[1]).find((id) => id && id !== SELF);
    if (other) {
      const n = parsePersonName(text, true);
      if (n) {
        put(`member.${other}.first_name`, n.first, text.trim());
        if (n.last) put(`member.${other}.last_name`, n.last, text.trim());
        if (n.mi) put(`member.${other}.middle_initial`, n.mi, text.trim());
      }
    }
    const otherLast = L.length === 1 ? /^member\.([^.]+)\.last_name$/.exec(L[0]!)?.[1] : undefined;
    if (otherLast && otherLast !== SELF) {
      const n = parsePersonName(text, true);
      const last = n?.last ?? (n && !n.ambiguous && text.trim().split(/\s+/).length <= 3 ? text.trim().replace(/[.!]+$/, '') : undefined);
      if (last) put(`member.${otherLast}.last_name`, last, text.trim());
    }

    // How someone is related to the parent, when we asked.
    const relAsked = L.length === 1 ? /^member\.([^.]+)\.relationship$/.exec(L[0]!)?.[1] : undefined;
    if (relAsked) {
      const rel = parseRel(text);
      if (rel) put(`member.${relAsked}.relationship`, rel, text.trim());
    }

    // Who lives at home.
    if (L.includes('household.roster')) {
      const items = parseRoster(text);
      if (items) out.push(...this.rosterFacts(items, rec, pathway, text));
    }

    // Money: what we asked about, a correction, or a volunteered income that says whose.
    const askedOwner = L.map((k) => /^member\.([^.]+)\.(has_income|income_done)$/.exec(k)?.[1]).find(Boolean);
    const askedWork = L.some((k) => /\.has_income$/.test(k));
    const askedCatchAll = L.includes('household.incomes_complete');
    const askedOwnerOf = L.map((k) => /^income\.(\d+)\.owner$/.exec(k)?.[1]).find((x) => x !== undefined);
    const askedIncome = Boolean(askedOwner || askedCatchAll || askedOwnerOf !== undefined || L.some((k) => /^income\./.test(k)));
    const reading = parseIncomes(text, members);
    const existing = rec.incomeIndexes().map((n) => ({
      n,
      owner: rec.get<string>(`income.${n}.owner`)?.value,
      amount: rec.get<number>(`income.${n}.amount`)?.value,
      frequency: rec.get<string>(`income.${n}.frequency`)?.value,
    }));
    for (const c of reading.corrections) {
      const hit = existing.find((e) => e.amount === c.from);
      if (hit) put(`income.${hit.n}.amount`, c.to, c.quote);
    }
    let next = existing.length ? Math.max(...existing.map((e) => e.n)) + 1 : 0;
    const quoteAll = text.trim();
    if (reading.noIncomeAtAll && (askedIncome || !rec.incomeIndexes().length)) {
      put('household.income_reported', false, quoteAll);
      put('household.incomes_complete', true, quoteAll);
      for (const m of this.adults(rec)) {
        put(`member.${m}.has_income`, false, quoteAll);
        put(`member.${m}.income_done`, true, quoteAll);
      }
    } else {
      for (const inc of reading.incomes) {
        // A frequency question answered with the amount again ("$2,200 every two weeks").
        const freqAsked = L.map((k) => /^income\.(\d+)\.frequency$/.exec(k)?.[1]).find((x) => x !== undefined);
        if (freqAsked !== undefined && inc.frequency && existing.find((e) => String(e.n) === freqAsked)?.amount === inc.amount) {
          put(`income.${freqAsked}.frequency`, inc.frequency, inc.quote);
          continue;
        }
        let owner = inc.owner ?? askedOwner;
        if (!owner && askedOwnerOf !== undefined) continue;
        const volunteered = !askedIncome;
        if (volunteered && !(inc.owner && inc.kind)) continue;
        // The parent said it again: nothing new.
        if (existing.some((e) => e.amount === inc.amount && (e.owner === owner || !owner) && (!inc.frequency || e.frequency === inc.frequency))) continue;
        if (owner && !rec.memberIds().includes(owner)) owner = undefined;
        const n = next++;
        if (owner) put(`income.${n}.owner`, owner, inc.quote);
        put(`income.${n}.amount`, inc.amount, inc.quote);
        if (inc.frequency) put(`income.${n}.frequency`, inc.frequency, inc.quote);
        // "How much do you make from work?" answered with an amount: pay from work.
        const kind = inc.kind ?? (askedWork && owner === askedOwner ? 'earned' : undefined);
        if (kind) put(`income.${n}.kind`, kind, inc.quote);
        if (rec.get('household.income_reported')?.value !== true) put('household.income_reported', true, inc.quote);
        if (owner && !rec.has(`member.${owner}.has_income`)) put(`member.${owner}.has_income`, true, inc.quote);
      }
      // The answer to "whose is it?".
      if (askedOwnerOf !== undefined) {
        const o = /^(mine|me|yo|mio|mia|my own|it'?s mine|es mio|es mia)\b/.test(fold(text.trim())) ? SELF : reading.incomes[0]?.owner ?? undefined;
        const who = o ?? members.find((m) => m.first && new RegExp(`\\b${escapeRe(fold(m.first))}\\b`).test(fold(text)))?.id;
        if (who) put(`income.${askedOwnerOf}.owner`, who, quoteAll);
      }
      const saidNo = reading.none || reading.thatsAll || /^(no|nope|nah|none|nada|ninguno|ninguna)\b/.test(fold(text.trim()));
      const gotIncome = out.some((f) => /^income\.\d+\.amount$/.test(f.key));
      if (askedOwner && !gotIncome && saidNo) {
        if (askedWork) {
          put(`member.${askedOwner}.has_income`, false, quoteAll);
          // "No, he doesn't have any income" / "that's all": nothing else for them either.
          if (reading.thatsAll || /\b(any|no) income\b|\bningun ingreso\b|\bno tiene ingresos\b/.test(fold(text))) put(`member.${askedOwner}.income_done`, true, quoteAll);
        } else put(`member.${askedOwner}.income_done`, true, quoteAll);
      }
      if (askedOwner && reading.thatsAll && gotIncome && !askedWork) put(`member.${askedOwner}.income_done`, true, quoteAll);
      if (askedCatchAll && !gotIncome && saidNo) put('household.incomes_complete', true, quoteAll);
    }

    // Each child's foster / homeless / migrant status, asked for all of them at once.
    const flag = this.askedFlag(L);
    if (flag) {
      const kids = L.map((k) => k.split('.')[1]!).map((id) => members.find((m) => m.id === id) ?? { id });
      const read = parseFlag(text, kids, FLAG_WORDS[flag]);
      if (read) {
        for (const [id, v] of Object.entries(read)) {
          put(`member.${id}.${flag}`, v, quoteAll);
          // The archive's word for a foster child is a benefit (school_meals/federal/rules.py).
          if (flag === 'foster' && v) put(`member.${id}.benefits`, [...new Set([...(rec.get<string[]>(`member.${id}.benefits`)?.value ?? []), 'foster_care'])], quoteAll);
        }
      }
    }

    // The address, wherever it comes.
    const addr = parseAddress(text);
    if (addr && specFor(pathway.facts, 'contact.street')) {
      const q = sentences(text).find((x) => x.includes(addr.street)) ?? quoteAll;
      put('contact.street', addr.street, q);
      if (addr.city) put('contact.city', addr.city, q);
      if (addr.state) put('contact.state', addr.state, q);
      if (addr.zip) put('contact.zip', addr.zip, q);
    }
    return out;
  }

  private askedFlag(keys: FactKey[]): Flag | undefined {
    if (!keys.length) return undefined;
    const flags = keys.map((k) => /^member\.[^.]+\.(foster|homeless|migrant)$/.exec(k)?.[1]);
    return flags.every((f) => f && f === flags[0]) ? (flags[0] as Flag) : undefined;
  }

  /** The roster answer → members, by the archive's ids: the district's students keep theirs. */
  private rosterFacts(items: ReturnType<typeof parseRoster> & object, rec: FamilyRecord, pathway: Pathway, text: string): Found[] {
    const out: Found[] = [];
    const put = (key: FactKey, value: unknown, quote: string) => {
      if (specFor(pathway.facts, key) && !out.some((f) => f.key === key)) out.push({ key, value, quote, named: true });
    };
    const refs = this.memberRefs(rec);
    const used = new Set(rec.memberIds());
    const ids: string[] = [];
    const nextId = (prefix: 'c' | 'g' | 'q') => {
      if (prefix === 'q' && !used.has('q')) return 'q';
      let k = 1;
      const p = prefix === 'q' ? 'g' : prefix;
      while (used.has(`${p}${k}`)) k++;
      return `${p}${k}`;
    };
    for (const it of items) {
      let id: string | undefined;
      if (it.rel === 'self') id = SELF;
      else if (it.name) {
        const f = fold(it.name.first);
        id = refs.find((m) => m.first && fold(m.first) === f)?.id;
      }
      if (!id) {
        // "the kids": the district's students. "My husband" with no name: a member whose
        // name we ask next.
        if (!it.name && (it.rel === 'child' || !it.rel)) continue;
        const rel: Rel = it.rel ?? 'other';
        id = rel === 'spouse' ? nextId('q') : rel === 'child' ? nextId('c') : nextId('g');
      }
      if (ids.includes(id)) continue;
      used.add(id);
      ids.push(id);
      const known = rec.get<string>(`member.${id}.relationship`);
      const rel = it.rel ?? (known?.value as Rel | undefined) ?? 'other';
      if (!known) put(`member.${id}.relationship`, rel, it.quote);
      if (it.age !== undefined && !rec.has(`member.${id}.dob`)) put(`member.${id}.age`, it.age, it.quote);
      if (it.name && id !== SELF) {
        if (!rec.has(`member.${id}.first_name`)) put(`member.${id}.first_name`, it.name.first, it.quote);
        if (it.name.last && !rec.has(`member.${id}.last_name`)) put(`member.${id}.last_name`, it.name.last, it.quote);
        if (it.name.mi && !rec.has(`member.${id}.middle_initial`)) put(`member.${id}.middle_initial`, it.name.mi, it.quote);
      }
    }
    // The parent is in the home even when they only listed the others.
    if (!ids.includes(SELF)) ids.unshift(SELF);
    if (!rec.has(`member.${SELF}.relationship`)) put(`member.${SELF}.relationship`, 'self', text.trim());
    // Every student the district knows lives here unless the parent says otherwise.
    for (const id of rec.memberIds()) if (rec.get<boolean>(`member.${id}.student`)?.value === true && !ids.includes(id)) ids.push(id);
    put('household.roster', ids, text.trim());
    return out;
  }

  /** On the proposal: "<line> is wrong, it should be <value>" changes the fact behind that
   * line; anything else is read as usual, without bare answers. */
  private readCorrections(text: string, s: PathwaySession, pathway: Pathway, rec: FamilyRecord): Extraction {
    const ex = this.read(text, s, pathway, rec, false);
    const step = s.proposal?.step;
    if (!step) return ex;
    const fields = (step.payload as { fields: Record<string, string> }).fields;
    const fill = s.proposal!.fill;
    const labelToId = new Map<string, string>();
    for (const id of Object.keys(fill.values)) labelToId.set(fold(this.fieldLabel(pathway, id, s.lang, fill)), id);
    void fields;
    const re = /(.+?)\s+(?:is wrong|isn'?t right|is not right|is incorrect|no esta bien|esta mal|no es correcto)[,.;:]?\s*(?:it should be|should be|it'?s|it is|debe ser|deberia ser|es)\s+(.+)$/;
    for (const sentence of sentences(text)) {
      const f = fold(sentence.replace(/[.!]+$/, '')).replace(/^(no|nope)[,.]?\s+/, '');
      const m = re.exec(f);
      if (!m) continue;
      const id = labelToId.get(m[1]!.trim()) ?? [...labelToId.entries()].find(([l]) => m[1]!.includes(l) || l.includes(m[1]!.trim()))?.[1];
      if (!id) continue;
      const keys = (fill.sources[id] ?? []).filter((k) => specFor(pathway.facts, k)?.sources.includes('parent'));
      // The value as the parent wrote it (case and accents kept).
      const raw = sentence.replace(/[.!]+$/, '').slice(sentence.length - sentence.replace(/[.!]+$/, '').length + 0);
      const valueText = raw.slice(raw.length - m[2]!.length);
      for (const key of keys.slice(0, 1)) {
        const spec = specFor(pathway.facts, key)!;
        if (/middle_initial$/.test(key)) {
          // One letter: "N", "N.", or read off a full name ("Marisol N. Gutiérrez").
          const mi = /^\s*([A-Za-zÀ-ÿ])\.?\s*$/.exec(valueText)?.[1] ?? splitName(valueText)?.mi;
          if (mi) ex.facts.push({ key, value: mi.toUpperCase(), quote: sentence.trim(), named: true });
          continue;
        }
        const one = extractFacts(valueText, { lang: s.lang, slots: [{ key, spec }], asked: [key], recent: [] });
        const hit = one.facts.find((x) => x.key === key);
        if (hit) ex.facts.push({ ...hit, quote: sentence.trim(), named: true });
        else if (spec.kind === 'string') ex.facts.push({ key, value: valueText.trim(), quote: sentence.trim(), named: true });
      }
    }
    if (ex.facts.length) ex.correction = true;
    return ex;
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
      // The district's record changes only when the parent plainly corrects it.
      if (prev && prev.source.kind === 'district' && !(ex.correction && f.named)) continue;
      rec.set(f.key, f.value, { kind: 'parent', ref, quote: f.quote }, this.now().toISOString());
      kept.push(f);
      s.recent = [f.key, ...s.recent.filter((k) => k !== f.key)].slice(0, 20);
      if (prev && !same(prev.value, f.value) && !/\.(has_income|income_done)$|^household\.(roster|incomes_complete|income_reported)$/.test(f.key)) {
        changes.push({ label: this.factLabel(pathway, rec, f.key, s.lang), from: this.showFact(f.key, prev.value, s.lang), to: this.showFact(f.key, f.value, s.lang) });
      }
    }
    // A value we already had isn't news: only what changed counts as read.
    ex.facts = kept;
    this.reId(rec, s);
    s.record = rec.toJSON();
    return changes;
  }

  /** Someone listed before we knew how they're related ("javier castillo 38") got an id of
   * their own (g1). Once the parent says how, they move to the archive's id for it (a spouse is
   * q, a child c#), with every fact and its source unchanged. */
  private reId(rec: FamilyRecord, s: PathwaySession): void {
    for (const id of rec.memberIds()) {
      if (!/^g\d+$/.test(id)) continue;
      const rel = rec.get<string>(`member.${id}.relationship`);
      if (!rel || rel.source.kind !== 'parent') continue;
      const ids = rec.memberIds();
      let to: string | undefined;
      if (rel.value === 'spouse' && !ids.includes('q')) to = 'q';
      else if (rel.value === 'child') {
        let k = 1;
        while (ids.includes(`c${k}`)) k++;
        to = `c${k}`;
      }
      if (!to) continue;
      const swap = (k: string) => k.replace(new RegExp(`^member\\.${id}\\.`), `member.${to}.`);
      for (const k of rec.keys()) {
        if (!k.startsWith(`member.${id}.`)) continue;
        const f = rec.get(k)!;
        rec.delete(k);
        rec.set(swap(k), f.value, f.source, f.at);
      }
      for (const k of rec.keys()) {
        const f = rec.get(k)!;
        if (k === 'household.roster' && Array.isArray(f.value)) rec.set(k, (f.value as string[]).map((x) => (x === id ? to : x)), f.source, f.at);
        else if ((/^income\.\d+\.owner$/.test(k) || k === 'contact.signer') && f.value === id) rec.set(k, to, f.source, f.at);
      }
      s.lastAsked = s.lastAsked.map(swap);
      s.recent = s.recent.map(swap);
      s.skipped = s.skipped.map(swap);
      s.asked = Object.fromEntries(Object.entries(s.asked).map(([k, v]) => [swap(k), v]));
    }
  }

  /** Answers to side questions about the form, in the family's language. */
  private faq(text: string, s: PathwaySession, pathway: Pathway, skip: string[] = []): string[] {
    const entries: FaqEntry[] = this.registry.hints(pathway.id).faq ?? [];
    const out: string[] = [];
    const parts = sentences(text);
    for (const e of entries) {
      if (skip.includes(e.id)) continue;
      const hit = parts.some((p) => (e.statement || isQuestion(p)) && e.match.test(fold(p)));
      if (hit) out.push(e.answer[s.lang]);
    }
    return out;
  }

  /** The message gave us nothing we could record. */
  private async nothingRead(
    conversationId: string,
    s: PathwaySession,
    pathway: Pathway,
    rec: FamilyRecord,
    text: string,
    ex: Extraction,
    g: GateLabel | undefined,
    faq: string[],
    m?: Understanding,
  ): Promise<EngineTurn | undefined> {
    const R = this.r(s);
    const hints = this.registry.hints(pathway.id);
    const t = fold(text.trim());
    if (s.stage === 'proposed' && s.proposal) {
      if (faq.length) {
        s.proposal.stamp.stale = false;
        return { text: `${faq.join(' ')}\n\n${R.proposalUnclear}`, phase: 'confirming' };
      }
      if (CONFUSED.test(t)) {
        s.proposal.unclear = (s.proposal.unclear ?? 0) + 1;
        if (s.proposal.unclear > 3) return this.offerHandoff(s);
        return { text: R.proposalRephrase, phase: 'confirming' };
      }
      // "What exactly will you put on the form?": show it again, every line.
      if (SHOW_ME.test(t)) return this.propose(s, pathway, rec, undefined, (p) => p);
      if (m) {
        // The model's reading of a reply to the proposal. A yes counts only as the clear-yes
        // rule would have it: approve, no correction, no value in the message, nothing asked;
        // and only through the digest gate (approve() re-checks exactly what was shown). When
        // Jev is configured, Jev reads the yes instead (below).
        if (m.intent === 'approve' && !m.corrections.length && !this.hasModelFacts(m) && !/\d/.test(text) && !m.alsoAsks && !WRONG.test(t)) {
          if (!jevEnabled(this.env)) return this.approve(conversationId, s, pathway, rec, 'read as a plain yes (model)');
        } else if (m.intent === 'decline' && !m.corrections.length) {
          s.proposal = undefined;
          this.pause(s, 'asking');
          return { text: R.declined, phase: 'idle' };
        } else if (m.intent === 'correction' || m.corrections.length || WRONG.test(t)) {
          s.proposal.unclear = (s.proposal.unclear ?? 0) + 1;
          if (s.proposal.unclear > 3) return this.offerHandoff(s);
          return { text: R.whichLine, phase: 'confirming' };
        } else if (m.intent === 'question' || m.alsoAsks) {
          s.proposal.stamp.stale = false;
          return { text: `${R.notSure}\n\n${R.proposalUnclear}`, phase: 'confirming' };
        } else if (m.intent === 'off_topic') return this.pause(s, s.stage, 'side');
        else if (m.intent === 'unsure') return { text: R.proposalRephrase, phase: 'confirming' };
      }
      // "X is wrong" that we couldn't tie to a line: ask which, never guess.
      if (WRONG.test(t)) {
        s.proposal.unclear = (s.proposal.unclear ?? 0) + 1;
        if (s.proposal.unclear > 3) return this.offerHandoff(s);
        return { text: R.whichLine, phase: 'confirming' };
      }
      if (ex.question && !ex.whyAsked) return this.pause(s, s.stage, 'side');
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
    if (!asked.length) return this.advance(conversationId, s, pathway, rec, faq.join(' ') || undefined);
    const askText = s.lastAskText ?? this.askText(s, pathway, asked);
    const example = this.example(s, pathway, asked.map((a) => a.key));
    // A question about the form gets its answer, then the form question again (not counted).
    if (faq.length) return { text: `${faq.join(' ')}\n\n${askText}`, phase: 'clarifying' };
    if (ex.whyAsked && asked.length) {
      const why = asked.map((a) => hintFor(hints.why, a.key)?.[s.lang]).find(Boolean);
      return { text: R.why(why, askText), phase: 'clarifying' };
    }
    // "What do you mean?": the question was the problem. Say it another way (twice), then offer help.
    if (CONFUSED.test(t)) {
      const key = asked[0]!.key;
      s.confused = { ...(s.confused ?? {}), [key]: (s.confused?.[key] ?? 0) + 1 };
      if (s.confused[key]! > 2) return this.offerHandoff(s);
      return { text: R.rephrase(askText, example), phase: 'clarifying' };
    }
    if (FORM_HELP.test(t)) return { text: R.keepGoing(askText), phase: 'clarifying' };
    // "$18 an hour": the form wants what each paycheck is, and we don't multiply hours we
    // weren't told.
    if (/\b(an?|per|la|por) (hour|hora)\b|\/\s?(hr|hour)\b|\bhourly\b/.test(t) && asked.some((a) => /has_income|income_done|incomes_complete|^income\./.test(a.key))) {
      return { text: R.askPaycheck, phase: 'clarifying' };
    }
    if (ex.declined && asked.length) {
      if (asked.some((a) => isRequired(a.spec, rec) || this.peopleRequired(pathway, a.key))) {
        s.stage = 'handoff_offered';
        return { text: R.declinedRequired, phase: 'clarifying' };
      }
      s.skipped.push(...asked.map((a) => a.key));
      return this.advance(conversationId, s, pathway, rec, R.skipped);
    }
    if (m) {
      // A question about the form we have no answer for: say so, and ask again (not counted).
      if (m.intent === 'question' && !ex.dontKnow) return { text: `${R.notSure}\n\n${askText}`, phase: 'clarifying' };
      if (m.intent === 'off_topic') return this.pause(s, s.stage, 'side');
    }
    if (ex.dontKnow) {
      this.pause(s, 'asking');
      s.pauseReason = 'dont_know';
      const where = asked.map((a) => hintFor(hints.where, a.key)?.[s.lang]).find(Boolean);
      return { text: hints.people ? R.dontKnowAsk(askText, where) : R.dontKnow, phase: 'idle' };
    }
    if (g === 'off_topic' || g === 'stop' || (ex.question && !m)) return this.pause(s, s.stage, 'side');
    // Not an answer we can read: ask again with an example (counted), or offer a person.
    return this.ask(s, pathway, rec, { keys: asked.map((a) => a.key), ...(s.lastAskBase ? { text: s.lastAskBase } : {}), example }, (q) => R.didntCatch(q, example));
  }

  /** People-mode facts are required by the flow, not by their spec. */
  private peopleRequired(pathway: Pathway, key: FactKey): boolean {
    return Boolean(this.registry.hints(pathway.id).people) && PEOPLE_KEY.test(key) && !/middle_initial$/.test(key);
  }

  private example(s: PathwaySession, pathway: Pathway, keys: FactKey[]): string | undefined {
    const hints = this.registry.hints(pathway.id);
    for (const k of keys) {
      const e = hintFor(hints.examples, k)?.[s.lang];
      if (e) return e;
    }
    return undefined;
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

  /** Everything extraction may set: what's missing, what was asked, what's already known, and
   * every plain fact the pathway takes (a case number said with the benefits answer). */
  private slots(pathway: Pathway, rec: FamilyRecord, s: PathwaySession): Slot[] {
    const out = new Map<FactKey, Slot>();
    for (const x of this.needs(pathway, rec, s).askable) out.set(x.key, x);
    const extra = this.registry.hints(pathway.id).people ? [...pathway.facts.filter((f) => !hasPlaceholder(f.key)).map((f) => f.key), `member.${SELF}.benefits`] : [];
    for (const k of [...s.lastAsked, ...rec.keys(), ...extra]) {
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

  private askText(s: PathwaySession, pathway: Pathway, slots: Array<{ key: FactKey; spec: FactSpec }>, override?: string): string {
    const hints = this.registry.hints(pathway.id);
    if (!slots.length) return override ?? '';
    const g = slots.length > 1 ? hints.groups?.find((gr) => slots.every((x) => gr.keys.some((k) => matchKey(k, x.key)))) : undefined;
    const base = override ?? g?.ask?.[s.lang] ?? slots.map((x) => x.spec.ask[s.lang]).join(' ');
    const sensitive = slots.find((x) => x.spec.sensitive);
    if (!sensitive) return base;
    const rec = FamilyRecord.fromJSON(s.record);
    return this.r(s).sensitive(base, hintFor(hints.why, sensitive.key)?.[s.lang], !isRequired(sensitive.spec, rec) && !this.peopleRequired(pathway, sensitive.key) && !/benefits$/.test(sensitive.key));
  }

  /** Ask these facts, counting. The third time, offer a person instead. */
  private ask(s: PathwaySession, pathway: Pathway, rec: FamilyRecord, a: Ask | FactKey[], wrap?: (q: string) => string, prefix?: string): EngineTurn {
    const q0: Ask = Array.isArray(a) ? { keys: a } : a;
    const keys = q0.keys;
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
    const q = this.askText(s, pathway, slots, q0.text);
    s.lastAskText = q;
    s.lastAskBase = q0.text;
    const text = wrap ? wrap(q) : q;
    return { text: prefix ? `${prefix}\n\n${text}` : text, phase: 'clarifying' };
  }

  private offerHandoff(s: PathwaySession): EngineTurn {
    s.stage = 'handoff_offered';
    return { text: this.r(s).handoffOffer, phase: 'clarifying' };
  }

  // ── the people mode: who lives here, their money, each child ──────────────

  private adults(rec: FamilyRecord): string[] {
    const roster = rec.get<string[]>('household.roster')?.value ?? [];
    const out = roster.filter((id) => {
      if (rec.get<boolean>(`member.${id}.student`)?.value === true) return false;
      const rel = rec.get<string>(`member.${id}.relationship`)?.value;
      if (rel === 'child') return false;
      const age = rec.get<number>(`member.${id}.age`)?.value;
      return age === undefined || age >= 18 || rel === 'self' || rel === 'spouse' || rel === 'parent';
    });
    return [SELF, ...out.filter((id) => id !== SELF)];
  }

  private nameOf(rec: FamilyRecord, id: string): string | undefined {
    return rec.get<string>(`member.${id}.first_name`)?.value;
  }

  /** Facts that follow from others: the adult signing is the parent writing to us; nobody
   * has income when every adult said none and nobody else does either. */
  private derive(pathway: Pathway, rec: FamilyRecord): void {
    const has = (k: FactKey) => rec.has(k);
    const spec = (k: FactKey) => specFor(pathway.facts, k);
    if (spec('contact.signer')?.sources.includes('derived') && !has('contact.signer') && has(`member.${SELF}.first_name`) && has(`member.${SELF}.last_name`)) {
      rec.set('contact.signer', SELF, { kind: 'derived', ref: 'the parent in this conversation signs', from: [`member.${SELF}.first_name`, `member.${SELF}.last_name`] });
    }
    if (!has('household.income_reported') && has('household.incomes_complete') && rec.get('household.incomes_complete')?.value === true && has('household.roster')) {
      const adults = this.adults(rec);
      const from = adults.flatMap((id) => [`member.${id}.has_income`, `member.${id}.income_done`]).filter(has);
      const none = adults.every((id) => rec.get(`member.${id}.has_income`)?.value === false && rec.get(`member.${id}.income_done`)?.value === true);
      if (none && !rec.incomeIndexes().length && from.length === adults.length * 2) {
        rec.set('household.income_reported', false, { kind: 'derived', ref: 'every adult said no income, and nobody else has any', from: [...from, 'household.incomes_complete'] });
      }
    }
  }

  /** The next question in people mode, in the order a person would ask. */
  private plan(pathway: Pathway, rec: FamilyRecord, s: PathwaySession): Ask | undefined {
    const R = this.r(s);
    const hints = this.registry.hints(pathway.id);
    const use = this.usable(pathway, rec);
    const has = (k: FactKey) => use.has(k) || s.skipped.includes(k);
    const spec = (k: FactKey) => specFor(pathway.facts, k);
    const ids = use.memberIds();
    const students = ids.filter((id) => use.get<boolean>(`member.${id}.student`)?.value === true);
    const ex = (k: FactKey) => hintFor(hints.examples, k)?.[s.lang];

    // 1. Benefits: a yes can end the form.
    if (spec('member.<m>.benefits') && !ids.some((id) => use.has(`member.${id}.benefits`)) && !has(`member.${SELF}.benefits`)) {
      return { keys: [`member.${SELF}.benefits`], example: ex('member.<m>.benefits') };
    }
    const onProgram = ids.some((id) => (use.get<string[]>(`member.${id}.benefits`)?.value ?? []).some((b) => ['snap', 'tanf', 'medicaid'].includes(b)));
    if (onProgram && spec('household.case_number') && !has('household.case_number')) return { keys: ['household.case_number'], example: ex('household.case_number') };

    // 2. The parent's own name.
    if (!has(`member.${SELF}.first_name`)) return { keys: [`member.${SELF}.first_name`, `member.${SELF}.last_name`], text: R.askSelfName, example: ex('member.p.name') };
    if (!has(`member.${SELF}.last_name`)) return { keys: [`member.${SELF}.last_name`], text: R.askLastName(this.nameOf(use, SELF) ?? '', true) };

    // 3. Who lives at home.
    if (!has('household.roster')) {
      const kids = students.map((id) => this.nameOf(use, id)).filter((x): x is string => Boolean(x));
      return { keys: ['household.roster'], text: R.askRoster(kids), example: ex('household.roster') };
    }
    for (const id of use.get<string[]>('household.roster')?.value ?? []) {
      if (id === SELF) continue;
      const first = this.nameOf(use, id);
      if (!has(`member.${id}.relationship`) && spec(`member.<m>.relationship`)) return { keys: [`member.${id}.relationship`], text: R.askRelation(first ?? '') };
      if (!first && !has(`member.${id}.first_name`)) {
        return { keys: [`member.${id}.first_name`, `member.${id}.last_name`], text: R.askNameOf(relWord(use.get<string>(`member.${id}.relationship`)?.value, s.lang)) };
      }
      if (first && !has(`member.${id}.last_name`)) return { keys: [`member.${id}.last_name`], text: R.askLastName(first, false) };
    }

    // 4. Money, person by person.
    if (use.get('household.income_reported')?.value !== false) {
      for (const id of this.adults(use)) {
        const name = this.nameOf(use, id);
        if (!has(`member.${id}.has_income`)) {
          return { keys: [`member.${id}.has_income`], text: id === SELF ? R.askIncomeSelf : R.askIncomeOf(name ?? ''), example: ex('income.amount') };
        }
        for (const n of use.incomeIndexes()) {
          if (use.get(`income.${n}.owner`)?.value !== id) continue;
          const fixed = this.incomeGap(pathway, use, s, n);
          if (fixed) return fixed;
        }
        if (!has(`member.${id}.income_done`)) {
          return { keys: [`member.${id}.income_done`], text: id === SELF ? R.askMoreIncomeSelf : R.askMoreIncomeOf(name ?? '') };
        }
      }
      for (const n of use.incomeIndexes()) {
        const fixed = this.incomeGap(pathway, use, s, n);
        if (fixed) return fixed;
      }
      if (!has('household.incomes_complete')) return { keys: ['household.incomes_complete'], text: R.askAnyoneElseIncome };
    }

    // 5. Each child's status, all children at once (foster, then homeless, then migrant).
    for (const flag of FLAGS) {
      if (!spec(`member.<m>.${flag}`)) continue;
      const missing = students.filter((id) => !has(`member.${id}.${flag}`) && !(flag === 'foster' && (use.get<string[]>(`member.${id}.benefits`)?.value ?? []).includes('foster_care')));
      if (missing.length && isRequired(spec(`member.<m>.${flag}`)!, use)) {
        const text = hintFor(hints.flagAsk, flag)?.[s.lang];
        return { keys: missing.map((id) => `member.${id}.${flag}`), ...(text ? { text } : {}), example: ex(`member.<m>.${flag}`) };
      }
    }

    // 6. Where they live.
    const addr = ['contact.street', 'contact.city', 'contact.state', 'contact.zip'];
    if (spec('contact.street') && isRequired(spec('contact.street')!, use) && addr.some((k) => !has(k))) return { keys: addr.filter((k) => !has(k)), text: R.askAddress, example: ex('contact.street') };
    return undefined;
  }

  /** What one income still needs: how often, what kind, whose. */
  private incomeGap(pathway: Pathway, use: FamilyRecord, s: PathwaySession, n: number): Ask | undefined {
    const R = this.r(s);
    const has = (k: FactKey) => use.has(k) || s.skipped.includes(k);
    const amount = use.get<number>(`income.${n}.amount`)?.value;
    if (amount === undefined) return undefined;
    const owner = use.get<string>(`income.${n}.owner`)?.value;
    const name = owner ? (owner === SELF ? undefined : this.nameOf(use, owner)) : undefined;
    const shown = money(amount);
    if (!owner && !has(`income.${n}.owner`)) return { keys: [`income.${n}.owner`], text: R.askOwner(shown) };
    if (!has(`income.${n}.frequency`)) return { keys: [`income.${n}.frequency`], text: R.askFrequency(owner === SELF ? (s.lang === 'es' ? 'usted' : 'you') : name, shown).replace('does you get', 'do you get') };
    // What kind of income, only when the form sorts by it (Pajaro's three columns).
    if (!has(`income.${n}.kind`) && pathway.form.fill(use, this.asOf()).missing.includes(`income.${n}.kind`)) return { keys: [`income.${n}.kind`], text: R.askKind(owner === SELF ? undefined : name, shown) };
    return undefined;
  }

  // ── moving the task forward ────────────────────────────────────────────────

  private async advance(conversationId: string, s: PathwaySession, pathway: Pathway, rec: FamilyRecord, prefix?: string): Promise<EngineTurn> {
    const R = this.r(s);
    const hints = this.registry.hints(pathway.id);
    if (hints.people) this.derive(pathway, rec);
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
        const done = await this.precheck(s, pathway, use, factsIn && !hints.people);
        if (done) return with_(done);
      }
    }

    if (hints.people) {
      const next = this.plan(pathway, rec, s);
      if (next) return this.ask(s, pathway, rec, next, undefined, prefix);
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
    // Optional facts the form has a place for, asked once ("do you want to add an email?").
    for (const k of hints.optional ?? []) {
      const spec = specFor(pathway.facts, k);
      if (!spec || rec.has(k) || s.skipped.includes(k) || (s.asked[k] ?? 0) >= 1) continue;
      return this.ask(s, pathway, rec, [k], undefined, prefix);
    }
    if (pathway.precheck && !s.precheckRan) {
      const done = await this.precheck(s, pathway, this.usable(pathway, rec), true);
      if (done) return with_(done);
    }
    return this.propose(s, pathway, rec, prefix);
  }

  /** Ask the archive (through the pathway) whether there is anything to file. An archive that
   * can't answer is "undetermined": we carry on and file. Only a full answer (or the last check
   * before the proposal) counts as having checked. */
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
      if (final || res.determination) s.precheckRan = true;
      return undefined;
    }
    s.precheckRan = true;
    s.outcome = 'already_covered';
    s.proposal = undefined;
    return this.finish(s, pathway, this.r(s).covered(res.why[s.lang]));
  }

  private label(pathway: Pathway, id: string, lang: Lang): string {
    const hints = this.registry.hints(pathway.id);
    const fromForm = (pathway.form as unknown as FormExtras).labels?.[id]?.[lang];
    const l = hints.labels?.[id]?.[lang] ?? fromForm ?? humanize(id);
    return l ? l[0]!.toUpperCase() + l.slice(1) : id;
  }

  /** A field's label as the parent sees it: whose it is (by name, or "You") and what it is,
   * so every line can be checked on its own ("Sofía — date of birth: March 3, 2016"). */
  private fieldLabel(pathway: Pathway, id: string, lang: Lang, fill: FormFill): string {
    const hints = this.registry.hints(pathway.id);
    if (!hints.people || hints.labels?.[id]) return this.label(pathway, id, lang);
    const R = replies(lang);
    const rec = FamilyRecord.fromJSON(this.sessionRecord ?? { state: pathway.state, facts: [] });
    const persons = new Set<string>();
    for (const k of fill.sources[id] ?? []) {
      const m = /^member\.([^.]+)\./.exec(k);
      if (m) persons.add(m[1]!);
      const inc = /^income\.(\d+)\./.exec(k);
      if (inc) {
        const o = rec.get<string>(`income.${inc[1]}.owner`)?.value;
        if (o) persons.add(o);
      }
      if (k === 'contact.signer') persons.add(rec.get<string>('contact.signer')?.value ?? SELF);
    }
    const leaf = id.split('.').pop()!;
    const base = hintFor(hints.fieldLabels, leaf)?.[lang] ?? hintFor(hints.fieldLabels, id)?.[lang] ?? humanize(leaf);
    if (persons.size !== 1) return base[0]!.toUpperCase() + base.slice(1);
    const who = [...persons][0]!;
    const name = who === SELF ? R.you : rec.get<string>(`member.${who}.first_name`)?.value ?? R.you;
    return R.of(name, base);
  }

  /** The record the labels read names from (set while building a step). */
  private sessionRecord?: ReturnType<FamilyRecord['toJSON']>;

  /** A fact by the label of the field it fills ("monthly income"), else by its key. */
  private factLabel(pathway: Pathway, rec: FamilyRecord, key: FactKey, lang: Lang): string {
    // An income by whose it is ("your income", "Ricardo's income").
    const inc = /^income\.(\d+)\.(amount|frequency|kind|owner)$/.exec(key);
    if (inc && this.registry.hints(pathway.id).people) {
      const owner = rec.get<string>(`income.${inc[1]}.owner`)?.value;
      const name = owner && owner !== SELF ? rec.get<string>(`member.${owner}.first_name`)?.value : undefined;
      const what = { amount: lang === 'es' ? 'ingreso' : 'income', frequency: lang === 'es' ? 'frecuencia del ingreso' : 'how often the income is paid', kind: lang === 'es' ? 'tipo de ingreso' : 'kind of income', owner: lang === 'es' ? 'dueño del ingreso' : 'whose income it is' }[inc[2] as 'amount'];
      if (lang === 'es') return name ? `el ${what} de ${name}` : `su ${what}`;
      return name ? `${name}'s ${what}` : `your ${what}`;
    }
    const fill = pathway.form.fill(this.usable(pathway, rec), this.asOf());
    const field = Object.entries(fill.sources).find(([, ks]) => ks.includes(key))?.[0];
    this.sessionRecord = rec.toJSON();
    const l = field ? this.fieldLabel(pathway, field, lang, fill) : humanize(key);
    return /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(l) && !/ — /.test(l) ? l[0]!.toLowerCase() + l.slice(1) : l;
  }

  private show(v: unknown, lang: Lang): string {
    const R = replies(lang);
    if (v === true) return R.yes;
    if (v === false) return R.no;
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'number') return v.toLocaleString('en-US');
    return String(v);
  }

  private showFact(key: FactKey, v: unknown, lang: Lang): string {
    if (/^income\.\d+\.amount$/.test(key) && typeof v === 'number') return money(v);
    if (/^income\.\d+\.frequency$/.test(key) && typeof v === 'string') return FREQ_WORDS[lang][v] ?? v;
    return this.show(v, lang);
  }

  /** A value as the parent should read it. The digest binds the raw fill; this is its words. */
  private display(pathway: Pathway, id: string, v: FieldValue, lang: Lang, values: Record<string, FieldValue>): string {
    const fromForm = (pathway.form as unknown as FormExtras).display?.(id, v, lang, values);
    if (fromForm !== undefined) return fromForm;
    if (!this.registry.hints(pathway.id).people) return this.show(v, lang);
    if (typeof v === 'string') {
      if (/(^|\.)(dob|date_of_birth|birth_date)$/.test(id)) return dateInWords(v, lang) ?? v;
      if (/frequency$/.test(id) && FREQ_WORDS[lang][v]) return FREQ_WORDS[lang][v]!;
      if (/amount$|income$/.test(id) && /^\d+(\.\d+)?$/.test(v)) return money(Number(v));
    }
    return this.show(v, lang);
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
  private buildStep(pathway: Pathway, fill: FormFill, lang: Lang, rec: FamilyRecord): Step {
    this.sessionRecord = rec.toJSON();
    const fields: Record<string, string> = {};
    for (const [id, v] of Object.entries(fill.values)) {
      let label = this.fieldLabel(pathway, id, lang, fill);
      if (label in fields) label = `${label} (${id})`;
      fields[label] = this.display(pathway, id, v, lang, fill.values);
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
    const step = this.buildStep(pathway, fill, s.lang, rec);
    const before = s.proposal?.stamp.hash;
    let text = this.proposalText(s, pathway, step, fill);
    if (wrap) text = wrap(text);
    else if (before && !prefix) text = this.r(s).updated(text);
    if (prefix) text = `${prefix}\n\n${text}`;
    s.stage = 'proposed';
    s.lastAsked = [];
    s.lastAskText = undefined;
    s.lastAskBase = undefined;
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
      return { text: `${R.resume}\n\n${s.lastAskText ?? this.askText(s, pathway, slots)}`, phase: 'clarifying' };
    }
    return this.advance(conversationId, s, pathway, rec, R.resume);
  }

  /** The first message of a session: what the form is, then the first question. A question in
   * the parent's opening ("what is this?") is answered by it, never read as an answer. */
  private async opening(conversationId: string, s: PathwaySession, pathway: Pathway, rec: FamilyRecord, text: string, m?: Understanding): Promise<EngineTurn> {
    let ex = this.read(text, s, pathway, rec, false);
    if (m) ex = this.merge(ex, this.fromModel(m, text, s, pathway, rec), m, s);
    s.introduced = true;
    const changes = this.apply(conversationId, s, pathway, rec, text, ex);
    const faq = this.faq(text, s, pathway, ['what', 'must', 'help']);
    const R = this.r(s);
    const prefix = [changes.length ? R.corrected(changes) : '', ...faq].filter(Boolean).join(' ') || undefined;
    const t = await this.advance(conversationId, s, pathway, rec);
    const first = prefix ? `${prefix}\n\n${t.text}` : t.text;
    return { ...t, text: s.stage === 'asking' || s.stage === 'proposed' ? this.introText(s, pathway, first) : first };
  }

  private introText(s: PathwaySession, pathway: Pathway, first: string): string {
    const hints = this.registry.hints(pathway.id);
    const about = hints.intro?.[s.lang];
    const R = this.r(s);
    return about ? R.intro(hints.introName?.[s.lang] ?? pathway.title[s.lang], about, first) : R.start(pathway.title[s.lang], first);
  }

  // ── the yes, the lane, the result ──────────────────────────────────────────

  private async approve(conversationId: string, s: PathwaySession, pathway: Pathway, rec: FamilyRecord, how: string): Promise<EngineTurn> {
    const R = this.r(s);
    if (!s.proposal) return this.propose(s, pathway, rec);
    const fill = this.buildFill(pathway, rec);
    const step = this.buildStep(pathway, fill, s.lang, rec);
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
        attest: (fields: string[], how?: AttestHow) =>
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
      const how = a.how?.link ? this.r(s).attestLink(a.how.link) : a.how?.file ? this.r(s).attestFile(a.how.file) : undefined;
      s.attesting = { fields: a.fields, ...(how ? { how } : {}), asked: 1 };
      const names = a.fields.map((f) => this.registry.hints(pathway.id).labels?.[f]?.[s.lang] ?? this.label(pathway, f, s.lang));
      return { text: this.r(s).attest(names, how), phase: 'confirming' };
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
      console.warn(`[pathway] lane ${s.lane} did not file: ${r.detail ?? r.status}`);
      s.outcome = 'failed';
      this.close(s, 'failed');
      return { text: R.failed(summary), phase: 'done', resolved: false };
    }
    return { ...this.finish(s, pathway, text), resolved: s.outcome === 'done_confirmed' };
  }

  /** End the job and offer what it opens next (only what we can actually start). */
  private finish(s: PathwaySession, pathway: Pathway, text: string): EngineTurn {
    const offers = pathway.opensNext.filter((id) => id !== pathway.id && this.registry.pathway(id));
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

  private pause(s: PathwaySession, from: PathwayStage = s.stage, reason?: PathwaySession['pauseReason']): undefined {
    if (s.stage !== 'paused') s.pausedFrom = from;
    s.stage = 'paused';
    s.pauseReason = reason;
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
    return (this.opts.isYes ?? ((t: string) => DEFAULT_YES.test(strip(t))))(text) || clearYes(text);
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

export type { Text };

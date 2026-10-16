import type { FactKey, FamilyRecord, PayFrequency } from '../family/facts.js';
import { hash, membersOf, rng, type HarnessFamily, type HarnessLang, type PersonaId } from './families.js';

/**
 * The scripted parent (docs/PATHWAYS.md §4.3): answers the agent from the family's true record,
 * deterministically, with the messiness turned up or down. Free, so it runs on every family
 * and every seed; the field-level scores come from it.
 *
 * How it understands the agent: keyword matching (English and Spanish, accents ignored) over
 * the agent's question sentences, to a topic (name, birth date, school, grade, income, how
 * often…) and a member (a child named in the question, "your second child", "your husband",
 * "you"; otherwise the next child it hasn't answered for). See `matchQuestion`. Its limits are
 * the limits of keywords: a question phrased in a way no pattern covers gets "I'm not sure what
 * you mean", which the scoreboard counts, and a proposal is checked only for values whose
 * label it recognises.
 */

export type Topic =
  | 'attest'
  | 'case_number'
  | 'student_id'
  | 'dob'
  | 'foster'
  | 'homeless'
  | 'migrant'
  | 'email'
  | 'phone'
  | 'zip'
  | 'address'
  | 'frequency'
  | 'income'
  | 'benefits'
  | 'school'
  | 'grade'
  | 'student_names'
  | 'household'
  | 'name'
  | 'age';

/** Lowercase, accents stripped, so "¿Cuál es su fecha de nacimiento?" ≈ "cual es su fecha de nacimiento". */
export function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** In priority order: the more specific pattern wins where two could match the same words. */
const TOPICS: Array<[Topic, RegExp]> = [
  ['attest', /\b(signature|e-?sign|sign (it|here|the form|this|below)|please sign|certify|attest|\bfirm(a|ar|e|elo)\b|certifica)/],
  ['case_number', /case (number|#|no\b)|numero de caso|# de caso|calfresh (number|case)/],
  ['student_id', /student (id|number)|\bid number|numero de (estudiante|identificacion)|id (del|de) (estudiante|alumno)|matricula/],
  ['dob', /birth ?(date|day)|date of birth|\bdob\b|\bborn\b|fecha de nacimiento|nacio|nacimiento|cumpleanos/],
  ['foster', /foster|crianza|hogar temporal|tutela/],
  ['homeless', /homeless|without (a )?(home|place)|sin hogar|sin casa|stable housing|vivienda (estable|fija)|shelter|refugio/],
  ['migrant', /migrant|migrante|farm ?work|agricultural|trabajo agricola|en el campo/],
  ['email', /e-?mail|correo/],
  ['phone', /phone|\bcell\b|telefono|celular/],
  ['zip', /\bzip\b|codigo postal/],
  ['address', /address|where do you live|street|\bcity\b|what town|direccion|domicilio|donde vive|\bciudad\b/],
  ['frequency', /how often|how frequently|frequency|every (week|two weeks|month)|per (week|month|paycheck)|\b(bi)?weekly\b|monthly|cada cuanto|con que frecuencia|cada semana|cada (dos|2) semanas|semanal|quincenal|mensual/],
  ['income', /income|\bearn|\bmake\b(?! sure)|\bmaking\b|salary|wages|paycheck|how much|ingreso|\bgana|sueldo|salario|cuanto (gana|recibe|cobra)/],
  ['benefits', /calfresh|\bsnap\b|food stamps|calworks|\btanf\b|medi-?cal|cupones|estampillas|beneficios/],
  ['school', /(which|what) school|school (does|do|is|are|they|she|he|name)|\battend|goes to|go to school|(en|a) que escuela|nombre de la escuela|escuela (va|asiste)|\basiste/],
  ['grade', /\bgrade\b|\bgrado\b|what year (is|are)/],
  ['student_names', /names? of (all )?(your |the )?(kids|children|students)|(kids|children|students)('s)? (full )?names|list (the |your |all )?(kids|children|students)|nombres? de (sus |tus |los )?(hijos|ninos|estudiantes)|como se llaman (sus|tus) hijos/],
  ['household', /who (lives|else lives|is in your household)|household members|members of (your|the) household|how many people|everyone (who|in)|quien(es)? (vive|viven)|cuantas personas|miembros del hogar|personas (en|viven en) (su|tu) (casa|hogar)/],
  ['name', /\bname\b|nombre|como se llama|como te llamas/],
  ['age', /how old|\bage\b|\bedad\b|cuantos anos/],
];

export interface Asked {
  topic: Topic;
  /** The member the question is about, when it names one. */
  member?: string;
}

const KID = /\b(child|children|kid|kids|son|daughter|student|students|hijo|hija|hijos|hijas|nino|nina|ninos|estudiante|estudiantes|alumno|alumna)\b/;
const SPOUSE = /\b(spouse|partner|husband|wife|esposo|esposa|pareja|marido)\b/;
const OTHER_ADULT = /\b(grandm\w*|grandf\w*|abuel\w*|other adult|otro adulto|your (mom|mother|dad|father)|su (mama|madre|papa|padre))\b/;
const YOU = /\b(you|your|yours|su|tu|usted)\b/;
const ORDINALS: Array<[RegExp, number]> = [
  [/\b(first|1st|primer|primera|primero)\b/, 1],
  [/\b(second|2nd|segund[oa])\b/, 2],
  [/\b(third|3rd|tercer|tercera|tercero)\b/, 3],
  [/\b(fourth|4th|cuart[oa])\b/, 4],
  [/\b(fifth|5th|quint[oa])\b/, 5],
  [/\b(sixth|6th|sext[oa])\b/, 6],
];

/**
 * The topics a piece of agent text asks about, in the order they appear, each with the member
 * it names (if any). Questions are preferred: when the text has question sentences, only they
 * are read, so "I've got Sofía's school. What's her grade?" asks for the grade.
 */
export function matchQuestion(text: string, rec?: FamilyRecord): Asked[] {
  const t = norm(text);
  const sentences = t.split(/(?<=[?.!\n])\s+|(?=¿)/).map((s) => s.trim()).filter(Boolean);
  const qs = sentences.filter((s) => s.includes('?') || s.startsWith('¿') || /^(please |por favor )?(tell me|send me|what|which|how|when|where|who|dime|digame|cual|que|como|cuando|donde|quien|escriba|mande)/.test(s));
  const scope = qs.length ? qs : sentences;
  const found: Array<Asked & { at: number }> = [];
  scope.forEach((s, si) => {
    for (const [topic, re] of TOPICS) {
      const m = re.exec(s);
      if (!m) continue;
      if (found.some((f) => f.topic === topic)) continue;
      // "school" inside "student id" or "case number" sentences is not a school question.
      found.push({ topic, member: rec ? resolveMember(s, rec) : undefined, at: si * 10_000 + m.index });
    }
  });
  // "date of birth" also says "name" in "name and date of birth"; both are real. But a bare
  // "school" match inside a grade question ("what grade is she in at school") is not.
  const topics = new Set(found.map((f) => f.topic));
  return found
    .filter((f) => !(f.topic === 'name' && (topics.has('student_names') || topics.has('household'))))
    .filter((f) => !(f.topic === 'age' && topics.has('dob')))
    .filter((f) => !(f.topic === 'benefits' && topics.has('case_number')))
    .sort((a, b) => a.at - b.at)
    .map(({ topic, member }) => (member ? { topic, member } : { topic }));
}

/** The member a sentence is about, if it says. */
export function resolveMember(sentence: string, rec: FamilyRecord): string | undefined {
  const s = norm(sentence);
  const ms = membersOf(rec);
  let best: { id: string; at: number } | undefined;
  for (const m of ms) {
    if (!m.first) continue;
    const i = s.search(new RegExp(`\\b${norm(m.first).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`));
    if (i >= 0 && (!best || i < best.at)) best = { id: m.id, at: i };
  }
  if (best) return best.id;
  const students = ms.filter((m) => m.student);
  const n = /\b(?:s|student|estudiante|child|kid|hijo|nino)\s*(?:#\s*)?(\d)\b/.exec(s) ?? /\bstudent_(\d)/.exec(s);
  if (n) return students[Number(n[1]) - 1]?.id;
  if (KID.test(s)) {
    for (const [re, k] of ORDINALS) if (re.test(s)) return students[k - 1]?.id;
    const byAge = [...students].sort((a, b) => ageOf(rec, b.id) - ageOf(rec, a.id));
    if (/\b(oldest|mayor)\b/.test(s)) return byAge[0]?.id;
    if (/\b(youngest|menor|mas chic[oa])\b/.test(s)) return byAge[byAge.length - 1]?.id;
    return undefined;
  }
  const a = /\b(?:member|adult|adulto)\s*(?:#\s*)?_?(\d)\b/.exec(s) ?? /\bmember_(\d)/.exec(s);
  const adults = ms.filter((m) => !m.student);
  if (a) return adults[Number(a[1]) - 1]?.id;
  if (SPOUSE.test(s)) return ms.find((m) => m.relationship === 'spouse')?.id;
  if (OTHER_ADULT.test(s)) return ms.find((m) => m.relationship === 'parent' || m.relationship === 'other')?.id;
  if (YOU.test(s)) return ms.find((m) => m.relationship === 'self')?.id;
  return undefined;
}

function ageOf(rec: FamilyRecord, id: string): number {
  return Number(rec.get(`member.${id}.age`)?.value ?? 0);
}

// ── Rendering the truth the way a parent says it ─────────────────────────────

const MONTHS: Record<HarnessLang, string[]> = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
};
const FREQ: Record<HarnessLang, Record<PayFrequency, string>> = {
  en: { weekly: 'every week', biweekly: 'every two weeks', twice_monthly: 'twice a month', monthly: 'a month', annual: 'a year' },
  es: { weekly: 'cada semana', biweekly: 'cada dos semanas', twice_monthly: 'dos veces al mes', monthly: 'al mes', annual: 'al año' },
};
const money = (n: number) => `$${n.toLocaleString('en-US')}`;

function sayDate(iso: string, lang: HarnessLang, style: 'words' | 'us' | 'es_slash'): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  if (style === 'us') return `${m}/${d}/${y}`;
  // A Spanish speaker's 02/03/2016 is the 2nd of March. A real trap on a US form.
  if (style === 'es_slash') return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  return lang === 'es' ? `${d} de ${MONTHS.es[m - 1]} de ${y}` : `${MONTHS.en[m - 1]} ${d}, ${y}`;
}

/** Parse a date in any of the ways a review might show one. Slashes read as US (MM/DD). */
export function parseDate(text: string): string | undefined {
  const t = norm(text);
  let m = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(t);
  if (m) return iso(+m[1]!, +m[2]!, +m[3]!);
  m = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/.exec(t);
  if (m) return iso(year(+m[3]!), +m[1]!, +m[2]!);
  for (const lang of ['en', 'es'] as const) {
    for (let i = 0; i < 12; i++) {
      const name = norm(MONTHS[lang][i]!);
      const re = lang === 'en' ? new RegExp(`\\b${name}\\s+(\\d{1,2}),?\\s+(\\d{4})`) : new RegExp(`\\b(\\d{1,2})\\s+de\\s+${name}\\s+(?:de(?:l)?\\s+)?(\\d{4})`);
      const mm = re.exec(t);
      if (mm) return lang === 'en' ? iso(+mm[2]!, i + 1, +mm[1]!) : iso(+mm[2]!, i + 1, +mm[1]!);
    }
  }
  return undefined;
  function year(y: number) {
    return y < 100 ? (y > 30 ? 1900 + y : 2000 + y) : y;
  }
  function iso(y: number, mo: number, d: number) {
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
}

export function parseFrequency(text: string): PayFrequency | undefined {
  const t = norm(text);
  if (/biweekly|bi-weekly|every (two|2) weeks|cada (dos|2) semanas|quincenal|catorcenal/.test(t)) return 'biweekly';
  if (/twice (a|per) month|2x|semi-?monthly|twice_monthly|dos veces al mes/.test(t)) return 'twice_monthly';
  if (/weekly|every week|per week|a week|cada semana|semanal|por semana/.test(t)) return 'weekly';
  if (/monthly|a month|per month|every month|al mes|mensual|por mes|cada mes/.test(t)) return 'monthly';
  if (/annual|yearly|a year|per year|al ano|anual/.test(t)) return 'annual';
  return undefined;
}

const numbers = (text: string) => [...text.replace(/(\d),(\d{3})/g, '$1$2').matchAll(/\$?\s*(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
const digits = (s: string) => s.replace(/\D/g, '');

// ── The parent ───────────────────────────────────────────────────────────────

export interface ParentOptions {
  family: HarnessFamily;
  persona?: PersonaId;
  lang?: HarnessLang;
  /** 0 = clean answers whatever the persona; 1 = the persona's own habit (default); 2-3 = more
   * habits at random, and at 3 a Spanish-style DD/MM date. */
  messiness?: 0 | 1 | 2 | 3;
  seed?: number;
  /** Asked the same thing this many times, the parent gives up. Default 3 (impatient: 2). */
  giveUpAfter?: number;
  /** Called when the agent asks the parent to sign or certify. The parent does it themselves. */
  attest?: (fields: string[]) => void | Promise<void>;
  /** Say yes to a proposal that shows no values to check (default false: ask to see them). */
  trusting?: boolean;
}

export interface ParentReply {
  text: string;
  /** Facts this reply stated (true values, or a wrong one the parent will correct). */
  keys: FactKey[];
  /** The parent approved a proposal whose every checkable value matched their truth. */
  approved?: boolean;
  /** Keys whose shown value was wrong and the parent corrected. */
  corrected?: FactKey[];
  attested?: boolean;
  gaveUp?: boolean;
  /** The parent considers the conversation over (done, covered, handed off). */
  done?: boolean;
}

export interface ParentStats {
  turns: number;
  repeatedQuestions: number;
  repeated: FactKey[];
  approvals: number;
  corrections: FactKey[];
  unmatched: number;
  blindProposals: number;
  attested: boolean;
  gaveUp: boolean;
}

export interface SimulatedParent {
  readonly id: string;
  readonly lang: HarnessLang;
  opening(): string;
  reply(agentText: string): Promise<ParentReply>;
  stats(): ParentStats;
}

const OPENINGS: Record<HarnessLang, Partial<Record<PersonaId, string>> & { default: string; psusd: string }> = {
  en: {
    default: 'I got a paper about school lunch income, can you help?',
    psusd: 'Palm Springs Unified sent me an income form for school meals. Can you help me do it?',
    straightforward: 'I got a paper from school about lunch and our income. Can you help me fill it out?',
    asks_first: 'what is this school lunch income form and do I have to do it? can you help',
    terse: 'school lunch income form help',
    impatient: 'need help with the school meal income form, quick please',
  },
  es: {
    default: 'Me llegó un papel de la escuela sobre el almuerzo y los ingresos. ¿Me ayuda a llenarlo?',
    psusd: 'Palm Springs Unified me mandó un formulario de ingresos para las comidas escolares. ¿Me ayuda?',
    asks_first: '¿Qué es este formulario de ingresos del almuerzo? ¿Tengo que llenarlo? ¿Me ayuda?',
    terse: 'ayuda con el formulario del almuerzo',
    impatient: 'necesito ayuda con el formulario de ingresos de la escuela, rápido por favor',
  },
};

const SIDE_QUESTIONS: Record<HarnessLang, string[]> = {
  en: ['Also, does this affect my immigration status?', 'Also my son is sick and won’t be at school tomorrow.', 'Quick question, will the school see how much we make?'],
  es: ['Otra cosa, ¿esto afecta mi estatus migratorio?', 'Y mi hijo está enfermo, mañana no va a la escuela.', 'Una pregunta, ¿la escuela va a ver cuánto ganamos?'],
};

const YES: Record<HarnessLang, string[]> = { en: ['yes', 'yes, send it', 'go ahead', 'yes please'], es: ['sí', 'dale', 'sí, mándalo', 'sí, está bien'] };

/** A promise about a submit that hasn't happened ("nothing gets submitted without your OK",
 * "before anything is sent") is not a report that it happened; DONE_RE skips these. */
const NOT_YET_RE = /\b(before|until) (anything|it|this|the form|the application) (gets|is|will be|can be) (submitted|sent|filed)|\bnothing (gets|is|will be|will get|goes|is ever) (submitted|sent|filed|out)|\b(won'?t|will not|never|don'?t|do not) (be )?(submit|send|file)\w*|\bantes de (enviar|mandar|presentar)\w*|\bno (se )?(envia|manda|enviare|mandare)\w*/g;

const DONE_RE = /\b(done!|all set|submitted|it'?s in|sent it|been sent|filed it|you'?re covered|already (covered|qualif|certified|approved|get free)|automatically (qualif|get|receive)|no need to (fill|send)|you don'?t need to (fill|send|do)|listo|ya (lo )?(envie|mande|esta enviado)|ya (califica|esta cubiert|recibe)|no (necesita|tiene que) llenar)/;
const HANDOFF_RE = /\b(talk to (a|someone)|real person|call the (school|office|district)|contact (the|your) (school|office|district)|a (staff member|person) will|llame a la (escuela|oficina)|hable con (alguien|una persona))/;
const PROPOSAL_RE = /\b(say|reply|text) (yes|si)\b|to confirm\b|\bconfirm\?|want me to (submit|send|file|go ahead)|shall i (submit|send|file)|should i (submit|send|file)|ok(ay)? to (send|submit|file)|go ahead\?|quiere que (lo )?(envie|mande|presente)|desea que (lo )?(envie|mande)|lo (envio|mando|presento)\?|diga (que )?si\b|responda si|para confirmar/;
const CONFIRM_RE = /\b(is that (right|correct)|did i get that right|right\?|correct\?)|(es|esta) correcto|verdad\?|cierto\?/;

type Volunteer = { topic: Topic; member?: string };

export class ScriptedParent implements SimulatedParent {
  readonly id: string;
  readonly lang: HarnessLang;
  private readonly rec: FamilyRecord;
  private readonly persona: PersonaId;
  private readonly mess: number;
  private readonly r: () => number;
  private readonly giveUpAfter: number;
  private readonly attestCb?: ParentOptions['attest'];

  private answered = new Set<FactKey>();
  private deferred = new Set<FactKey>();
  private askCount = new Map<FactKey, number>();
  private repeatedKeys: FactKey[] = [];
  private corrections: FactKey[] = [];
  private pendingCorrection?: { key: FactKey; text: string };
  private wrongOnce = new Set<FactKey>();
  private turns = 0;
  private approvals = 0;
  private unmatched = 0;
  private blind = 0;
  private attested = false;
  private gaveUp = false;
  private sideAsked = false;
  private outOfOrderDone = false;
  private lastIncome?: number;

  constructor(private readonly o: ParentOptions) {
    this.rec = o.family.record;
    this.persona = o.persona ?? o.family.persona;
    this.lang = o.lang ?? o.family.lang;
    this.mess = o.messiness ?? 1;
    this.r = rng(hash(`${o.family.id}:${this.persona}:${o.seed ?? 0}`));
    this.giveUpAfter = o.giveUpAfter ?? (this.persona === 'impatient' ? 2 : 3);
    this.attestCb = o.attest;
    this.id = `scripted:${this.persona}:${this.lang}:m${this.mess}${o.trusting ? ':trusting' : ''}`;
  }

  /** Does the parent show this habit now? The persona's own habit from messiness 1, any habit
   * at random from 2. */
  private habit(p: PersonaId, base = 1): boolean {
    if (this.mess <= 0) return false;
    if (this.persona === p) return this.r() < base;
    return this.mess >= 2 && this.r() < (this.mess === 2 ? 0.15 : 0.3);
  }

  opening(): string {
    const o = OPENINGS[this.lang];
    if (this.mess > 0 && o[this.persona]) return o[this.persona]!;
    return this.o.family.district === 'psusd' && this.r() < 0.5 ? o.psusd : o.default;
  }

  stats(): ParentStats {
    return {
      turns: this.turns,
      repeatedQuestions: this.repeatedKeys.length,
      repeated: [...this.repeatedKeys],
      approvals: this.approvals,
      corrections: [...this.corrections],
      unmatched: this.unmatched,
      blindProposals: this.blind,
      attested: this.attested,
      gaveUp: this.gaveUp,
    };
  }

  async reply(agentText: string): Promise<ParentReply> {
    this.turns++;
    // A correction owed from an earlier message ("oh wait, it's $1,650, not $1,750") goes first
    // in this one; one made in this message waits for the next.
    const owed = this.pendingCorrection;
    this.pendingCorrection = undefined;
    const out = await this.compose(agentText);
    if (owed && !out.done && !out.gaveUp && !out.approved) {
      out.text = `${owed.text} ${out.text}`.trim();
      out.keys.push(owed.key);
      out.corrected = [...(out.corrected ?? []), owed.key];
      this.corrections.push(owed.key);
    } else if (owed) this.pendingCorrection ??= owed;
    if (out.gaveUp) this.gaveUp = true;
    return out;
  }

  private giveUp(): ParentReply {
    return { text: this.lang === 'es' ? 'Olvídelo, lo lleno yo en papel.' : "Forget it, I'll just fill it out on paper.", keys: [], gaveUp: true, done: true };
  }

  private async compose(agentText: string): Promise<ParentReply> {
    const t = norm(agentText);
    const asked = matchQuestion(agentText, this.rec);

    // 1. Asked to sign or certify: the parent does it, through their own hand.
    if (asked.some((a) => a.topic === 'attest')) {
      if (this.attested) {
        this.bumpRepeat('attestation');
        if (this.tooMany()) return this.giveUp();
        return { text: this.lang === 'es' ? 'Ya firmé.' : 'I already signed it.', keys: [] };
      }
      this.answered.add('attestation');
      if (this.attestCb) await this.attestCb(['signature']);
      this.attested = true;
      return { text: this.lang === 'es' ? 'Listo, ya firmé.' : 'Done, I signed it.', keys: [], attested: true };
    }

    // 2. A proposal: yes only if every value it shows that the parent can check is true.
    if (PROPOSAL_RE.test(t)) return this.onProposal(agentText);

    // 3. Done, covered, or handed off, with nothing asked: the conversation is over for them.
    if (!asked.length && (DONE_RE.test(t.replace(NOT_YET_RE, ' ')) || HANDOFF_RE.test(t))) {
      return { text: this.lang === 'es' ? '¡Gracias!' : 'Thank you!', keys: [], done: true };
    }

    // 4. "Sofía was born March 2, 2016, right?": check it like a one-line proposal.
    if (CONFIRM_RE.test(t) && asked.length) {
      const res = this.check([{ label: agentText, value: agentText }]);
      if (res.mismatches.length) return this.correct(res.mismatches);
      if (res.matches) return { text: this.lang === 'es' ? 'Sí, correcto.' : 'Yes, that’s right.', keys: [] };
    }

    const questions = asked.filter((a) => a.topic !== 'attest');
    if (!questions.length) {
      this.unmatched++;
      if (this.unmatched > this.giveUpAfter + 1) return this.giveUp();
      if (agentText.includes('?') || agentText.includes('¿')) {
        return { text: this.lang === 'es' ? 'No entiendo qué necesita.' : "I'm not sure what you mean.", keys: [] };
      }
      return { text: this.lang === 'es' ? '¿Entonces me ayuda a llenar el formulario?' : 'So can you help me fill out the form?', keys: [] };
    }

    // 5. Answer. Terse parents answer one thing; most answer what was asked (up to two).
    const parts: string[] = [];
    const keys: FactKey[] = [];
    const n = this.persona === 'terse' && this.mess > 0 ? 1 : 2;
    let deferredAny = false;
    for (const q of questions.slice(0, n)) {
      const member = q.member ?? this.defaultMember(q.topic);
      const key = this.keyFor(q.topic, member, t);
      // Out of order: once, volunteer something else instead of answering.
      if (!this.outOfOrderDone && this.habit('out_of_order', 1) && !this.answered.has(key)) {
        this.outOfOrderDone = true;
        const v = this.volunteer([key]);
        if (v) {
          const said = this.say(v.topic, v.member, t);
          if (said) {
            parts.push(said.text);
            keys.push(said.key);
            this.answered.add(said.key);
            continue;
          }
        }
      }
      if (this.answered.has(key) && !this.deferred.has(key)) {
        this.bumpRepeat(key);
        if (this.tooMany(key)) return this.giveUp();
      }
      // "Not sure" first, then the answer on the follow-up.
      const unsureTopics: Topic[] = ['income', 'student_id', 'case_number', 'dob'];
      if (!this.answered.has(key) && !this.deferred.has(key) && unsureTopics.includes(q.topic) &&
          ((this.persona === 'needs_time' && this.habit('needs_time', 0.6)) || (q.topic === 'income' && this.habit('unsure_income', 1)) || (this.persona !== 'needs_time' && this.persona !== 'unsure_income' && this.habit('needs_time', 0)))) {
        this.deferred.add(key);
        this.answered.add(key);
        deferredAny = true;
        parts.push(this.lang === 'es' ? 'Mmm, no estoy segura, déjeme ver.' : "Hmm, I'm not sure, let me check.");
        continue;
      }
      this.deferred.delete(key);
      const said = this.say(q.topic, member, t);
      if (!said) continue;
      parts.push(said.text);
      keys.push(said.key);
      this.answered.add(said.key);
      this.answered.add(key);
    }
    if (!parts.length) {
      this.unmatched++;
      return { text: this.lang === 'es' ? 'No sé.' : "I don't know.", keys };
    }
    // Two at once: add a fact nobody asked for yet.
    if (!deferredAny && this.habit('two_at_once', 0.7)) {
      const v = this.volunteer(keys);
      if (v) {
        const said = this.say(v.topic, v.member, t);
        if (said) {
          parts.push(said.text);
          keys.push(said.key);
          this.answered.add(said.key);
        }
      }
    }
    if (this.turns === 1 && this.habit('asks_first', 1)) parts.unshift(this.lang === 'es' ? '¿Qué necesita de mí para esto?' : 'What do you need from me for this?');
    if (!this.sideAsked && this.turns >= 2 && this.habit('side_request', 0.8)) {
      this.sideAsked = true;
      parts.push(SIDE_QUESTIONS[this.lang][Math.floor(this.r() * SIDE_QUESTIONS[this.lang].length)]!);
    }
    return { text: parts.join(' '), keys };
  }

  private bumpRepeat(key: FactKey): void {
    this.askCount.set(key, (this.askCount.get(key) ?? 0) + 1);
    this.repeatedKeys.push(key);
  }

  private tooMany(key?: FactKey): boolean {
    if (key && (this.askCount.get(key) ?? 0) >= this.giveUpAfter) return true;
    return this.repeatedKeys.length >= this.giveUpAfter * 2;
  }

  private students(): string[] {
    return membersOf(this.rec).filter((m) => m.student).map((m) => m.id);
  }
  private self(): string {
    return membersOf(this.rec).find((m) => m.relationship === 'self')?.id ?? this.rec.memberIds()[0]!;
  }

  /** Who a question with no member in it is about: the next child not yet answered for, or the parent. */
  private defaultMember(topic: Topic): string | undefined {
    const field = { name: 'first_name', dob: 'dob', age: 'age', school: 'school', grade: 'grade', student_id: 'student_id' }[topic as string];
    if (!field) return undefined;
    if (topic === 'name' || topic === 'dob' || topic === 'age') {
      if (!this.answered.has(`member.${this.self()}.${field}`) && topic === 'name') return this.self();
    }
    return this.students().find((id) => !this.answered.has(`member.${id}.${field}`)) ?? this.students()[0];
  }

  private incomeFor(member: string | undefined, t: string): number | undefined {
    const idx = this.rec.incomeIndexes();
    const owned = member ? idx.filter((n) => this.rec.get(`income.${n}.owner`)?.value === member) : idx;
    const wantsOther = /\b(other|else|more|another|otro|otra|mas|algun)\b/.test(t);
    const next = owned.find((n) => !this.answered.has(`income.${n}.amount`));
    if (next !== undefined) return next;
    if (wantsOther) return undefined;
    return this.lastIncome ?? owned[0];
  }

  private keyFor(topic: Topic, member: string | undefined, t: string): FactKey {
    const m = member ?? this.self();
    switch (topic) {
      case 'name': return `member.${m}.first_name`;
      case 'dob': return `member.${m}.dob`;
      case 'age': return `member.${m}.age`;
      case 'school': return `member.${m}.school`;
      case 'grade': return `member.${m}.grade`;
      case 'student_id': return `member.${m}.student_id`;
      case 'income': {
        const n = this.incomeFor(member, t);
        return n === undefined ? 'household.income.other' : `income.${n}.amount`;
      }
      case 'frequency': {
        const n = this.lastIncome ?? this.incomeFor(member, t);
        return n === undefined ? 'household.income.other' : `income.${n}.frequency`;
      }
      case 'case_number':
      case 'benefits': return 'household.case_number';
      case 'foster':
      case 'homeless':
      case 'migrant': return member ? `member.${member}.${topic}` : `household.${topic}`;
      case 'email': return 'contact.email';
      case 'phone': return 'contact.phone';
      case 'address': return 'contact.street';
      case 'zip': return 'contact.zip';
      case 'household': return 'household.members';
      case 'student_names': return 'household.students';
      case 'attest': return 'attestation';
    }
  }

  /** A fact the parent offers unasked: contact first, then the next child's school. */
  private volunteer(exclude: FactKey[]): Volunteer | undefined {
    const options: Volunteer[] = [{ topic: 'email' }, { topic: 'phone' }, { topic: 'address' }, ...this.students().map((id) => ({ topic: 'school' as Topic, member: id }))];
    return options.find((v) => {
      const k = this.keyFor(v.topic, v.member, '');
      return !this.answered.has(k) && !exclude.includes(k);
    });
  }

  private v<T = unknown>(key: FactKey): T | undefined {
    return this.rec.get<T>(key)?.value;
  }

  private fullName(id: string): string {
    const mi = this.v<string>(`member.${id}.middle_initial`);
    return [this.v(`member.${id}.first_name`), mi ? `${mi}.` : '', this.v(`member.${id}.last_name`)].filter(Boolean).join(' ');
  }

  /** The parent's words for one fact. Undefined when the question doesn't fit this family. */
  private say(topic: Topic, member: string | undefined, t: string): { text: string; key: FactKey } | undefined {
    const es = this.lang === 'es';
    const key = this.keyFor(topic, member, t);
    const m = member ?? this.self();
    const first = String(this.v(`member.${m}.first_name`) ?? '');
    switch (topic) {
      case 'name': {
        const name = this.fullName(m);
        if (m === this.self()) return { key, text: es ? `Me llamo ${name}.` : `I'm ${name}.` };
        return { key, text: es ? `Se llama ${name}.` : `${name}.` };
      }
      case 'student_names': {
        const names = this.students().map((id) => this.fullName(id));
        const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} ${es ? 'y' : 'and'} ${names[names.length - 1]}` : names[0]!;
        for (const id of this.students()) this.answered.add(`member.${id}.first_name`);
        return { key, text: es ? `Mis hijos son ${list}.` : `My kids are ${list}.` };
      }
      case 'household': {
        const ms = membersOf(this.rec);
        const rel = (x: (typeof ms)[number]) => {
          const age = this.v<number>(`member.${x.id}.age`);
          if (x.relationship === 'self') return es ? `yo (${age})` : `me (${age})`;
          const word = x.relationship === 'spouse' ? (es ? 'mi esposo' : 'my husband') : x.relationship === 'child' ? (es ? 'mi hijo/a' : 'my kid') : es ? 'mi mamá' : 'my mom';
          return `${word} ${this.fullName(x.id)} (${age})`;
        };
        const parts = ms.map(rel);
        return { key, text: (es ? 'Vivimos ' : "It's ") + `${parts.slice(0, -1).join(', ')}${parts.length > 1 ? (es ? ' y ' : ' and ') : ''}${parts[parts.length - 1]}.` };
      }
      case 'dob': {
        const dob = this.v<string>(`member.${m}.dob`);
        if (!dob) return undefined;
        const style = this.mess >= 3 && es && this.r() < 0.5 ? 'es_slash' : this.mess >= 2 && this.r() < 0.3 ? 'us' : 'words';
        const d = sayDate(dob, this.lang, style);
        if (m === this.self()) return { key, text: es ? `Nací el ${d}.` : `I was born ${d}.` };
        return { key, text: es ? `${first} nació el ${d}.` : `${first} was born ${d}.` };
      }
      case 'age': {
        const age = this.v<number>(`member.${m}.age`);
        if (age === undefined) return undefined;
        return { key, text: es ? `${m === this.self() ? 'Tengo' : `${first} tiene`} ${age} años.` : `${m === this.self() ? "I'm" : `${first} is`} ${age}.` };
      }
      case 'school': {
        const school = this.v<string>(`member.${m}.school`);
        if (!school) return undefined;
        return { key, text: es ? `${first} va a ${school}.` : `${first} goes to ${school}.` };
      }
      case 'grade': {
        const g = this.v<string>(`member.${m}.grade`);
        if (!g) return undefined;
        const en = g === 'K' ? 'kindergarten' : g === 'TK' ? 'TK' : `${g}${['1', '2', '3'].includes(g) ? ['st', 'nd', 'rd'][Number(g) - 1] : 'th'} grade`;
        const sp = g === 'K' ? 'kínder' : g === 'TK' ? 'TK' : `${g}º grado`;
        return { key, text: es ? `${first} está en ${sp}.` : `${first} is in ${en}.` };
      }
      case 'student_id': {
        const id = this.v<string>(`member.${m}.student_id`);
        if (!id) return undefined;
        return { key, text: es ? `El número de estudiante de ${first} es ${id}.` : `${first}'s student ID is ${id}.` };
      }
      case 'income': {
        if (this.v('household.income_reported') === false) {
          for (const k of ['household.income.other']) this.answered.add(k);
          return { key: 'household.income_reported', text: es ? 'Ahorita no tenemos ningún ingreso, nadie está trabajando.' : "We don't have any income right now, nobody's working." };
        }
        const n = key.startsWith('income.') ? Number(key.split('.')[1]) : undefined;
        if (n === undefined) return { key, text: es ? 'Es todo lo que ganamos.' : "That's all the income we have." };
        this.lastIncome = n;
        const owner = this.v<string>(`income.${n}.owner`)!;
        const kind = this.v<string>(`income.${n}.kind`)!;
        let amount = this.v<number>(`income.${n}.amount`)!;
        const freq = this.v<PayFrequency>(`income.${n}.frequency`)!;
        // A wrong number now, corrected on the next message.
        if (!this.wrongOnce.has(key) && !this.answered.has(key) && this.habit('corrects_later', 1)) {
          this.wrongOnce.add(key);
          const wrong = amount + 100 * (1 + Math.floor(this.r() * 3));
          this.pendingCorrection = {
            key,
            text: es ? `Ah, perdón, me equivoqué: son ${money(amount)}, no ${money(wrong)}.` : `Oh wait, I got that wrong: it's ${money(amount)}, not ${money(wrong)}.`,
          };
          amount = wrong;
        }
        const who = owner === this.self() ? (es ? 'Yo gano' : 'I make') : this.whoEarns(owner);
        const terse = this.persona === 'terse' && this.mess > 0;
        this.answered.add(`income.${n}.frequency`);
        if (terse) return { key, text: `${money(amount)} ${FREQ[this.lang][freq]}` };
        const what =
          kind === 'self_employment' ? (es ? ` con mi negocio de limpieza; cambia cada mes, más o menos` : ` from my cleaning business; it changes month to month, about`)
            : kind === 'child_support' ? (es ? ' de manutención (child support),' : ' in child support,')
              : kind === 'ssi' ? (es ? ' de SSI,' : ' from SSI,')
                : '';
        return { key, text: `${who}${what} ${money(amount)} ${FREQ[this.lang][freq]}.` };
      }
      case 'frequency': {
        const n = key.startsWith('income.') ? Number(key.split('.')[1]) : undefined;
        if (n === undefined) return undefined;
        const freq = this.v<PayFrequency>(`income.${n}.frequency`)!;
        return { key, text: es ? `Me pagan ${FREQ.es[freq]}.` : `I get paid ${FREQ.en[freq]}.` };
      }
      case 'case_number':
      case 'benefits': {
        const num = this.v<string>('household.case_number');
        const prog = this.v<string>('household.case_program');
        if (!num) return { key, text: es ? 'No, no recibimos CalFresh ni Medi-Cal.' : "No, we don't get CalFresh or Medi-Cal." };
        const label = prog === 'calfresh' ? 'CalFresh' : prog === 'calworks' ? 'CalWORKs' : 'Medi-Cal';
        return { key, text: es ? `Sí, tenemos ${label}. El número de caso es ${num}.` : `Yes, we have ${label}. The case number is ${num}.` };
      }
      case 'foster':
      case 'homeless':
      case 'migrant': {
        const has = (id: string) => (topic === 'foster' ? (this.v<string[]>(`member.${id}.benefits`) ?? []).includes('foster_care') : this.v(`member.${id}.${topic}`) === true);
        const ids = member ? [member] : this.students();
        const yes = ids.filter(has);
        const word = { foster: es ? 'en crianza temporal (foster)' : 'in foster care', homeless: es ? 'sin hogar' : 'homeless', migrant: es ? 'migrante' : 'migrant' }[topic];
        if (!yes.length) return { key, text: es ? `No, ${member ? first : 'ninguno'} ${member ? 'no' : ''} está ${word}.`.replace(/\s+/g, ' ') : `No, ${member ? `${first} isn't` : 'none of them are'} ${word}.` };
        const names = yes.map((id) => this.v(`member.${id}.first_name`)).join(es ? ' y ' : ' and ');
        return { key, text: es ? `Sí, ${names} ${yes.length > 1 ? 'son' : 'es'} ${word}.` : `Yes, ${names} ${yes.length > 1 ? 'are' : 'is'} ${word}.` };
      }
      case 'email':
        return { key, text: es ? `Mi correo es ${this.v('contact.email')}.` : `My email is ${this.v('contact.email')}.` };
      case 'phone':
        return { key, text: es ? `Mi número es ${this.v('contact.phone')}.` : `My number is ${this.v('contact.phone')}.` };
      case 'address':
      case 'zip': {
        const addr = `${this.v('contact.street')}, ${this.v('contact.city')}, ${this.v('contact.state')} ${this.v('contact.zip')}`;
        this.answered.add('contact.street');
        this.answered.add('contact.zip');
        return { key, text: es ? `Vivimos en ${addr}.` : `We live at ${addr}.` };
      }
      case 'attest':
        return undefined;
    }
  }

  private whoEarns(owner: string): string {
    const rel = this.v<string>(`member.${owner}.relationship`);
    const first = this.v<string>(`member.${owner}.first_name`);
    if (this.lang === 'es') return rel === 'spouse' ? `Mi esposo ${first} gana` : rel === 'parent' ? `Mi mamá ${first} recibe` : `${first} gana`;
    return rel === 'spouse' ? `My husband ${first} makes` : rel === 'parent' ? `My mom ${first} gets` : `${first} makes`;
  }

  // ── Proposals ──────────────────────────────────────────────────────────────

  private onProposal(agentText: string): ParentReply {
    const pairs = [...agentText.matchAll(/^\s*(?:[•\-*]\s*)?([^:\n]{1,80}):\s*(\S.*)$/gm)].map((m) => ({ label: m[1]!.trim(), value: m[2]!.trim() }));
    const res = this.check(pairs);
    if (res.mismatches.length) return this.correct(res.mismatches);
    if (res.matches > 0) {
      this.approvals++;
      const yes = YES[this.lang];
      return { text: yes[Math.floor(this.r() * yes.length)]!, keys: [], approved: true };
    }
    this.blind++;
    if (this.o.trusting) {
      // A trusting parent says yes without seeing values. The yes is real, but uninformed:
      // the scoreboard still grades every field that went out.
      this.approvals++;
      return { text: YES[this.lang][0]!, keys: [], approved: true };
    }
    if (this.blind > 2) return this.giveUp();
    return {
      text: this.lang === 'es' ? '¿Qué va a poner exactamente en el formulario? Quiero verlo antes.' : 'What exactly are you going to put on the form? I want to see it first.',
      keys: [],
    };
  }

  private correct(mismatches: Array<{ label: string; key: FactKey; truth: string }>): ParentReply {
    for (const m of mismatches) this.corrections.push(m.key);
    const es = this.lang === 'es';
    const lines = mismatches.map((m) => (es ? `${m.label} no está bien, es ${m.truth}.` : `${m.label} is wrong, it should be ${m.truth}.`));
    return { text: `${es ? 'No.' : 'No,'} ${lines.join(' ')}`, keys: mismatches.map((m) => m.key), corrected: mismatches.map((m) => m.key), approved: false };
  }

  /** Compare each shown value the parent can recognise against their truth. */
  check(pairs: Array<{ label: string; value: string }>): { matches: number; mismatches: Array<{ label: string; key: FactKey; truth: string }> } {
    let matches = 0;
    const mismatches: Array<{ label: string; key: FactKey; truth: string }> = [];
    for (const pair of pairs) {
      const value = pair.value;
      // Raw field ids ("student_1_last") read as labels ("student 1 last name").
      const label = pair.label.replace(/_/g, ' ').replace(/\b(first|last)$/i, '$1 name').replace(/\bfreq$/i, 'frequency');
      const asked = matchQuestion(label, this.rec)[0];
      if (!asked) continue;
      const verdict = this.compare(asked.topic, asked.member, label, value);
      if (verdict === 'unknown') continue;
      if (verdict.ok) matches++;
      else mismatches.push({ label: label.length > 60 ? asked.topic : label, key: verdict.key, truth: verdict.truth });
    }
    return { matches, mismatches };
  }

  private compare(topic: Topic, member: string | undefined, label: string, value: string): 'unknown' | { ok: boolean; key: FactKey; truth: string } {
    const v = norm(value);
    const l = norm(label);
    const self = this.self();
    switch (topic) {
      case 'name': {
        const id = member ?? (/\b(student|child|estudiante|hijo)/.test(l) ? this.students()[0] : self);
        if (!id) return 'unknown';
        const first = norm(String(this.v(`member.${id}.first_name`) ?? ''));
        const last = norm(String(this.v(`member.${id}.last_name`) ?? ''));
        if (/first|nombre de pila|primer nombre/.test(l)) return { ok: v.trim() === first, key: `member.${id}.first_name`, truth: String(this.v(`member.${id}.first_name`)) };
        if (/last|surname|apellido/.test(l)) return { ok: v.trim() === last, key: `member.${id}.last_name`, truth: String(this.v(`member.${id}.last_name`)) };
        return { ok: v.includes(first) && v.includes(last), key: `member.${id}.first_name`, truth: this.fullName(id) };
      }
      case 'dob': {
        const id = member ?? this.students()[0];
        const truth = id ? this.v<string>(`member.${id}.dob`) : undefined;
        const got = parseDate(value);
        if (!truth || !got) return 'unknown';
        return { ok: got === truth, key: `member.${id}.dob`, truth: sayDate(truth, this.lang, 'words') };
      }
      case 'school': {
        const id = member ?? this.students()[0];
        const truth = id ? this.v<string>(`member.${id}.school`) : undefined;
        if (!truth) return 'unknown';
        return { ok: v.includes(norm(truth)), key: `member.${id}.school`, truth };
      }
      case 'grade': {
        const id = member ?? this.students()[0];
        const truth = id ? this.v<string>(`member.${id}.grade`) : undefined;
        if (!truth) return 'unknown';
        const g = /\b(tk|k|kinder\w*|kindergarten)\b/.exec(v) ? (/\btk\b/.test(v) ? 'TK' : 'K') : /(\d{1,2})/.exec(v)?.[1];
        if (!g) return 'unknown';
        return { ok: g === truth, key: `member.${id}.grade`, truth };
      }
      case 'student_id': {
        const id = member ?? this.students()[0];
        const truth = id ? this.v<string>(`member.${id}.student_id`) : undefined;
        if (!truth || !digits(value)) return 'unknown';
        return { ok: digits(value) === digits(truth), key: `member.${id}.student_id`, truth };
      }
      case 'case_number':
      case 'benefits': {
        const truth = this.v<string>('household.case_number');
        const got = value.match(/[A-Za-z]?\d{5,}/)?.[0];
        if (!got) return truth || !/\d/.test(value) ? 'unknown' : { ok: false, key: 'household.case_number', truth: this.lang === 'es' ? 'ninguno' : 'none' };
        return { ok: !!truth && got.toUpperCase() === truth.toUpperCase(), key: 'household.case_number', truth: truth ?? (this.lang === 'es' ? 'ninguno' : 'none') };
      }
      case 'income':
      case 'frequency': {
        const idx = this.rec.incomeIndexes();
        if (this.v('household.income_reported') === false) {
          const nums = numbers(value).filter((x) => x > 0);
          return { ok: nums.length === 0, key: 'household.income_reported', truth: '$0' };
        }
        const owned = member ? idx.filter((n) => this.v(`income.${n}.owner`) === member) : idx;
        if (!owned.length) return 'unknown';
        const nums = numbers(value);
        const freq = parseFrequency(value) ?? (topic === 'frequency' ? parseFrequency(label) : undefined);
        if (topic === 'income' && nums.length) {
          const hit = owned.find((n) => nums.includes(this.v<number>(`income.${n}.amount`)!));
          const n = hit ?? owned[0]!;
          const amount = this.v<number>(`income.${n}.amount`)!;
          const f = this.v<PayFrequency>(`income.${n}.frequency`)!;
          const ok = hit !== undefined && (!freq || freq === f);
          return { ok, key: hit !== undefined && freq && freq !== f ? `income.${n}.frequency` : `income.${n}.amount`, truth: `${money(amount)} ${FREQ[this.lang][f]}` };
        }
        if (freq) {
          const n = owned.length === 1 ? owned[0]! : this.lastIncome ?? owned[0]!;
          const f = this.v<PayFrequency>(`income.${n}.frequency`)!;
          const okAny = owned.some((k) => this.v(`income.${k}.frequency`) === freq);
          return { ok: owned.length === 1 ? f === freq : okAny, key: `income.${n}.frequency`, truth: FREQ[this.lang][f] };
        }
        return 'unknown';
      }
      case 'foster':
      case 'homeless':
      case 'migrant': {
        const yes = /\b(yes|si|true|x|✓|checked|marcado)\b/.test(v);
        const no = /\b(no|false|unchecked|none|ninguno)\b/.test(v);
        if (!yes && !no) return 'unknown';
        const ids = member ? [member] : this.students();
        const truth = ids.some((id) => (topic === 'foster' ? (this.v<string[]>(`member.${id}.benefits`) ?? []).includes('foster_care') : this.v(`member.${id}.${topic}`) === true));
        return { ok: yes === truth, key: member ? `member.${member}.${topic}` : `household.${topic}`, truth: truth ? (this.lang === 'es' ? 'sí' : 'yes') : 'no' };
      }
      case 'email': {
        const got = /[^\s@]+@[^\s@]+\.[a-z]+/i.exec(value)?.[0];
        if (!got) return 'unknown';
        const truth = String(this.v('contact.email'));
        return { ok: got.toLowerCase() === truth.toLowerCase(), key: 'contact.email', truth };
      }
      case 'phone': {
        const truth = String(this.v('contact.phone'));
        if (digits(value).length < 7) return 'unknown';
        return { ok: digits(value).endsWith(digits(truth).slice(-10)), key: 'contact.phone', truth };
      }
      case 'address':
      case 'zip': {
        const street = norm(String(this.v('contact.street')));
        const zip = String(this.v('contact.zip'));
        if (topic === 'zip' || /zip|postal/.test(l)) {
          const z = /\b\d{5}\b/.exec(value)?.[0];
          if (!z) return 'unknown';
          return { ok: z === zip, key: 'contact.zip', truth: zip };
        }
        const num = /^\s*(\d+)/.exec(v)?.[1];
        if (!num) return 'unknown';
        return { ok: v.includes(street), key: 'contact.street', truth: String(this.v('contact.street')) };
      }
      default:
        return 'unknown';
    }
  }
}

export function scriptedParent(o: ParentOptions): SimulatedParent {
  return new ScriptedParent(o);
}

// ── The LLM-simulated parent (interface only, for now) ───────────────────────

/**
 * A parent played by a small model, for conversation quality on a subset (SPRINT-PLAN budget).
 * Same interface as the scripted parent, so the runner takes either. Not built yet: it needs
 * a model client and a cost meter; the scripted parent stays the source of field-level scores.
 */
export interface LlmParentOptions extends ParentOptions {
  model: string;
  /** Returns the model's reply and its cost, given a system prompt and the conversation. */
  complete: (system: string, turns: Array<{ role: 'agent' | 'parent'; text: string }>) => Promise<{ text: string; costUsd: number }>;
}

export function llmParent(_o: LlmParentOptions): SimulatedParent & { costUsd(): number } {
  throw new Error('llmParent: not implemented yet (scripted parents only for now)');
}

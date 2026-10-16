import type { FactKey, PayFrequency } from '../family/facts.js';
import type { FactSpec, Lang } from './types.js';

/**
 * Facts from a parent's message, deterministically.
 *
 * The rule (VISION §8, "ask, don't guess"): a fact is set only from words the parent wrote,
 * and the words are kept as its evidence. So this reads narrowly: a value is taken for a fact
 * when the message names that fact ("we get CalFresh", "she was born March 3, 2016") or when it
 * is a plain answer to the question we just asked ("4", "yes", "Ana López"). Anything it
 * can't read honestly is left for the next question, never filled in.
 *
 * English and Spanish: dates in both orders and in words, money with how often it's paid
 * ("2,100 a month", "$600 cada dos semanas"), yes/no, names, grades, emails, phones, counts
 * ("somos 4"), "no income". A small model can be plugged in for the rest (`ModelExtractor`);
 * what it returns is accepted only when its quote is really in the message.
 */

/** A fact the engine could set this turn: a concrete key and its spec. */
export interface Slot {
  key: FactKey;
  spec: FactSpec;
}

export interface ExtractContext {
  lang: Lang;
  /** Every fact that could be set this turn: the missing ones, and the ones already set (so a
   * parent can correct them). */
  slots: Slot[];
  /** What we just asked, in order. A bare answer lands here. */
  asked: FactKey[];
  /** Keys set most recently, newest first: where "actually, 2,300" lands with no other cue. */
  recent: FactKey[];
  /** Extra words that name a fact (pathway hints). */
  cueFor?: (key: FactKey) => RegExp | undefined;
}

export interface Found {
  key: FactKey;
  value: unknown;
  /** The parent's words this came from. */
  quote: string;
  /** The words named this fact ("her school is…"), not just answered what we asked. Only a
   * named fact may change what the district's record says (with a correction). */
  named?: boolean;
}

export interface Extraction {
  facts: Found[];
  /** "actually", "sorry, I meant", "perdón, es…". */
  correction: boolean;
  /** "I don't know", "no sé". */
  dontKnow: boolean;
  /** "I'd rather not say", "prefiero no decir". */
  declined: boolean;
  /** The message asks something. */
  question: boolean;
  /** "Why do you need that?", "¿para qué?". */
  whyAsked: boolean;
}

/** For what regex can't read. Optional; nothing here calls a model by itself. */
export interface ModelExtractor {
  extract(input: {
    text: string;
    lang: Lang;
    slots: Array<{ key: FactKey; kind: FactSpec['kind']; ask: string; options?: string[] }>;
    asked: FactKey[];
  }): Promise<Found[]>;
}

// ── text helpers ─────────────────────────────────────────────────────────────

/** Lower case, accents off ("sé" → "se", "años" → "anos"). Same length for typed text. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const CORRECTION = /^(actually|sorry|oops|wait|correction|i meant|no,|nope,|my bad|perdon|en realidad|me equivoque|quise decir|corrijo|mejor dicho|disculpa)\b|\b(i meant|quise decir|not .{1,20} but|me equivoque|should be|is wrong|isn'?t right|debe ser|deberia ser|esta mal)\b/;
const DONT_KNOW = /\b(i don'?t know|i dont know|dunno|not sure|no idea|no se|no lo se|ni idea|no estoy segur[oa]|no me acuerdo|i don'?t remember)\b/;
const DECLINED = /\b(rather not|prefer not|i'?d prefer not|don'?t want to (say|share|answer|tell)|prefiero no|no quiero (decir|contestar|compartir)(lo)?)\b|^(skip|skip it|skip this|pass|paso|saltar)[.!]?$/;
const WHY = /\b(why|what for|what is that for|what'?s that for|por ?que|para que)\b/;
const QUESTION_LEAD = /^(why|what|how|when|where|who|which|can|could|would|do you|does|is it|are you|por ?que|para que|como|cuando|donde|quien|cual|puedes|puedo)\b/;

/** Split into clauses, keeping "March 3, 2015" and "2,100" whole. */
export function splitClauses(text: string): string[] {
  return text
    .split(/\s*(?:[;\n]|[.!?]\s+|,\s+(?=[^\d\s])|\s+(?:and|also|plus|but|y|pero|tambi[eé]n)\s+)\s*/i)
    .map((c) => c.replace(/^(and|also|plus|but|y|pero|tambi[eé]n)\s+/i, '').trim())
    .filter(Boolean);
}

const NEGATED_BEFORE = /\b(not|no|instead of|en vez de|en lugar de|nor|ni)\s*\$?\s*$/;

// ── typed parsers (on folded text) ───────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11,
  november: 11, dec: 12, december: 12,
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9,
  setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};
const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');

interface Span<T> {
  value: T;
  index: number;
  length: number;
}

function iso(y: number, m: number, d: number): string | undefined {
  if (y < 100) y += y <= (new Date().getFullYear() % 100) ? 2000 : 1900;
  if (m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return undefined;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Dates as ISO (yyyy-mm-dd). "3/4/2016" is March 4 in English and 3 April in Spanish, unless
 * one part can only be a day. */
export function parseDates(c: string, lang: Lang): Array<Span<string>> {
  const out: Array<Span<string>> = [];
  const push = (v: string | undefined, m: RegExpExecArray) => {
    if (v && !out.some((o) => m.index < o.index + o.length && o.index < m.index + m[0].length)) out.push({ value: v, index: m.index, length: m[0].length });
  };
  let m: RegExpExecArray | null;
  const isoRe = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g;
  while ((m = isoRe.exec(c))) push(iso(+m[1]!, +m[2]!, +m[3]!), m);
  const num = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/g;
  while ((m = num.exec(c))) {
    const a = +m[1]!, b = +m[2]!, y = +m[3]!;
    let mo: number, d: number;
    if (a > 12) [d, mo] = [a, b];
    else if (b > 12) [mo, d] = [a, b];
    else if (lang === 'es') [d, mo] = [a, b];
    else [mo, d] = [a, b];
    push(iso(y, mo, d), m);
  }
  const en1 = new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'g');
  while ((m = en1.exec(c))) push(iso(+m[3]!, MONTHS[m[1]!]!, +m[2]!), m);
  const en2 = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+|de\\s+)?(${MONTH_RE}),?\\s+(?:de\\s+|del\\s+)?(\\d{4})\\b`, 'g');
  while ((m = en2.exec(c))) push(iso(+m[3]!, MONTHS[m[2]!]!, +m[1]!), m);
  return out.sort((x, y) => x.index - y.index);
}

export type Frequency = PayFrequency | 'hourly' | 'ambiguous';

const FREQ: Array<[Frequency, RegExp]> = [
  ['biweekly', /\b(every|each)\s+(two|2|other)\s+weeks?\b|\bbi-?weekly\b|\bcada\s+(dos|2)\s+semanas\b|\bcada\s+otra\s+semana\b/],
  ['twice_monthly', /\btwice\s+a\s+month\b|\b(two|2)\s+times\s+a\s+month\b|\bsemi-?monthly\b|\bdos\s+veces\s+al\s+mes\b|\b(1st|first)\s+and\s+(15th|fifteenth)\b/],
  ['ambiguous', /\bquincenal(es|mente)?\b|\bcada\s+(quince|15)\s+dias\b/],
  ['weekly', /\b(a|per|each|every|por|a\s+la|cada)\s+(week|semana)\b|\bweekly\b|\bsemanal(es|mente)?\b|\/\s?(wk|week)\b/],
  ['monthly', /\b(a|per|each|every|por|al|cada)\s+(month|mes)\b|\bmonthly\b|\bmensual(es|mente)?\b|\/\s?(mo|month)\b/],
  ['annual', /\b(a|per|each|every|por|al|cada)\s+(year|ano)\b|\b(yearly|annually|annual|anual(es|mente)?)\b|\/\s?(yr|year)\b/],
  ['hourly', /\b(an|per|a\s+la|por|la|each)\s+(hour|hora)\b|\bhourly\b|\/\s?(hr|hour)\b/],
];
export const FREQ_ANY = new RegExp(FREQ.map(([, r]) => r.source).join('|'));

export function parseFrequency(c: string): Frequency | undefined {
  for (const [f, re] of FREQ) if (re.test(c)) return f;
  return undefined;
}

const MONEY_CUE = /\$|\b(dollars|dolares|bucks|make|makes|made|earn|earns|income|paid|pay|salary|wages?|paycheck|gano|gana|ganamos|ganan|ingresos?|sueldo|salario|cobro|cobra|cobramos|me pagan|nos pagan)\b/;

/** Amounts of money, with how often they're paid when the clause says. */
export function parseMoney(c: string, opts: { requireCue?: boolean } = {}): Array<Span<{ amount: number; frequency?: Frequency }>> {
  const out: Array<Span<{ amount: number; frequency?: Frequency }>> = [];
  const frequency = parseFrequency(c);
  const cue = MONEY_CUE.test(c) || frequency !== undefined;
  const re = /(\$\s*)?(\d{1,3}(?:[,.]\d{3})+|\d+)(?:[.,](\d{1,2}))?(?!\d)(\s*k\b)?(\s*(?:dollars|dolares|bucks))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(c))) {
    if (!m[2]) continue;
    const explicit = Boolean(m[1] || m[4] || m[5]);
    if (!explicit && !cue && opts.requireCue !== false) continue;
    if (NEGATED_BEFORE.test(c.slice(0, m.index))) continue;
    let amount = Number(m[2].replace(/[,.]/g, '')) + (m[3] ? Number(`0.${m[3]}`) : 0);
    if (m[4]) amount *= 1000;
    if (!Number.isFinite(amount)) continue;
    out.push({ value: { amount, ...(frequency ? { frequency } : {}) }, index: m.index, length: m[0].length });
  }
  return out;
}

const WORD_NUM: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
};
const NUM = `(\\d{1,2}|${Object.keys(WORD_NUM).join('|')})`;
const toNum = (s: string): number => (/^\d+$/.test(s) ? Number(s) : WORD_NUM[s]!);

/** "4 people", "family of four", "somos 5", "there are 3 of us". */
export function parseCount(c: string): number | undefined {
  const res = [
    new RegExp(`\\b${NUM}\\s+(people|persons|of us|in (the|my|our) (house|household|home|family)|personas|en (la|mi|nuestra) casa|en total)\\b`),
    new RegExp(`\\bfamily of\\s+${NUM}\\b`),
    new RegExp(`\\bsomos\\s+${NUM}\\b`),
    new RegExp(`\\bthere (are|is)\\s+${NUM}\\b`),
    new RegExp(`\\bwe are\\s+${NUM}\\b|\\bwe'?re\\s+${NUM}\\b`),
  ];
  for (const re of res) {
    const m = re.exec(c);
    if (m) {
      const g = m.slice(1).find((x) => x !== undefined && (/^\d+$/.test(x) || x in WORD_NUM));
      if (g) return toNum(g);
    }
  }
  return undefined;
}

/** A clause that is only a number: "4", "it's 4", "son cuatro". */
export function bareNumber(c: string): number | undefined {
  const m = new RegExp(`^\\s*(?:it'?s\\s+|its\\s+|es\\s+|son\\s+|we are\\s+|we'?re\\s+|just\\s+|solo\\s+)?(\\d{1,4}|${Object.keys(WORD_NUM).join('|')})\\s*(?:people|personas)?\\s*[.!]?\\s*$`).exec(c);
  return m ? toNum(m[1]!) : undefined;
}

const ORDINAL_ES: Record<string, string> = {
  primer: '1', primero: '1', segundo: '2', tercer: '3', tercero: '3', cuarto: '4', quinto: '5', sexto: '6',
  septimo: '7', octavo: '8', noveno: '9', decimo: '10',
};

/** "3rd grade", "grade 3", "kinder", "TK", "tercer grado", "grado 3" → "K", "TK", "3"… */
export function parseGrade(c: string, bare = false): string | undefined {
  if (/\b(transitional kinder(garten)?|tk)\b/.test(c)) return 'TK';
  if (/\b(pre-?k|preschool|preescolar)\b/.test(c)) return 'PK';
  if (/\b(kinder|kindergarten|kinder garden)\b/.test(c)) return 'K';
  let m = /\b(\d{1,2})(?:st|nd|rd|th|o|°|º)?\s+(?:grade|grado)\b|\b(?:grade|grado)\s+(\d{1,2})\b/.exec(c);
  if (m) return String(Number(m[1] ?? m[2]));
  m = new RegExp(`\\b(${Object.keys(ORDINAL_ES).join('|')})\\s+(?:grado|ano)\\b`).exec(c);
  if (m) return ORDINAL_ES[m[1]!];
  if (bare) {
    m = /^\s*(?:she'?s in |he'?s in |in |en )?(\d{1,2})(?:st|nd|rd|th|o|°|º)?\s*[.!]?\s*$/.exec(c);
    if (m && Number(m[1]) <= 12) return String(Number(m[1]));
  }
  return undefined;
}

export function parseEmail(text: string): string | undefined {
  return /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.exec(text)?.[0];
}

export function parsePhone(text: string): string | undefined {
  const m = /(?:\+?1[\s.-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b/.exec(text);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : undefined;
}

/** Leading yes or no, en/es. */
export function parseYesNo(c: string): boolean | undefined {
  const t = c.trim();
  if (DONT_KNOW.test(t)) return undefined;
  if (/^(n|no|nope|nah|we don'?t|i don'?t|we do not|i do not|none|never|not really|no tenemos|no tengo|no recibimos|nunca|ninguno|tampoco)\b/.test(t)) return false;
  if (/^(y|yes|yeah|yep|yup|ya|sure|of course|we do|i do|we have|i have|we get|correct|right|true|si|claro|por supuesto|asi es|correcto|tenemos|tengo|recibimos)\b/.test(t)) return true;
  return undefined;
}

const NEGATION = /\b(no|not|don'?t|doesn'?t|didn'?t|never|nobody|none|isn'?t|aren'?t|haven'?t|ni|nunca|nadie|tampoco|ya no)\b/;

export function saysNoIncome(c: string): boolean {
  return /\b(no income|no (one|body) (works|is working)|nobody works|nobody is working|we don'?t (have|make|earn|get) (any )?(income|money)|i don'?t (have|make|earn) (any )?(income|money)|zero income|\$?0 income|sin ingresos|no (tenemos|tengo|hay) ingresos|nadie trabaja|no ganamos( nada)?|no gano( nada)?)\b/.test(c);
}

const BENEFIT_WORDS: Array<[string, RegExp]> = [
  ['snap', /\b(calfresh|cal fresh|snap|food stamps|ebt|cupones|estampillas)\b/],
  ['medicaid', /\b(medi-?cal|medicaid)\b/],
  ['tanf', /\b(calworks|cal works|tanf|welfare)\b/],
];

const NAME_TOKEN = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'’-]*$/;
const NAME_STOP = new Set(
  'and y born nacio nacida nacido she he is es who que in en grade grado years anos ano the el my mi his her su their name nombre yes no si ok okay hi hello hola thanks gracias actually sorry not also she\'s he\'s it it\'s its we our tiene has was age edad old'.split(' '),
);
const NAME_JOIN = new Set(['de', 'del', 'la', 'las', 'los', 'van', 'von', 'da', 'dos']);
const NAME_LEAD = /^(?:(?:his|her|their|my|the|our|el|la)\s+)?(?:(?:child'?s|kid'?s|son'?s|daughter'?s|full|first|last)\s+)*(?:name|nombre)\s*(?:is|es|:)?\s*|^(?:(?:she|he|it|they)\s+is\s+called|(?:she|he)'?s\s+called|se\s+llama|me\s+llamo|mi\s+nombre\s+es|it'?s|its|i'?m|i\s+am|soy|es)\s+/i;

/** A person's name: with a lead-in ("her name is Ana López") anywhere, or a clause that is
 * nothing but a name when we asked for one. Lowercase typing is title-cased (shown back). */
export function parseName(clause: string, bare: boolean): string | undefined {
  let s = clause.trim().replace(/[.!]+$/, '');
  const lead = NAME_LEAD.exec(s);
  const hadLead = Boolean(lead && lead[0].length);
  if (lead) s = s.slice(lead[0].length);
  else if (!bare) {
    const inner = /\b(?:name\s+is|nombre\s+es|se\s+llama|me\s+llamo|named|called)\s+/i.exec(s);
    if (!inner) return undefined;
    s = s.slice(inner.index + inner[0].length);
  }
  const tokens = s.split(/\s+/).filter(Boolean);
  const name: string[] = [];
  for (const tok of tokens) {
    const t = tok.replace(/[,;:]+$/, '');
    const f = fold(t);
    if (!NAME_TOKEN.test(t)) break;
    if (NAME_STOP.has(f) && !(name.length && NAME_JOIN.has(f))) break;
    name.push(t);
    if (tok !== t) break;
  }
  while (name.length && NAME_JOIN.has(fold(name[name.length - 1]!))) name.pop();
  if (!name.length || name.length > 5) return undefined;
  // Without a lead-in, the whole clause has to be the name ("she likes math" is not a name).
  if (!hadLead && bare && name.length !== tokens.length) return undefined;
  if (!name.some((t) => t.length >= 2)) return undefined;
  const joined = name.join(' ');
  return joined === joined.toLowerCase()
    ? name.map((t) => (NAME_JOIN.has(t) ? t : t[0]!.toUpperCase() + t.slice(1))).join(' ')
    : joined;
}

const RELATIONSHIP: Record<string, RegExp> = {
  child: /\b(son|daughter|kid|child|children|stepson|stepdaughter|hijo|hija|nino|nina|hijastr[oa])\b/,
  spouse: /\b(husband|wife|spouse|partner|esposo|esposa|pareja|marido)\b/,
  parent: /\b(mother|father|mom|dad|madre|padre|mama|papa|grandmother|grandfather|abuel[oa])\b/,
  self: /\b(me|myself|i am|yo|soy yo)\b/,
};

// ── which words name which fact ──────────────────────────────────────────────

const LEXICON: Array<[RegExp, RegExp]> = [
  [/^first_name$/, /\b(first name|given name|primer nombre|nombre de pila)\b/],
  [/^last_name$/, /\b(last name|surname|family name|apellidos?)\b/],
  [/^(full_)?name$/, /\b(name|named|called|se llama|me llamo|nombre)\b/],
  [/^(dob|birth|birthdate|birth_date|date_of_birth|birthday)$/, /\b(born|birth|birthday|dob|nacio|nacida|nacido|nacimiento|cumpleanos)\b/],
  [/^age$/, /\b(years old|age|edad|anos)\b/],
  [/grade$/, /\b(grade|grado|kinder|kindergarten|tk|preschool|preescolar)\b/],
  [/email$/, /@|\b(e-?mail|correo)\b/],
  // "My number is (831) 555-0100": the value itself must be a phone number (3-3-4 digits).
  [/phone$/, /\b(phone|cell|mobile|number|numero|telefono|celular|text me|call me|llamar|llameme)\b/],
  [/^(size|household_size|people|members|member_count|count)$/, /\b(people|persons|of us|family of|household|personas|somos|en (la|mi|nuestra) casa)\b/],
  [/(calfresh|snap|food_stamps)$/, BENEFIT_WORDS[0]![1]],
  [/(medi_cal|medical|medicaid)$/, BENEFIT_WORDS[1]![1]],
  [/(calworks|tanf)$/, BENEFIT_WORDS[2]![1]],
  [/benefits$/, new RegExp(BENEFIT_WORDS.map(([, r]) => r.source).join('|'))],
  [/income_reported$/, /\b(income|ingresos?|works|working|trabaj\w*|earn|make|gano|ganamos)\b|\$/],
  [/(amount|income|wages|pay|salary)$/, MONEY_CUE],
  [/frequency$/, FREQ_ANY],
  [/foster$/, /\b(foster|crianza|hogar temporal)\b/],
  [/homeless$/, /\b(homeless|shelter|motel|sin hogar|refugio|albergue)\b/],
  [/migrant$/, /\b(migrant|migrante|migratori[oa])\b/],
  [/school$/, /\b(school|escuela)\b/],
  [/address$/, /\b(address|street|live at|direccion|vivimos en)\b/],
  [/case_number$/, /\b(case (number|#|no)|numero de caso|# de caso)\b/],
];

export function lexiconCue(key: FactKey): RegExp | undefined {
  const leaf = key.split('.').pop() ?? key;
  return LEXICON.find(([k]) => k.test(leaf))?.[1];
}

// ── the reading ──────────────────────────────────────────────────────────────

interface Placed {
  value: unknown;
  extra?: Array<{ key: FactKey; value: unknown }>;
}

const leaf = (key: FactKey) => key.split('.').pop() ?? key;
const prefix = (key: FactKey) => key.slice(0, key.lastIndexOf('.'));

/** Blank out dates, emails and phones so their digits aren't read as money or counts. */
function mask(c: string, lang: Lang): string {
  let out = c;
  const blank = (i: number, n: number) => (out = out.slice(0, i) + ' '.repeat(n) + out.slice(i + n));
  for (const d of parseDates(c, lang)) blank(d.index, d.length);
  const e = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/.exec(out);
  if (e) blank(e.index, e[0].length);
  const p = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/.exec(out);
  if (p) blank(p.index, p[0].length);
  return out;
}

function valueFor(slot: Slot, clause: string, c: string, ctx: ExtractContext, how: { cued: boolean; askedBooleans: number }): Placed | undefined {
  const { spec, key } = slot;
  const l = leaf(key);
  const asked = ctx.asked.includes(key);
  const plain = mask(c, ctx.lang);
  switch (spec.kind) {
    case 'date': {
      const d = parseDates(c, ctx.lang).find((x) => !NEGATED_BEFORE.test(c.slice(0, x.index)));
      return d ? { value: d.value } : undefined;
    }
    case 'number': {
      if (/(amount|income|wage|pay|salary|rent|cost)/.test(l)) {
        if (saysNoIncome(c) && !/^income\.\d+\./.test(key)) return { value: 0 };
        const money = parseMoney(plain, { requireCue: !asked })[0];
        if (!money) return undefined;
        const f = money.value.frequency;
        if (f === 'hourly') return undefined; // an hourly wage isn't what the form asks; ask again
        if (/monthly/.test(l) && f && f !== 'monthly') return undefined; // don't convert: ask
        const extra: Placed['extra'] = [];
        const freqKey = `${prefix(key)}.frequency`;
        if (f && f !== 'ambiguous' && ctx.slots.some((s) => s.key === freqKey)) extra.push({ key: freqKey, value: f });
        return { value: money.value.amount, extra };
      }
      if (/(size|count|people|members|number_of)/.test(l)) {
        const n = parseCount(plain) ?? (asked ? bareNumber(plain) : undefined);
        return n !== undefined && n > 0 ? { value: n } : undefined;
      }
      if (l === 'age') {
        const m = /\b(\d{1,2})\s*(years old|year old|yrs|anos)\b/.exec(plain);
        const n = m ? Number(m[1]) : asked ? bareNumber(plain) : undefined;
        return n !== undefined ? { value: n } : undefined;
      }
      const n = asked ? bareNumber(plain) : undefined;
      return n !== undefined ? { value: n } : undefined;
    }
    case 'boolean': {
      if (/income_reported$/.test(key)) {
        if (saysNoIncome(c)) return { value: false };
        if (parseMoney(plain).length) return { value: true };
      }
      if (how.cued) {
        const yn = parseYesNo(c);
        if (yn !== undefined && asked) return { value: yn };
        return { value: !NEGATION.test(c) };
      }
      if (asked && how.askedBooleans === 1) {
        const yn = parseYesNo(c);
        return yn !== undefined ? { value: yn } : undefined;
      }
      return undefined;
    }
    case 'enum': {
      const options = spec.options ?? [];
      if (options.some((o) => ['weekly', 'biweekly', 'monthly', 'annual', 'twice_monthly'].includes(o))) {
        const f = parseFrequency(c);
        if (f && options.includes(f)) return { value: f };
      }
      for (const o of options) {
        if (new RegExp(`\\b${fold(o).replace(/_/g, ' ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(c)) return { value: o };
        const syn = RELATIONSHIP[o];
        if (syn && syn.test(c)) return { value: o };
      }
      return undefined;
    }
    case 'list': {
      const found = BENEFIT_WORDS.filter(([, re]) => re.test(c)).map(([code]) => code);
      if (/benefit/.test(l) || (spec.options ?? []).some((o) => o === 'snap')) {
        if (found.length) {
          if (NEGATION.test(c) && !asked) return undefined;
          return { value: NEGATION.test(c) && parseYesNo(c) === false ? [] : found };
        }
        if (asked && /^(none|no|nothing|nope|ninguno|ninguna|nada|no tenemos|we don'?t)\b/.test(c.trim())) return { value: [] };
        return undefined;
      }
      if (!asked) return undefined;
      const items = clause.split(/\s*(?:,|\band\b|\by\b)\s*/i).map((s) => s.trim()).filter(Boolean);
      return items.length ? { value: items } : undefined;
    }
    case 'string': {
      if (/case_number$/.test(l)) {
        const m = /\b([a-z]{0,3}-?\d[\d-]{3,18}\d)\b/i.exec(clause);
        if (m) return { value: m[1]!.toUpperCase() };
        if (!asked) return undefined;
      }
      if (/email$/.test(l)) {
        const e = parseEmail(clause);
        return e ? { value: e } : undefined;
      }
      if (/phone$/.test(l)) {
        const p = parsePhone(clause);
        return p ? { value: p } : undefined;
      }
      if (/grade$/.test(l)) {
        const g = parseGrade(c, asked);
        return g ? { value: g } : undefined;
      }
      if (/name$/.test(l)) return nameValue(slot, clause, ctx, asked);
      if (!asked) return undefined;
      // Any other string, only as a plain answer to the question we asked.
      const t = clause.trim().replace(/[.!]+$/, '');
      if (!t || t.length > 80 || /[?¿]/.test(t) || DONT_KNOW.test(fold(t)) || DECLINED.test(fold(t)) || parseYesNo(fold(t)) !== undefined) return undefined;
      return { value: t };
    }
  }
}

/** First and last name from one answer: split only when both were asked (or named) and the
 * name has exactly two words. "Ana María López García" is not ours to split. */
function nameValue(slot: Slot, clause: string, ctx: ExtractContext, asked: boolean): Placed | undefined {
  const name = parseName(clause, asked);
  if (!name) return undefined;
  const l = leaf(slot.key);
  if (l === 'first_name') {
    const lastKey = `${prefix(slot.key)}.last_name`;
    const lastAsked = ctx.asked.includes(lastKey);
    const words = name.split(/\s+/);
    if (lastAsked && words.length === 2) return { value: words[0], extra: [{ key: lastKey, value: words[1] }] };
    if (lastAsked && words.length > 2) return undefined;
    return { value: name };
  }
  if (l === 'last_name') {
    // "López" when asked the last name; a two-word answer here is a double surname, kept whole.
    return { value: name };
  }
  return { value: name };
}

export function extractFacts(text: string, ctx: ExtractContext): Extraction {
  const full = fold(text.trim());
  const facts: Found[] = [];
  const taken = new Set<FactKey>();
  const slotOf = new Map(ctx.slots.map((s) => [s.key, s]));
  const askedBooleans = ctx.asked.filter((k) => slotOf.get(k)?.spec.kind === 'boolean').length;
  const correction = CORRECTION.test(full);
  const put = (key: FactKey, value: unknown, quote: string): boolean => {
    if (taken.has(key) || !slotOf.has(key)) return false;
    taken.add(key);
    facts.push({ key, value, quote });
    return true;
  };
  const place = (slot: Slot, p: Placed, quote: string): boolean => {
    if (!put(slot.key, p.value, quote)) return false;
    for (const x of p.extra ?? []) put(x.key, x.value, quote);
    return true;
  };

  // A question is never an answer: "what is this school lunch form?" is not a school.
  const statements = questionFree(text);
  for (const clause of statements.flatMap((s) => splitClauses(s))) {
    const c = fold(clause);
    const quote = clause.trim();
    let placed = false;
    // 1. The clause names a fact.
    for (const slot of ctx.slots) {
      if (taken.has(slot.key)) continue;
      const cue = ctx.cueFor?.(slot.key) ?? lexiconCue(slot.key);
      if (!cue || !cue.test(c)) continue;
      const p = valueFor(slot, clause, c, ctx, { cued: true, askedBooleans });
      if (p && place(slot, p, quote)) {
        placed = true;
        const f = facts.find((x) => x.key === slot.key);
        if (f) f.named = true;
      }
    }
    // One value named for several people ("born 1959-08-18" with two children whose birth dates
    // we could take): whose it is isn't ours to pick, so nobody gets it unless it was asked.
    const fromThis = facts.filter((f) => f.quote === quote);
    const leafs = fromThis.map((f) => leaf(f.key));
    for (const f of fromThis) {
      if (/^member\./.test(f.key) && leafs.filter((l) => l === leaf(f.key)).length > 1 && !ctx.asked.includes(f.key)) {
        facts.splice(facts.indexOf(f), 1);
      }
    }
    if (placed && facts.some((f) => f.quote === quote)) continue;
    // 2. A plain answer to what we asked.
    for (const key of ctx.asked) {
      const slot = slotOf.get(key);
      if (!slot || taken.has(key)) continue;
      const p = valueFor(slot, clause, c, ctx, { cued: false, askedBooleans });
      if (p && place(slot, p, quote)) {
        placed = true;
        break;
      }
    }
    if (placed) continue;
    // 3. "Actually, 2,300": the newest fact this value fits. Only a typed value (a number, a
    // date) can land on a fact with no word naming it: any clause would "fit" a free-text fact.
    if (correction) {
      for (const key of ctx.recent) {
        const slot = slotOf.get(key);
        if (!slot || taken.has(key) || !['number', 'date'].includes(slot.spec.kind)) continue;
        const p = valueFor(slot, clause, c, { ...ctx, asked: [key] }, { cued: false, askedBooleans: slot.spec.kind === 'boolean' ? 1 : 0 });
        if (p && place(slot, p, quote)) break;
      }
    }
  }

  const question = /[?¿]/.test(text) || QUESTION_LEAD.test(full);
  return {
    facts,
    correction,
    dontKnow: DONT_KNOW.test(full),
    declined: DECLINED.test(full),
    question,
    whyAsked: question && WHY.test(full),
  };
}

/** The message without its question sentences ("what is this form? Ana goes to Ohlone" →
 * "Ana goes to Ohlone"). A sentence ending in "?", opening with "¿", or led by a question word
 * ("can you help", "do I have to") is a question. */
export function questionFree(text: string): string[] {
  return text
    .split(/(?<=[^A-Z][.!?])(?<!\b(?:St|Dr|Ave|Blvd|Rd|Ln|Ct|Apt|Mr|Mrs|Ms|Jr|Sr|No|Mt|Ft|Sta|Sto)\.)\s+|\n+|(?=¿)/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !(/[?¿]/.test(s) || QUESTION_SENTENCE.test(fold(s))));
}
const QUESTION_SENTENCE = /^(why|what|how|when|where|who|which|can you|could you|would you|do you|does|is it|is this|are you|will|should i|do i|por ?que|para que|que es|como|cuando|donde|quien|cual|me puede|puede usted|tengo que)\b/;

/** A model's facts count only if each quote is really in the message and the value has the
 * fact's type. Anything else is dropped: the parent didn't say it. */
export function acceptModelFacts(text: string, found: Found[], slots: Slot[]): Found[] {
  const seen = fold(text).replace(/\s+/g, ' ');
  const byKey = new Map(slots.map((s) => [s.key, s]));
  return found.filter((f) => {
    const slot = byKey.get(f.key);
    if (!slot || !f.quote || !seen.includes(fold(f.quote).replace(/\s+/g, ' ').trim())) return false;
    const v = f.value;
    switch (slot.spec.kind) {
      case 'boolean':
        return typeof v === 'boolean';
      case 'number':
        return typeof v === 'number' && Number.isFinite(v);
      case 'date':
        return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
      case 'enum':
        return typeof v === 'string' && (slot.spec.options ?? []).includes(v);
      case 'list':
        return Array.isArray(v);
      case 'string':
        return typeof v === 'string' && v.trim().length > 0;
    }
  });
}

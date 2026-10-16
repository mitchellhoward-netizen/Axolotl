import { fold, parseMoney, splitClauses, type Frequency } from './extract.js';
import type { Lang } from './types.js';

/**
 * The people in a household and their money, read from a parent's words (the pathway engine's
 * "people" mode, used by the income forms). Deterministic, English and Spanish, and narrow on
 * purpose (VISION §8, "ask, don't guess"): a value is read only when the words plainly say it,
 * and anything ambiguous comes back unread so the engine asks.
 *
 *   parsePersonName  "I'm Elena A. García-López" → first Elena, initial A, last García-López
 *   parseRoster      "It's me (34), my husband Ricardo García (43) and my kid Mía (9)"
 *   parseIncomes     "My husband Ricardo makes $2,200 every two weeks" → owner, kind, amount, how often
 *   parseFlag        "No, none of them are migrant" / "Yes, Sofía is in foster care"
 *   parseAddress     "We live at 123 Main St Apt 4, Watsonville, CA 95076"
 *
 * Member ids follow the rules archive's convention (archive/playbooks/<program>/tests/
 * households_ca.yaml): `p` is the parent we talk to, `q` their spouse or partner, `c1`… the
 * children (the district's students keep their own ids), `g1`… anyone else.
 */

export const SELF = 'p';

export interface PersonName {
  first: string;
  last?: string;
  /** A middle initial, one capital letter. */
  mi?: string;
  /** More than two plain words with no initial or surname particle: which part is the last
   * name isn't ours to decide ("José Luis García", "Ana García López"). */
  ambiguous?: boolean;
}

const NAME_TOKEN = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'’-]*$/;
const INITIAL = /^[A-Za-zÀ-ÖØ-öø-ÿ]\.?$/;
/** Words that start a surname ("Dela Cruz", "de la Rosa", "Van Dyke"). */
const PARTICLES = new Set(['de', 'del', 'dela', 'la', 'las', 'los', 'van', 'von', 'da', 'di', 'dos', 'das', 'du', 'le', 'st', 'san', 'mac', 'bin', 'al', 'el']);
const NOT_NAMES = new Set(
  ('and y or o is es was are my mi his her su their our the el la los las a an un una in en at on to for with from of born nacio she he it its it\'s we our yes no si ok okay hi hello hola thanks gracias me yo i im i\'m also tambien years anos old grade grado kid kids child son daughter husband wife mom dad ' +
    'not no sure so just only still going here there very really fine good great busy confused sorry working home back done ready trying looking asking wondering signed all that this what who why how when where ' +
    'single married divorced separated widowed unemployed retired pregnant new glad happy tired sick out off alone afraid worried mother father parent guardian staying living calling texting ' +
    'muy bien aqui alla listo lista casado casada soltero soltera divorciado divorciada embarazada cansado cansada enfermo enferma trabajando seguro segura confundido confundida perdon disculpe que quien como').split(' '),
);

const titleCase = (t: string) => t.split(/([-'’])/).map((p) => (p.length > 1 || /[a-zà-ÿ]/i.test(p) ? p[0]!.toUpperCase() + p.slice(1) : p)).join('');

/** A name from the words of one phrase (no lead-in). */
export function splitName(raw: string): PersonName | undefined {
  const toks = raw
    .trim()
    .replace(/[.!,;:]+$/, '')
    .split(/\s+/)
    .filter(Boolean);
  if (!toks.length || toks.length > 6) return undefined;
  for (const t of toks) if (!NAME_TOKEN.test(t.replace(/\.$/, '')) && !INITIAL.test(t)) return undefined;
  if (NOT_NAMES.has(fold(toks[0]!))) return undefined;
  const lower = toks.every((t) => t === t.toLowerCase());
  const fix = (t: string) => (lower && !PARTICLES.has(fold(t)) ? titleCase(t) : t);
  const first = fix(toks[0]!);
  if (first.length < 2) return undefined;
  let rest = toks.slice(1);
  let mi: string | undefined;
  if (rest.length >= 2 && INITIAL.test(rest[0]!)) {
    mi = rest[0]![0]!.toUpperCase();
    rest = rest.slice(1);
  }
  if (!rest.length) return { first, ...(mi ? { mi } : {}) };
  if (rest.length === 1 || PARTICLES.has(fold(rest[0]!))) return { first, last: rest.map(fix).join(' '), ...(mi ? { mi } : {}) };
  return { first, ambiguous: true, ...(mi ? { mi } : {}) };
}

const NAME_LEAD = /^(?:(?:hi|hello|hola|ok|okay|sure|yes|si)[,!.]?\s+)?(?:i'?m|i am|my name is|my name'?s|it'?s|this is|me llamo|mi nombre es|soy|yo soy|name is|nombre:?|se llama)\s+/i;

/** The parent's own name: "I'm Elena A. García-López", "Me llamo Rosa Pérez", or a bare
 * "Elena García" when we just asked for it. */
export function parsePersonName(text: string, asked: boolean): PersonName | undefined {
  for (const sentence of sentences(text)) {
    let s = sentence.trim().replace(/[.!]+$/, '');
    const lead = NAME_LEAD.exec(s);
    if (lead) s = s.slice(lead[0].length);
    else if (!asked || /[?¿]/.test(sentence)) continue;
    // Stop at the first word that can't be part of a name ("Rosa Pérez and my number is…").
    const toks: string[] = [];
    for (const t of s.split(/\s+/)) {
      const bare = t.replace(/[,;:]+$/, '');
      if (!NAME_TOKEN.test(bare.replace(/\.$/, '')) && !INITIAL.test(bare)) break;
      if (toks.length && NOT_NAMES.has(fold(bare))) break;
      toks.push(bare);
      if (bare !== t) break;
    }
    if (!toks.length) continue;
    // A bare answer must be only the name ("she likes math" is not a name).
    if (!lead && toks.length !== s.split(/\s+/).length) continue;
    const n = splitName(toks.join(' '));
    if (n) return n;
  }
  return undefined;
}

/** Sentences, keeping "A." initials and "$1,200.50" whole. */
export function sentences(text: string): string[] {
  return text
    .split(SENTENCE_BREAK)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Where a sentence ends: after . ! ? and a space, but not after an initial ("A.") or an
 * abbreviation in a street or a school name ("St. Example Parish School", "Dr.", "Apt."). */
export const SENTENCE_BREAK = /(?<=[^A-Z][.!?])(?<!\b(?:St|Dr|Ave|Blvd|Rd|Ln|Ct|Apt|Mr|Mrs|Ms|Jr|Sr|No|Mt|Ft|Sta|Sto)\.)\s+|\n+/;

/** Is this sentence a question (never a source of facts)? */
export function isQuestion(sentence: string): boolean {
  const f = fold(sentence.trim());
  return /[?¿]/.test(sentence) || /^(why|what|how|when|where|who|which|can you|could you|would you|do you|does|is it|is this|are you|will|should i|do i|por ?que|para que|que es|como|cuando|donde|quien|cual|puede|puedes|me puede|tengo que)\b/.test(f);
}

// ── who lives here ───────────────────────────────────────────────────────────

export type Rel = 'self' | 'spouse' | 'child' | 'parent' | 'other';

export interface RosterItem {
  rel?: Rel;
  name?: PersonName;
  age?: number;
  quote: string;
}

const REL_WORDS: Array<[Rel, RegExp]> = [
  ['self', /^(me|myself|i|yo|mi persona)$/],
  ['spouse', /\b(husband|wife|spouse|partner|boyfriend|girlfriend|fiance|fiancee|esposo|esposa|pareja|marido|novio|novia)\b/],
  ['child', /\b(son|daughter|kid|kids|child|children|stepson|stepdaughter|baby|hijo|hija|hijos|hijas|hijo\/a|nino|nina|bebe|hijastro|hijastra)\b/],
  ['parent', /\b(mom|mother|mum|dad|father|mama|papa|madre|padre|mother-in-law|father-in-law|suegra|suegro)\b/],
  ['other', /\b(grandma|grandmother|grandpa|grandfather|abuela|abuelo|brother|sister|cousin|aunt|uncle|nephew|niece|friend|roommate|tenant|hermano|hermana|primo|prima|tia|tio|sobrino|sobrina|amigo|amiga|nieto|nieta|grandson|granddaughter)\b/],
];
const ROSTER_LEAD = /^(?:it'?s|its|there'?s|there are|we are|we'?re|just|only|vivimos|somos|viven|en (?:mi|la|nuestra) casa (?:viven|vivimos|somos)|solo|nada mas)\s*:?\s*/i;
const MY = /^(?:my|our|mi|mis|nuestro|nuestra|the|el|la)\s+/i;

/** Everyone the parent names as living at home. Undefined when the message lists nobody. */
/** A sentence about something else that came with the roster ("We live at 12 Main St,
 * Watsonville…", "My number is…"): its commas don't separate people. */
const NOT_PEOPLE = /\b(live at|we live|vivimos en|address|direccion|my (number|email|phone|cell)|mi (numero|correo|telefono|celular)|goes to|va a)\b|@|\d{3}\D{0,2}\d{3}\D?\d{4}/;

export function parseRoster(text: string): RosterItem[] | undefined {
  const out: RosterItem[] = [];
  for (const sentence of sentences(text)) {
    if (isQuestion(sentence)) continue;
    if (NOT_PEOPLE.test(fold(sentence)) || parseAddress(sentence)) continue;
    let s = sentence.trim().replace(/[.!]+$/, '');
    s = s.replace(ROSTER_LEAD, '');
    const parts = s.split(/\s*,\s*|\s+(?:and|y|plus|e)\s+|\s*;\s*/i).filter(Boolean);
    const items = parts.map(parseRosterItem).filter((x): x is RosterItem => Boolean(x));
    // In a list of people, a bare word with no relationship and no age is not a person.
    const listed = items.filter((it) => it.rel || it.age !== undefined || (items.length === 1 && sentences(text).length === 1));
    out.push(...listed);
  }
  return out.length ? out : undefined;
}

function parseRosterItem(raw: string): RosterItem | undefined {
  let s = raw.trim();
  let age: number | undefined;
  const ageM = /\(\s*(\d{1,3})\s*\)|,?\s+(\d{1,3})\s*(?:years old|yrs|y\/o|anos|años)\b|\bage\s+(\d{1,3})\b/i.exec(s);
  if (ageM) {
    age = Number(ageM[1] ?? ageM[2] ?? ageM[3]);
    s = (s.slice(0, ageM.index) + s.slice(ageM.index + ageM[0].length)).trim();
  }
  const f = fold(s).replace(/[.!]+$/, '');
  let rel: Rel | undefined;
  for (const [r, re] of REL_WORDS) {
    if (r === 'self' ? re.test(f) : re.test(f)) {
      rel = r;
      break;
    }
  }
  // "me" alone, or "yo".
  if (!rel && /^(me|myself|yo)$/.test(f)) rel = 'self';
  let nameText = s.replace(MY, '');
  if (rel && rel !== 'self') {
    // Drop the relationship words: "husband Ricardo García" → "Ricardo García".
    const words = nameText.split(/\s+/);
    const i = words.findIndex((w) => REL_WORDS.some(([r, re]) => r !== 'self' && re.test(fold(w).replace(/[^a-z/-]/g, ''))));
    nameText = i >= 0 ? words.slice(i + 1).join(' ') : nameText;
  }
  if (rel === 'self') return { rel, ...(age !== undefined ? { age } : {}), quote: raw.trim() };
  const name = nameText.trim() ? splitName(nameText) : undefined;
  if (!rel && !name) return undefined;
  return { ...(rel ? { rel } : {}), ...(name ? { name } : {}), ...(age !== undefined ? { age } : {}), quote: raw.trim() };
}

// ── money ────────────────────────────────────────────────────────────────────

export interface IncomeRead {
  /** A member id when the words say whose it is; otherwise the person we asked about. */
  owner?: string;
  kind?: string;
  amount: number;
  frequency?: Exclude<Frequency, 'ambiguous'>;
  /** "quincenal": every two weeks or twice a month? We ask. */
  ambiguousFrequency?: boolean;
  quote: string;
}

export interface IncomeReading {
  incomes: IncomeRead[];
  /** "We don't have any income", "nadie trabaja". */
  noIncomeAtAll: boolean;
  /** "No, he doesn't" / "none": the person we asked about has none. */
  none: boolean;
  /** "That's all", "es todo": nothing more to add. */
  thatsAll: boolean;
  /** "It's $1,650, not $1,750": change the income that was 1,750. */
  corrections: Array<{ from: number; to: number; quote: string }>;
}

const KINDS: Array<[string, RegExp]> = [
  ['child_support', /\b(child support|manutencion|pension alimenticia)\b/],
  ['ssi', /\b(ssi|supplemental security)\b/],
  ['social_security', /\b(social security|seguro social|ssa)\b/],
  ['ssdi', /\b(ssdi|disability|incapacidad|discapacidad)\b/],
  ['unemployment', /\b(unemployment|desempleo|edd)\b/],
  ['pension', /\b(pension|retirement|jubilacion|retiro)\b/],
  ['public_assistance', /\b(calworks|cal works|tanf|cash aid|welfare|asistencia publica)\b/],
  ['alimony', /\b(alimony|spousal support)\b/],
  ['self_employment', /\b(business|self[- ]employed|my own|on my own|freelance|side gig|negocio|por mi cuenta|cuenta propia|independiente)\b/],
  ['earned', /\b(make|makes|made|making|earn|earns|earned|earning|wages?|salary|paycheck|paid|job|works?|working|gano|gana|ganamos|ganan|sueldo|salario|trabajo|trabaja|cobro|cobra|me pagan|le pagan)\b/],
];

const NONE_FOR_PERSON = /^(no|nope|none|nothing|nada|ninguno|ninguna)\b|\b(doesn'?t|does not|don'?t|do not|isn'?t|is not) (have|get|make|earn|work|working|receive)\b|\bno (tiene|recibe|gana|trabaja)\b|\b(no|zero|0) income\b|\bsin ingresos\b/;
const THATS_ALL = /\b(that'?s (all|it|everything)|no (more|other)|nothing (else|more)|no one else|nobody else|no,? that'?s it|eso es todo|es todo|nadie mas|nada mas|ningun otro|ninguno mas|solo eso)\b/;
const NO_INCOME_AT_ALL = /\b(no income|we don'?t have (any )?(income|money)|i don'?t have (any )?(income|money)|nobody'?s working|nobody (is )?works?|no one (is )?working|no one works|zero income|sin ingresos|no (tenemos|tengo|hay) (ningun )?ingresos?|nadie (esta )?trabaja(ndo)?|no ganamos( nada)?)\b/;

export interface MemberRef {
  id: string;
  first?: string;
  rel?: string;
}

/** Whose income a clause is about, when it says. */
export function ownerIn(c: string, members: MemberRef[]): string | undefined {
  const f = fold(c);
  for (const m of members) {
    if (m.first && new RegExp(`\\b${fold(m.first).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(f)) return m.id;
  }
  if (/^(?:oh,?\s+)?(i|i'm|i'?ve|i get|i make|yo|me pagan|gano|cobro|recibo)\b/.test(f) || /\b(my own|mine|mio|mia|yo gano|i make|i earn|i get)\b/.test(f)) return members.find((m) => m.rel === 'self')?.id ?? SELF;
  const rel = (r: string) => members.find((m) => m.rel === r)?.id;
  if (/\b(my|mi) (husband|wife|spouse|partner|esposo|esposa|pareja|marido)\b/.test(f)) return rel('spouse');
  if (/\b(my|mi) (mom|mother|dad|father|mama|papa|madre|padre)\b/.test(f)) return rel('parent');
  return undefined;
}

function kindIn(c: string): string | undefined {
  for (const [k, re] of KINDS) if (re.test(c)) return k;
  return undefined;
}

export function parseIncomes(text: string, members: MemberRef[]): IncomeReading {
  const out: IncomeReading = { incomes: [], noIncomeAtAll: false, none: false, thatsAll: false, corrections: [] };
  for (const sentence of sentences(text)) {
    if (isQuestion(sentence)) continue;
    const f = fold(sentence);
    // "It's $1,650, not $1,750."
    const corr = /(?:it'?s|its|it is|son|es|is)\s+\$?\s*([\d,]+(?:\.\d{1,2})?)\s*,?\s*(?:not|no)\s+\$?\s*([\d,]+(?:\.\d{1,2})?)/.exec(f);
    if (corr) {
      out.corrections.push({ to: Number(corr[1]!.replace(/,/g, '')), from: Number(corr[2]!.replace(/,/g, '')), quote: sentence.trim() });
      continue;
    }
    if (NO_INCOME_AT_ALL.test(f)) {
      // "my partner Gurpreet doesn't work, so no income from him" is about one person, not the
      // household: never read as "nobody has income" (and not put on whoever we asked about).
      const other = ownerIn(f, members);
      if ((other && other !== SELF) || /\b(he|him|his|she|her|they|them|el|ella|ellos|partner|husband|wife|spouse|esposo|esposa|pareja|marido)\b/.test(f)) continue;
      out.noIncomeAtAll = true;
      continue;
    }
    if (THATS_ALL.test(f)) out.thatsAll = true;
    let owner: string | undefined;
    let found = false;
    for (const clause of splitClauses(sentence)) {
      const c = fold(clause);
      const money = parseMoney(c).filter((m) => m.value.amount > 0);
      owner = ownerIn(c, members) ?? owner;
      if (!money.length) continue;
      const m = money[0]!;
      const freq = m.value.frequency;
      if (freq === 'hourly') continue; // a rate, not what the form asks; the engine asks for the paycheck
      found = true;
      out.incomes.push({
        ...(owner ? { owner } : {}),
        ...(kindIn(c) ?? kindIn(f) ? { kind: kindIn(c) ?? kindIn(f) } : {}),
        amount: m.value.amount,
        ...(freq && freq !== 'ambiguous' ? { frequency: freq } : {}),
        ...(freq === 'ambiguous' ? { ambiguousFrequency: true } : {}),
        quote: sentence.trim(),
      });
    }
    if (!found && !out.thatsAll && NONE_FOR_PERSON.test(f)) out.none = true;
  }
  return out;
}

// ── yes/no for each child ────────────────────────────────────────────────────

/** "No, none of them are migrant" → everyone false; "Yes, Sofía is" → Sofía true, the others
 * false (the parent named who). A bare "yes" with several children is not read: we ask who. */
export function parseFlag(text: string, students: MemberRef[], topic?: RegExp): Record<string, boolean> | undefined {
  // Only the sentences that answer: a yes or no, or the status named ("Leonardo goes to Ohlone"
  // in the same message is about something else).
  const answer = /^(no|nope|nah|none|neither|not|never|yes|yeah|yep|si|correct|right|claro|asi es|ninguno|ninguna|nadie|tampoco|nunca)\b/;
  const body = sentences(text)
    .filter((s) => !isQuestion(s))
    .filter((s, i) => answer.test(fold(s).trim()) || (topic ? topic.test(fold(s)) : i === 0))
    .join(' ');
  const f = fold(body).trim();
  if (!f) return undefined;
  const named = students.filter((m) => m.first && new RegExp(`\\b${fold(m.first).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(f));
  const no = /^(no|nope|nah|none|neither|not really|never|ninguno|ninguna|nadie|tampoco|nunca)\b|\b(none of them|no one|nobody|neither of them|ninguno de ellos|ninguno esta|no,? (no )?(es|son|esta|estan))\b/.test(f);
  const yes = /^(yes|yeah|yep|si|correct|right|claro|asi es)\b/.test(f);
  const negatedName = /\b(isn'?t|is not|aren'?t|are not|no es|no esta|no son|no estan)\b/.test(f);
  if (no && !named.length) return Object.fromEntries(students.map((m) => [m.id, false]));
  if (no && named.length && negatedName) return Object.fromEntries(students.map((m) => [m.id, false]));
  if ((yes || named.length) && !negatedName && !no) {
    if (named.length) return Object.fromEntries(students.map((m) => [m.id, named.includes(m)]));
    if (students.length === 1) return { [students[0]!.id]: true };
    return undefined;
  }
  if (no && named.length) {
    // "No, Sofía isn't, but Mateo is": too mixed to read safely.
    return undefined;
  }
  return undefined;
}

// ── where they live ──────────────────────────────────────────────────────────

export interface Address {
  street: string;
  city?: string;
  state?: string;
  zip?: string;
}

const STATES: Record<string, string> = { california: 'CA', calif: 'CA', 'ca.': 'CA' };

/** "123 Main St Apt 4, Watsonville, CA 95076" anywhere in the message. */
export function parseAddress(text: string): Address | undefined {
  // One sentence at a time, and the street number is a number of its own (not "$5,088").
  for (const s of sentences(text)) {
    const m = /(?<![$\d,.])\b(\d{1,6}\s+[A-Za-zÀ-ÖØ-öø-ÿ0-9.'#\- ]+?)\s*,\s*([A-Za-zÀ-ÖØ-öø-ÿ.'\- ]+?)\s*,?\s+([Cc][Aa]|[Cc]alifornia|[Cc]alif\.?|[A-Z]{2})\.?,?\s+(\d{5})(?:-\d{4})?\b/.exec(s);
    if (!m) continue;
    const st = STATES[m[3]!.toLowerCase()] ?? m[3]!.toUpperCase();
    return { street: m[1]!.trim(), city: m[2]!.trim(), state: st, zip: m[4]! };
  }
  return undefined;
}

/** The words a parent uses for a relationship, for questions and labels. */
export function relWord(rel: string | undefined, lang: Lang): string {
  const en: Record<string, string> = { spouse: 'partner', parent: 'parent', child: 'child', other: 'relative' };
  const es: Record<string, string> = { spouse: 'pareja', parent: 'padre o madre', child: 'hijo o hija', other: 'familiar' };
  return (lang === 'es' ? es : en)[rel ?? 'other'] ?? (lang === 'es' ? 'familiar' : 'relative');
}

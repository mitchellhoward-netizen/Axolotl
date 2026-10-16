import { ArchiveUnavailable, type ArchiveClient, type Determination } from '../archive/client.js';
import { schoolMealsHousehold, type FamilyRecord } from '../family/facts.js';
import { ETHNICITIES, FREQUENCIES, INCOME_COLUMN, RACES, SENSITIVE_SOURCES, isStudent, pvusdUba2026 } from '../forms/ca-pvusd-uba-2026.js';
import type { FactSpec, Pathway, Text } from './types.js';

/**
 * Pajaro Valley USD: the Universal Benefits Application 2026 (SUN Bucks, and it counts the
 * child for LCFF). A flat PDF, printed and returned on paper (docs/REPLICA-DISTRICTS.md).
 *
 * The form says to call Food & Nutrition Services first, because the child may already qualify
 * (direct certification). So the precheck asks the archive first: CalFresh, CalWORKs, Medi-Cal
 * at or under 185% FPL, or a foster, homeless or migrant child → don't file; offer to confirm
 * with the office instead.
 */

const ANY: FactSpec['sources'] = ['district', 'document', 'parent', 'derived'];
const NO_DERIVED: FactSpec['sources'] = ['district', 'document', 'parent'];

const anyStudent = (rec: FamilyRecord) => rec.memberIds().some((id) => rec.get<boolean>(`member.${id}.student`)?.value === true);
const anyOnProgram = (rec: FamilyRecord) =>
  rec.memberIds().some((id) => (rec.get<string[]>(`member.${id}.benefits`)?.value ?? []).some((b) => ['snap', 'tanf', 'medicaid'].includes(b)));

export const PVUSD_UBA_FACTS: FactSpec[] = [
  // Everyone in the household, by name (the form has no household-size box: the rows are the count).
  { key: 'member.<m>.first_name', kind: 'string', required: true, sources: ANY, ask: { en: "What's their first name?", es: '¿Cuál es su nombre?' } },
  { key: 'member.<m>.last_name', kind: 'string', required: true, sources: ANY, ask: { en: "And their last name?", es: '¿Y su apellido?' } },
  { key: 'member.<m>.middle_initial', kind: 'string', required: false, sources: ANY, ask: { en: 'Do they have a middle initial?', es: '¿Tiene una inicial de segundo nombre?' } },
  { key: 'member.<m>.relationship', kind: 'enum', options: ['self', 'spouse', 'child', 'parent', 'other'], required: true, sources: ANY, ask: { en: 'How are they related to you?', es: '¿Qué parentesco tiene con usted?' } },
  { key: 'member.<m>.dob', kind: 'date', required: true, sources: NO_DERIVED, ask: { en: "What's their date of birth?", es: '¿Cuál es su fecha de nacimiento?' } },
  { key: 'member.<m>.student', kind: 'boolean', required: true, sources: ANY, ask: { en: 'Do they go to school (TK through 12th grade)?', es: '¿Va a la escuela (de TK a 12.º grado)?' } },
  // Each student.
  { key: 'member.<m>.school', kind: 'string', required: anyStudent, sources: ANY, ask: { en: 'Which school do they go to?', es: '¿A qué escuela va?' } },
  { key: 'member.<m>.grade', kind: 'string', required: anyStudent, sources: ANY, ask: { en: 'What grade are they in?', es: '¿En qué grado está?' } },
  {
    key: 'member.<m>.foster', kind: 'boolean', required: anyStudent, sensitive: true, sources: SENSITIVE_SOURCES,
    ask: { en: 'Is this child in foster care with you? It only helps them qualify.', es: '¿Este niño está con usted en cuidado de crianza (foster)? Solo le ayuda a calificar.' },
  },
  {
    key: 'member.<m>.homeless', kind: 'boolean', required: anyStudent, sensitive: true, sources: SENSITIVE_SOURCES,
    ask: { en: "Right now, are you without a steady place of your own to stay (staying with others, in a motel, shelter or car)? It's private and only helps.", es: 'Ahora mismo, ¿no tienen un lugar fijo propio donde quedarse (con otras personas, en un motel, albergue o carro)? Es privado y solo ayuda.' },
  },
  {
    key: 'member.<m>.migrant', kind: 'boolean', required: anyStudent, sensitive: true, sources: SENSITIVE_SOURCES,
    ask: { en: 'Has the family moved in the last few years for farm, fishing or food-processing work? The school calls this "migrant"; it only helps.', es: '¿La familia se ha mudado en los últimos años por trabajo en el campo, la pesca o el procesamiento de alimentos? La escuela lo llama "migrante"; solo ayuda.' },
  },
  // Benefits (the precheck, and the case number).
  {
    key: 'member.<m>.benefits', kind: 'list', options: ['snap', 'tanf', 'medicaid', 'foster_care', 'fdpir', 'homeless_liaison', 'head_start'], required: true, sensitive: true, sources: SENSITIVE_SOURCES,
    ask: { en: 'Does anyone in the home get CalFresh, CalWORKs or Medi-Cal?', es: '¿Alguien en su hogar recibe CalFresh, CalWORKs o Medi-Cal?' },
  },
  { key: 'household.case_number', kind: 'string', required: anyOnProgram, sources: NO_DERIVED, ask: { en: "What's the case number on your CalFresh, CalWORKs or Medi-Cal letter?", es: '¿Cuál es el número de caso en su carta de CalFresh, CalWORKs o Medi-Cal?' } },
  { key: 'household.medicaid_income_fpl_percent', kind: 'number', required: false, sources: ['district', 'document'], ask: { en: '', es: '' } },
  // Income.
  { key: 'household.income_reported', kind: 'boolean', required: true, sources: ['parent', 'document'], ask: { en: 'Does anyone in the home have income: work, child support, benefits, a pension?', es: '¿Alguien en su hogar tiene ingresos: trabajo, manutención, beneficios, una pensión?' } },
  { key: 'income.<n>.owner', kind: 'string', required: true, sources: NO_DERIVED, ask: { en: 'Whose income is it?', es: '¿De quién es ese ingreso?' } },
  { key: 'income.<n>.kind', kind: 'enum', options: Object.keys(INCOME_COLUMN), required: true, sources: NO_DERIVED, ask: { en: 'Is that from work, from assistance or child support, or something else like a pension or Social Security?', es: '¿Es de trabajo, de asistencia o manutención, u otra cosa como una pensión o el Seguro Social?' } },
  { key: 'income.<n>.amount', kind: 'number', required: true, sources: NO_DERIVED, ask: { en: 'How much is each payment, before deductions?', es: '¿Cuánto es cada pago, antes de deducciones?' } },
  {
    // The form takes weekly, every two weeks, twice a month or monthly. A yearly figure is asked
    // again as one of these (how is it paid?), not divided by us.
    key: 'income.<n>.frequency', kind: 'enum', options: [...FREQUENCIES], required: true, sources: NO_DERIVED,
    ask: { en: 'How often is it paid: every week, every two weeks, twice a month, or once a month?', es: '¿Con qué frecuencia se paga: cada semana, cada dos semanas, dos veces al mes o una vez al mes?' },
  },
  // The adult who signs, and how to reach them (the SUN Bucks card is mailed).
  { key: 'contact.signer', kind: 'string', required: true, sources: ['parent'], ask: { en: 'Which adult will sign the form?', es: '¿Qué adulto va a firmar el formulario?' } },
  { key: 'contact.street', kind: 'string', required: true, sources: NO_DERIVED, ask: { en: "What's your street address?", es: '¿Cuál es su dirección?' } },
  { key: 'contact.city', kind: 'string', required: true, sources: NO_DERIVED, ask: { en: 'Which city?', es: '¿En qué ciudad?' } },
  { key: 'contact.state', kind: 'string', required: true, sources: NO_DERIVED, ask: { en: 'Which state?', es: '¿En qué estado?' } },
  { key: 'contact.zip', kind: 'string', required: true, sources: NO_DERIVED, ask: { en: "What's the ZIP code?", es: '¿Cuál es el código postal?' } },
  { key: 'contact.phone', kind: 'string', required: true, sources: NO_DERIVED, ask: { en: "What's the best phone number for the school to reach you?", es: '¿A qué número de teléfono puede llamarle la escuela?' } },
  { key: 'contact.email', kind: 'string', required: false, sources: NO_DERIVED, ask: { en: 'Do you want to add an email?', es: '¿Quiere agregar un correo electrónico?' } },
  // Page 2, optional; never inferred, never pushed.
  {
    key: 'household.ethnicity', kind: 'enum', options: [...ETHNICITIES], required: false, sensitive: true, sources: ['parent'],
    ask: { en: 'The form asks (optional, it never affects eligibility): Hispanic or Latino?', es: 'El formulario pregunta (opcional, no afecta la elegibilidad): ¿hispano o latino?' },
  },
  {
    key: 'household.race', kind: 'list', options: [...RACES], required: false, sensitive: true, sources: ['parent'],
    ask: { en: 'And race, if you want to answer (optional)?', es: '¿Y la raza, si quiere contestar (opcional)?' },
  },
];

const ALREADY: Text = {
  en: 'Your child likely already qualifies without this form. Let me confirm with Pajaro Valley Food & Nutrition Services (831-786-2325) before we fill anything in.',
  es: 'Es probable que su hijo ya califique sin este formulario. Déjeme confirmarlo con Servicios de Alimentos y Nutrición de Pajaro Valley (831-786-2325) antes de llenar nada.',
};
const FILE: Text = {
  en: "Your child isn't automatically covered from what you've told me, so this form is the way: it gets SUN Bucks for the summer and counts your child for the school's funding.",
  es: 'Por lo que me ha dicho, su hijo no está cubierto automáticamente, así que este formulario es el camino: le da SUN Bucks para el verano y cuenta a su hijo para los fondos de la escuela.',
};
const UNCHECKED: Text = {
  en: "I couldn't check yet whether your child is already covered. The form itself says to call Food & Nutrition Services (831-786-2325) first; I can do that, or we can fill it in.",
  es: 'Todavía no pude revisar si su hijo ya está cubierto. El formulario dice que primero se llame a Servicios de Alimentos y Nutrición (831-786-2325); puedo hacerlo yo, o podemos llenarlo.',
};

/** Archive results that mean "covered without this form" (school_meals/federal/rules.py). */
const COVERED_RULES = new Set(['SCH-FED-CATEGORICAL-PROGRAM', 'SCH-FED-CATEGORICAL-INDIVIDUAL', 'SCH-FED-DC-SNAP', 'SCH-CA-DCM-MEDI-CAL']);

export function coveredByDetermination(d: Determination): boolean {
  if (d.links.some((l) => l === 'snap:direct_certification' || l.startsWith('medicaid:direct_certification_'))) return true;
  return d.reasons.some((r) => r.passed === true && COVERED_RULES.has(r.rule));
}

export const pvusdUba: Pathway = {
  id: 'ca.pvusd.uba',
  title: { en: 'Universal Benefits Application (SUN Bucks), Pajaro Valley USD', es: 'Solicitud de Beneficios Universales (SUN Bucks), Pajaro Valley USD' },
  state: 'ca',
  district: 'Pajaro Valley Unified (CDS 4469799)',
  program: 'school_meals',
  facts: PVUSD_UBA_FACTS,

  async precheck(rec, archive: ArchiveClient, asOf) {
    // The archive decides "covered" for the household; each student's own foster, homeless
    // or migrant status is checked too, because the archive looks at one target student.
    const students = rec.memberIds().filter((id) => isStudent(rec, id, asOf).student);
    const ownStatus = students.some((id) =>
      (['foster', 'homeless', 'migrant'] as const).some((f) => {
        const fact = rec.get<boolean>(`member.${id}.${f}`);
        return fact?.value === true && SENSITIVE_SOURCES.includes(fact.source.kind);
      }),
    );
    const projection = schoolMealsHousehold(rec, asOf);
    if (!projection.household) {
      if (ownStatus) return { file: false, why: ALREADY };
      return { file: true, why: UNCHECKED };
    }
    let determination: Determination;
    try {
      determination = await archive.evaluate('school_meals', projection.household, asOf);
    } catch (e) {
      if (e instanceof ArchiveUnavailable) return { file: !ownStatus, why: ownStatus ? ALREADY : UNCHECKED };
      throw e;
    }
    if (ownStatus || coveredByDetermination(determination)) return { file: false, why: ALREADY, determination };
    return { file: true, why: FILE, determination };
  },

  form: pvusdUba2026,
  lanes: ['pdf', 'paper'],
  confirmation: {
    kind: 'none',
    describe: {
      en: "No receipt. The only confirmation is the school's notice of the result (or Food & Nutrition Services confirming by phone).",
      es: 'No hay comprobante. La única confirmación es el aviso de la escuela con el resultado (o que Servicios de Alimentos y Nutrición lo confirme por teléfono).',
    },
  },
  // Offered after: CalFresh (archive program "snap"), when the archive says the household is
  // likely eligible. Static ids for now; the engine decides with the archive.
  opensNext: ['ca.calfresh'],
};

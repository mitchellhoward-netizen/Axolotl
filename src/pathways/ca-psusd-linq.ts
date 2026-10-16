import { ArchiveUnavailable, type ArchiveClient, type Determination } from '../archive/client.js';
import { schoolMealsHousehold, type FamilyRecord } from '../family/facts.js';
import { makeLinqIncomeForm, PSUSD_INCOME_MODE } from '../forms/ca-psusd-linq-income-form-2026.js';
import { REFERENCE_PATTERN } from '../replicas/linq-income-form.js';
import { coveredByDetermination, PVUSD_UBA_FACTS } from './ca-pvusd-uba.js';
import type { FactSpec, Pathway, Text } from './types.js';

/**
 * Palm Springs USD: the LINQ Connect "Income Form", an LCFF alternative income form, filed on
 * the public web form, confirmed by its reference code (docs/REPLICA-DISTRICTS.md).
 *
 * It counts the child for the school's funding. It does NOT get SUN Bucks (an alternative
 * income form doesn't; the district's separate LINQ UBA does), so the helper never says it does.
 */

/** The facts this form reads, with Pajaro's questions where the fact is the same. */
const SHARED = new Set([
  'member.<m>.first_name',
  'member.<m>.last_name',
  'member.<m>.relationship',
  'member.<m>.dob',
  'member.<m>.student',
  'member.<m>.school',
  'member.<m>.grade',
  'member.<m>.benefits',
  'household.case_number',
  'household.medicaid_income_fpl_percent',
  'household.income_reported',
  'income.<n>.amount',
  'income.<n>.frequency',
]);

const anyStudent = (rec: FamilyRecord) => rec.memberIds().some((id) => rec.get<boolean>(`member.${id}.student`)?.value === true);

export const PSUSD_LINQ_FACTS: FactSpec[] = [
  ...PVUSD_UBA_FACTS.filter((f) => SHARED.has(f.key)),
  {
    key: 'member.<m>.student_id',
    kind: 'string',
    required: anyStudent,
    sources: ['district', 'document', 'parent'],
    ask: { en: "What's their student ID number? It's on a report card or the school's app.", es: '¿Cuál es su número de estudiante? Está en la boleta de calificaciones o en la aplicación de la escuela.' },
  },
  {
    key: 'household.size',
    kind: 'number',
    required: false,
    sources: ['parent', 'derived'],
    ask: { en: 'How many people live in your home, counting you?', es: '¿Cuántas personas viven en su hogar, contándose usted?' },
  },
];

const ALREADY: Text = {
  en: "Your child likely already counts without this form, from what you've told me. I'd confirm with Palm Springs USD Nutrition and Wellness before filling anything in.",
  es: 'Por lo que me ha dicho, es probable que su hijo ya cuente sin este formulario. Lo confirmaría con Nutrición y Bienestar de Palm Springs USD antes de llenar nada.',
};
const FILE: Text = {
  en: "This form counts your child for the school's funding. It takes a few minutes and doesn't change your child's free meals. (It doesn't get SUN Bucks; that's a separate form I can help with after.)",
  es: 'Este formulario cuenta a su hijo para los fondos de la escuela. Toma unos minutos y no cambia las comidas gratis de su hijo. (No da SUN Bucks; ese es otro formulario con el que le puedo ayudar después.)',
};
const UNCHECKED: Text = {
  en: "I couldn't check yet whether your child already counts, so let's fill it in; it doesn't hurt to send it.",
  es: 'Todavía no pude revisar si su hijo ya cuenta, así que llenémoslo; no hace daño enviarlo.',
};

export const psusdLinq: Pathway = {
  id: 'ca.psusd.linq',
  title: { en: 'Income Form, Palm Springs USD', es: 'Formulario de Ingresos, Palm Springs USD' },
  state: 'ca',
  district: 'Palm Springs Unified (CDS 3367173)',
  program: 'school_meals',
  facts: PSUSD_LINQ_FACTS,

  async precheck(rec, archive: ArchiveClient, asOf) {
    const projection = schoolMealsHousehold(rec, asOf);
    if (!projection.household) return { file: true, why: UNCHECKED };
    let determination: Determination;
    try {
      determination = await archive.evaluate('school_meals', projection.household, asOf);
    } catch (e) {
      if (e instanceof ArchiveUnavailable) return { file: true, why: UNCHECKED };
      throw e;
    }
    if (coveredByDetermination(determination)) return { file: false, why: ALREADY, determination };
    return { file: true, why: FILE, determination };
  },

  form: makeLinqIncomeForm(PSUSD_INCOME_MODE),
  lanes: ['direct'],
  confirmation: {
    kind: 'reference',
    pattern: REFERENCE_PATTERN,
    describe: { en: 'The reference code LINQ shows when the form is filed.', es: 'El código de referencia que muestra LINQ al enviar el formulario.' },
  },
  // The district's separate LINQ UBA gets SUN Bucks; CalFresh when the archive says likely eligible.
  opensNext: ['ca.psusd.linq-uba', 'ca.calfresh'],
};

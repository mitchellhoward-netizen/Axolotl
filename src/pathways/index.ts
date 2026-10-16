import type { FaqEntry, PathwayHints, PathwayRegistry } from './registry.js';
import { pvusdUba } from './ca-pvusd-uba.js';
import { psusdLinq } from './ca-psusd-linq.js';

/**
 * The launch pathways and how the engine should run them. Lanes are registered by whoever runs
 * them (production, or the harness against a replica), because a lane is bound to a place.
 */

const ON_PROGRAM = (v: unknown) => Array.isArray(v) && v.some((b) => ['snap', 'tanf', 'medicaid'].includes(String(b)));

/** Side questions parents ask about an income form, answered in place. Plain and true:
 * school meal benefits are not part of the public charge test (USCIS, 8 CFR 212.21(b)), and
 * income on a meals application is confidential (42 U.S.C. 1758(b)(6)). */
const MEALS_FAQ: FaqEntry[] = [
  {
    id: 'what',
    match: /\b(what is (this|it|that)|what'?s (this|it|that)( for)?|what is (the|this) (form|paper)|what does (it|this) do|que es (esto|este|eso)|para que (es|sirve))\b/,
    answer: {
      en: "It's the school's income form: it tells the school your household's income so your child gets the benefits and the school gets the funding that come with it.",
      es: 'Es el formulario de ingresos de la escuela: le dice a la escuela los ingresos de su hogar para que su hijo reciba los beneficios y la escuela los fondos que vienen con eso.',
    },
  },
  {
    id: 'must',
    match: /\b(do i (have|need) to|is (it|this) (required|mandatory)|have to do (it|this)|tengo que|es obligatorio|es necesario)\b/,
    answer: {
      en: "You don't have to, but it only helps your child and the school, and it doesn't change anything you already get.",
      es: 'No es obligatorio, pero solo le ayuda a su hijo y a la escuela, y no cambia nada de lo que ya recibe.',
    },
  },
  {
    id: 'immigration',
    match: /\b(immigra\w*|migratori\w*|public charge|carga publica|green card|papeles|documentos? (de )?(inmigracion|migratorios)|citizen\w*|ciudadan\w*)\b/,
    answer: {
      en: "No. This form doesn't ask about immigration status, and school meal benefits don't count against anyone's immigration case (they aren't part of the public charge test).",
      es: 'No. Este formulario no pregunta por el estatus migratorio, y los beneficios de comida escolar no cuentan en contra de nadie en un caso de inmigración (no son parte de la regla de carga pública).',
    },
  },
  {
    id: 'privacy',
    match: /\b(who (will|can|is going to) see|will (the school|they|teachers?) see|see how much|who sees|is (it|this) private|confidential|privad[oa]|confidencial|quien (va a )?ver|va a ver cuanto|van a ver cuanto|la escuela va a ver)\b/,
    answer: {
      en: "Only the staff who handle meal benefits see your income, and the law keeps it confidential: it isn't shared with teachers or other families.",
      es: 'Solo el personal que maneja los beneficios de comida ve sus ingresos, y la ley los mantiene confidenciales: no se comparten con los maestros ni con otras familias.',
    },
  },
  {
    id: 'sick',
    statement: true,
    match: /\b(is sick|are sick|is ill|feeling sick|won'?t be at school|not going to school|will be absent|esta enferm[oa]|estan enferm[oa]s|no va a la escuela|no va a ir a la escuela|va a faltar)\b/,
    answer: {
      en: "I'm sorry to hear that, I hope they feel better soon. Once we finish this form I can help you let the school know about the absence.",
      es: 'Siento escuchar eso, espero que se mejore pronto. Cuando terminemos este formulario le puedo ayudar a avisarle a la escuela de la falta.',
    },
  },
  {
    id: 'how_long',
    match: /\b(how long|how many (more )?questions|cuanto (tiempo|tarda|se tarda)|cuantas preguntas)\b/,
    answer: { en: 'Just a few more questions, a few minutes in all.', es: 'Solo unas preguntas más, unos minutos en total.' },
  },
  {
    id: 'needed',
    match: /\b(what do you need( from me)?|what info(rmation)? do you need|que necesita(s)? (de mi|saber)|que informacion necesita)\b/,
    answer: {
      en: "Just a few answers by text: who lives with you and the income in your home. I already have your children's school details.",
      es: 'Solo unas respuestas por mensaje: quiénes viven con usted y los ingresos de su hogar. Ya tengo los datos escolares de sus hijos.',
    },
  },
];

/** Ask about CalFresh / CalWORKs / Medi-Cal first: a yes usually means nothing to file. */
export const MEALS_FORM_HINTS: PathwayHints = {
  precheckFacts: ['member.<m>.benefits'],
  shortCircuit: { 'member.<m>.benefits': { when: ON_PROGRAM, prior: 0.35 } },
  why: {
    'member.<m>.benefits': {
      en: 'If someone gets CalFresh, CalWORKs or Medi-Cal, your child is probably already covered and we may not need this form.',
      es: 'Si alguien recibe CalFresh, CalWORKs o Medi-Cal, es probable que su hijo ya esté cubierto y quizá no necesitemos este formulario.',
    },
    'member.<m>.foster': { en: 'A child in foster care gets free meals, whatever the household earns.', es: 'Un niño en cuidado de crianza recibe comidas gratis, sin importar los ingresos del hogar.' },
    'member.<m>.homeless': { en: 'A child without a steady home gets free meals and other help at school.', es: 'Un niño sin hogar fijo recibe comidas gratis y otra ayuda en la escuela.' },
    'member.<m>.migrant': { en: 'Migrant children get free meals and extra help at school.', es: 'Los niños migrantes reciben comidas gratis y ayuda extra en la escuela.' },
  },
  cues: { 'member.<m>.benefits': /calfresh|cal fresh|cupones|estampillas|ebt|calworks|medi-?cal|snap/i },
  trigger: /\b(lunch|meal|income) (form|application|paper)|universal benefits|sun bucks|formulario de (ingresos|comida|almuerzo)|solicitud de comida/i,
  people: true,
  faq: MEALS_FAQ,
  examples: {
    'member.<m>.benefits': { en: 'No, we don’t get any of those', es: 'No, no recibimos ninguno' },
    'household.case_number': { en: 'The case number is C1234567', es: 'El número de caso es C1234567' },
    'member.p.name': { en: 'I’m Ana García', es: 'Me llamo Ana García' },
    'household.roster': { en: 'Me (34), my husband Luis García (36) and my kids Sofía and Mateo', es: 'Yo (34), mi esposo Luis García (36) y mis hijos Sofía y Mateo' },
    'income.amount': { en: 'I make $1,200 every two weeks', es: 'Gano $1,200 cada dos semanas' },
    'member.<m>.foster': { en: 'No, none of them', es: 'No, ninguno' },
    'member.<m>.homeless': { en: 'No, none of them', es: 'No, ninguno' },
    'member.<m>.migrant': { en: 'No, none of them', es: 'No, ninguno' },
    'contact.street': { en: '123 Main St, Watsonville, CA 95076', es: '123 Calle Principal, Watsonville, CA 95076' },
    'contact.phone': { en: '831-555-0100', es: '831-555-0100' },
  },
  where: {
    'household.case_number': { en: "It's on your CalFresh, CalWORKs or Medi-Cal letter, or your BenefitsCal account.", es: 'Está en su carta de CalFresh, CalWORKs o Medi-Cal, o en su cuenta de BenefitsCal.' },
    'income.<n>.amount': { en: 'A recent pay stub has it, before taxes.', es: 'Un talón de pago reciente lo tiene, antes de impuestos.' },
    'member.<m>.has_income': { en: 'A recent pay stub has it, before taxes.', es: 'Un talón de pago reciente lo tiene, antes de impuestos.' },
  },
  flagAsk: {
    foster: { en: 'Are any of the children in foster care with you?', es: '¿Alguno de los niños está con usted en cuidado de crianza (foster)?' },
    homeless: {
      en: 'Right now, is the family staying somewhere without a steady home of its own, like with others, in a motel, a shelter or a car?',
      es: 'Ahora mismo, ¿la familia está sin hogar fijo propio, por ejemplo con otras personas, en un motel, un refugio o un carro?',
    },
    migrant: {
      en: 'In the last three years, has the family moved for farm work, fishing or food processing (schools call this "migrant")?',
      es: 'En los últimos tres años, ¿la familia se mudó por trabajo agrícola, la pesca o el procesamiento de alimentos (lo que la escuela llama "migrante")?',
    },
  },
  fieldLabels: {
    first_name: { en: 'first name', es: 'primer nombre' },
    last_name: { en: 'last name', es: 'apellido' },
    mi: { en: 'middle initial', es: 'inicial del segundo nombre' },
    dob: { en: 'date of birth', es: 'fecha de nacimiento' },
    student_id: { en: 'student ID', es: 'número de estudiante' },
    school: { en: 'school', es: 'escuela' },
    grade: { en: 'grade', es: 'grado' },
    foster: { en: 'in foster care', es: 'en cuidado de crianza (foster)' },
    homeless: { en: 'homeless', es: 'sin hogar' },
    migrant: { en: 'migrant', es: 'migrante' },
    income_amount: { en: 'income', es: 'ingreso' },
    income_frequency: { en: 'income, how often', es: 'ingreso, cada cuánto' },
    work_amount: { en: 'income from work', es: 'ingreso de trabajo' },
    work_frequency: { en: 'income from work, how often', es: 'ingreso de trabajo, cada cuánto' },
    assistance_amount: { en: 'child support or assistance income', es: 'ingreso de manutención o asistencia' },
    assistance_frequency: { en: 'child support or assistance income, how often', es: 'ingreso de manutención o asistencia, cada cuánto' },
    other_amount: { en: 'other income (pension, retirement)', es: 'otro ingreso (pensión, jubilación)' },
    other_frequency: { en: 'other income, how often', es: 'otro ingreso, cada cuánto' },
    case_number: { en: 'case number', es: 'número de caso' },
    printed_name: { en: 'printed name (the adult filling it out)', es: 'nombre en letra de molde (el adulto que lo llena)' },
    signer_name: { en: 'name of the adult filling it out', es: 'nombre del adulto que lo llena' },
    email: { en: 'email', es: 'correo electrónico' },
    street: { en: 'street address', es: 'dirección' },
    city_state_zip: { en: 'city, state, ZIP', es: 'ciudad, estado, código postal' },
    phone: { en: 'phone', es: 'teléfono' },
    household_size: { en: 'people in your home', es: 'personas en su casa' },
    income_range: { en: 'yearly household income range', es: 'rango de ingresos del hogar al año' },
    total_income: { en: 'yearly household income', es: 'ingresos del hogar al año' },
    ethnicity: { en: 'ethnicity', es: 'etnia' },
  },
  labels: {
    certify: { en: 'the box that says the information is true', es: 'la casilla que dice que la información es verdadera' },
    signature: { en: 'the signature at the bottom of page 1', es: 'la firma al final de la página 1' },
    date: { en: "today's date beside it", es: 'la fecha de hoy al lado' },
  },
};

const PVUSD_HINTS: PathwayHints = {
  ...MEALS_FORM_HINTS,
  introName: { en: "Pajaro Valley Unified's Universal Benefits Application", es: 'la Solicitud de Beneficios Universales de Pajaro Valley Unified' },
  intro: {
    en: "It's the district's form for SUN Bucks ($120 per child for groceries next summer), and it also counts your child for the school's funding. You don't have to fill it out, but it only helps, and it's private.",
    es: 'Es el formulario del distrito para SUN Bucks ($120 por niño para comida el próximo verano), y también cuenta a su hijo para los fondos de la escuela. No es obligatorio, pero solo ayuda, y es privado.',
  },
  optional: ['contact.email'],
};

const PSUSD_HINTS: PathwayHints = {
  ...MEALS_FORM_HINTS,
  notListed: {
    en: '{names} is counted: this form lists only the students and up to two parents by name. Everyone else in the home is in "People in your home", and their income is in the yearly household income range.',
    es: '{names} sí cuenta: este formulario solo lleva por nombre a los estudiantes y hasta dos padres. Todos los demás en la casa están en "Personas en su casa", y sus ingresos en el rango de ingresos del hogar al año.',
  },
  introName: { en: "Palm Springs Unified's Income Form", es: 'el Formulario de Ingresos de Palm Springs Unified' },
  intro: {
    en: "It tells the district your household's income range so your child counts for the school's funding (it pays for things like tutoring and counselors). You don't have to fill it out, but it helps your child's school, it's private, and it doesn't change your child's free meals.",
    es: 'Le dice al distrito el rango de ingresos de su hogar para que su hijo cuente para los fondos de la escuela (pagan cosas como tutorías y consejeros). No es obligatorio, pero ayuda a la escuela de su hijo, es privado, y no cambia las comidas gratis de su hijo.',
  },
};

export function registerLaunchPathways(registry: PathwayRegistry): PathwayRegistry {
  return registry.registerPathway(pvusdUba, PVUSD_HINTS).registerPathway(psusdLinq, PSUSD_HINTS);
}

export { pvusdUba, psusdLinq };

import type { Lang } from './types.js';

/**
 * What the helper says at each known step of a pathway, in English and Spanish, kept in step.
 * Short, warm and plain (VISION §11): no codes, no all-caps, no jargon. The model is not
 * needed for any of these; the engine fills in the values. Spanish uses "usted": a school
 * helper writing to a parent it hasn't met.
 *
 * Two rules for anything that asks a question: one question per message, and the question is
 * the last thing in it, so the parent always knows what we're waiting for.
 */

export interface Replies {
  start(title: string, first: string): string;
  /** The first message of a session: what the form is, why, and the first question. */
  intro(title: string, about: string | undefined, first: string): string;
  gotIt: string;
  corrected(changes: Array<{ label: string; from: string; to: string }>): string;
  sensitive(ask: string, why: string | undefined, optional: boolean): string;
  didntCatch(ask: string, example?: string): string;
  /** "I'm not sure what you mean": say it another way. */
  rephrase(ask: string, example?: string): string;
  /** "So can you help me with the form?": yes, and here's where we are. */
  keepGoing(ask: string): string;
  dontKnow: string;
  dontKnowAsk(ask: string, where?: string): string;
  why(reason: string | undefined, ask: string): string;
  declinedRequired: string;
  skipped: string;
  handoffOffer: string;
  handoff: string;
  covered(why: string): string;
  proposal(lines: string[], attest: boolean): string;
  updated(proposal: string): string;
  confirmOnce: string;
  proposalUnclear: string;
  proposalRephrase: string;
  whichLine: string;
  declined: string;
  attest(fields: string[], how?: string): string;
  attestLink(link: string): string;
  attestFile(file: string): string;
  attestAgain: string;
  attestDeclined: string;
  done(summary: string, ref: string): string;
  unconfirmed(summary: string): string;
  mismatch(labels: string[], summary: string): string;
  failed(summary: string): string;
  laneHandoff(summary: string): string;
  noLane: string;
  next(titles: string[]): string;
  paused: string;
  resume: string;
  interrupted(proposal: string): string;
  cantAsk(labels: string[]): string;
  yes: string;
  no: string;
  // People and money (the income forms).
  askSelfName: string;
  askRoster(kids: string[]): string;
  askIncomeSelf: string;
  askIncomeOf(name: string): string;
  askMoreIncomeSelf: string;
  askMoreIncomeOf(name: string): string;
  askAnyoneElseIncome: string;
  askFrequency(owner: string | undefined, amount: string): string;
  askKind(owner: string | undefined, amount: string): string;
  askOwner(amount: string): string;
  askLastName(first: string, self: boolean): string;
  askWhich(flag: string): string;
  askAddress: string;
  you: string;
  your(field: string): string;
  of(name: string, field: string): string;
  list(xs: string[]): string;
}

const join = (xs: string[], and: string) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} ${and} ${xs[xs.length - 1]}`);

const en: Replies = {
  start: (title, first) => `I can help you with ${title}. It's a few questions, and nothing gets sent until you say yes.\n\n${first}`,
  intro: (title, about, first) =>
    `Hi! I can help you with ${title}.${about ? ` ${about}` : ''} It's a few questions by text, and I won't send anything until you've seen it all and okayed it.\n\n${first}`,
  gotIt: 'Got it.',
  corrected: (cs) => `Got it, I changed ${join(cs.map((c) => `${c.label} from ${c.from} to ${c.to}`), 'and')}.`,
  sensitive: (ask, why, optional) =>
    `This next one is personal, so share only what you're comfortable with.${why ? ` ${why}` : ''}${optional ? ' You can also say skip.' : ''} ${ask}`,
  didntCatch: (ask, example) => `Sorry, I didn't catch that.${example ? ` For example: "${example}".` : ''} ${ask}`,
  rephrase: (ask, example) => `Sorry, let me put it another way.${example ? ` You could answer like: "${example}".` : ''} ${ask}`,
  keepGoing: (ask) => `Yes, I'm helping you with it right now. Here's the next thing the form needs. ${ask}`,
  dontKnow: "That's okay. When you have it, just text it to me here and we'll pick up where we left off.",
  dontKnowAsk: (ask, where) => `That's okay, no rush.${where ? ` ${where}` : ''} When you have it, just text it to me here and we'll pick up where we left off. ${ask}`,
  why: (reason, ask) => `${reason ?? 'The form asks for it, and I only use it for this form.'} ${ask}`,
  declinedRequired:
    "That's fine. This one has to be on the form, so I can't send it without it. Want me to connect you with a person who can help?",
  skipped: "No problem, we'll skip that one.",
  handoffOffer: "I'm having trouble getting this one right over text, and I don't want to guess. Want me to connect you with a person who can help?",
  handoff: "Okay. I'll pass this to a person who can help, and they'll reach out. Everything you've told me is saved, so you won't have to start over.",
  covered: (why) => `${why}\n\nSo there's nothing to fill out for this one.`,
  proposal: (lines, attest) =>
    `Here is everything the form will say:\n${lines.join('\n')}\n\n${attest ? "You'll sign the certification yourself. I never do that part for you.\n\n" : ''}Want me to send it? Or tell me what to change.`,
  updated: (proposal) => `Updated.\n\n${proposal}`,
  confirmOnce: 'Just to check: want me to send the form as shown above?',
  proposalUnclear: 'Want me to send it as shown, or change something?',
  proposalRephrase: 'Sorry, I should be clearer. Everything above is what I would put on the form. If it all looks right, say yes and I will send it; if something is wrong, tell me which line and what it should say. Want me to send it?',
  whichLine: 'Thanks for checking. Which line is wrong, and what should it say? For example: "Sofía — grade is wrong, it should be 4".',
  declined: "Okay, I won't send anything. Your answers are saved. Say continue whenever you want to pick it back up.",
  attest: (fields, how) =>
    `Almost there. The last step needs your own signature: ${join(fields, 'and')}. That part is yours, so I won't do it for you.${how ? `\n${how}` : ''}\nTell me once you've added your signature.`,
  attestLink: (link) => `Open your link and check the box yourself: ${link}`,
  attestFile: (file) => `The filled form is ready to print: ${file}`,
  attestAgain: "Tell me when you've signed it, or say no if you'd rather not.",
  attestDeclined: 'Okay. Nothing goes in without your signature. Your answers are saved if you change your mind.',
  done: (summary, ref) => (/^done\b/i.test(summary) ? `${summary}\nYour confirmation: ${ref}.` : `Done. ${summary}\nYour confirmation: ${ref}.`.replace('Done. \n', 'Done.\n')),
  unconfirmed: (summary) => `I sent it, but I don't have a confirmation yet, so it isn't done until they confirm.${summary ? ` ${summary}` : ''}`,
  mismatch: (labels, summary) =>
    `I sent it, but ${join(labels, 'and')} didn't read back the way you approved, so I'm not counting it as done.${summary ? ` ${summary}` : ''}`,
  failed: (summary) => `It didn't go through, and nothing is confirmed.${summary ? ` ${summary}` : ''}`,
  laneHandoff: (summary) => `I can't finish this one myself.${summary ? ` ${summary}` : ''}`,
  noLane: "Everything is ready, but I can't send this form myself yet. I'll pass it, with the values you approved, to a person who can finish it.",
  next: (titles) => `I can also help with ${join(titles, 'and')}. Want to do that next?`,
  paused: "No problem. I'll keep what you've told me. Just say continue when you're ready.",
  resume: "Let's pick up where we left off.",
  interrupted: (proposal) => `Something interrupted that on my side, and nothing is confirmed. Here it is again:\n\n${proposal}`,
  cantAsk: (labels) => `I need ${join(labels, 'and')} from the school's records, not from you, so I'll pass this to a person to finish.`,
  yes: 'Yes',
  no: 'No',
  askSelfName: "First, what's your first and last name? It goes on the form as the adult filling it out.",
  askRoster: (kids) =>
    `Who lives in your home with you? Please give me everyone's first and last name, and their age${kids.length ? `, including ${join(kids, 'and')}` : ''}: a partner, grandparents, other children, anyone who shares the rent and food.`,
  askIncomeSelf: 'Now income. How much do you make from work, before taxes? If you have no income, just say none.',
  askIncomeOf: (name) => `Does ${name} have income from work? If so, how much does ${name} make before taxes?`,
  askMoreIncomeSelf: 'Any other income for you, like support payments, SSI, unemployment or another job? If not, just say no.',
  askMoreIncomeOf: (name) => `Any other income for ${name}, like support payments, SSI, a pension or another job? If not, just say no.`,
  askAnyoneElseIncome: 'Does anyone else in the home have income, like a teenager with a job? If not, just say no.',
  askFrequency: (owner, amount) => `How often ${owner ? `does ${owner} get` : 'is'} the ${amount}: every week, every two weeks, twice a month, or once a month?`,
  askKind: (owner, amount) => `What kind of income is ${owner ? `${owner}'s` : 'the'} ${amount}: pay from work, or something else like support payments or SSI?`,
  askOwner: (amount) => `Whose income is the ${amount}?`,
  askLastName: (first, self) => (self ? `Just so I get it right on the form: what's your last name, ${first}?` : `Just so I get it right on the form: what's ${first}'s last name?`),
  askWhich: (flag) => `Which of the children ${flag}?`,
  askAddress: "What's your home address? The street, the city and the ZIP code.",
  you: 'You',
  your: (field) => `Your ${field}`,
  of: (name, field) => `${name} — ${field}`,
  list: (xs) => join(xs, 'and'),
};

const es: Replies = {
  start: (title, first) => `Le puedo ayudar con ${title}. Son unas preguntas, y no envío nada sin que usted lo apruebe.\n\n${first}`,
  intro: (title, about, first) =>
    `¡Hola! Le puedo ayudar con ${title}.${about ? ` ${about}` : ''} Son unas preguntas por mensaje, y no envío nada sin que usted lo revise y lo apruebe.\n\n${first}`,
  gotIt: 'Anotado.',
  corrected: (cs) => `Listo, cambié ${join(cs.map((c) => `${c.label} de ${c.from} a ${c.to}`), 'y')}.`,
  sensitive: (ask, why, optional) =>
    `La siguiente pregunta es personal, así que comparta solo lo que quiera.${why ? ` ${why}` : ''}${optional ? ' También puede decir saltar.' : ''} ${ask}`,
  didntCatch: (ask, example) => `Perdón, no le entendí.${example ? ` Por ejemplo: "${example}".` : ''} ${ask}`,
  rephrase: (ask, example) => `Perdón, se lo pregunto de otra forma.${example ? ` Puede contestar así: "${example}".` : ''} ${ask}`,
  keepGoing: (ask) => `Sí, le estoy ayudando con eso ahora mismo. Esto es lo siguiente que pide el formulario. ${ask}`,
  dontKnow: 'Está bien. Cuando lo tenga, mándemelo aquí y seguimos donde nos quedamos.',
  dontKnowAsk: (ask, where) => `Está bien, sin prisa.${where ? ` ${where}` : ''} Cuando lo tenga, mándemelo aquí y seguimos donde nos quedamos. ${ask}`,
  why: (reason, ask) => `${reason ?? 'El formulario lo pide, y solo lo uso para este formulario.'} ${ask}`,
  declinedRequired:
    'Está bien. Este dato tiene que ir en el formulario, así que no lo puedo enviar sin él. ¿Quiere que le conecte con una persona que le pueda ayudar?',
  skipped: 'Claro, nos saltamos esa.',
  handoffOffer: 'Me está costando entender este dato por mensaje, y no quiero adivinar. ¿Quiere que le conecte con una persona que le pueda ayudar?',
  handoff: 'Muy bien. Le paso esto a una persona que le puede ayudar, y se va a comunicar con usted. Guardé todo lo que me dijo, así que no tiene que empezar de nuevo.',
  covered: (why) => `${why}\n\nAsí que no hay nada que llenar para esto.`,
  proposal: (lines, attest) =>
    `Esto es todo lo que dirá el formulario:\n${lines.join('\n')}\n\n${attest ? 'La firma y la certificación las hace usted. Yo nunca hago esa parte.\n\n' : ''}¿Quiere que lo envíe? O dígame qué cambiar.`,
  updated: (proposal) => `Actualizado.\n\n${proposal}`,
  confirmOnce: 'Solo para confirmar: ¿quiere que envíe el formulario como se lo mostré?',
  proposalUnclear: '¿Quiere que lo envíe así, o cambio algo?',
  proposalRephrase: 'Perdón, debí ser más claro. Todo lo de arriba es lo que pondría en el formulario. Si todo está bien, dígame que sí y lo envío; si algo está mal, dígame qué línea y qué debe decir. ¿Quiere que lo envíe?',
  whichLine: 'Gracias por revisarlo. ¿Qué línea está mal y qué debe decir? Por ejemplo: "Sofía — grado está mal, debe ser 4".',
  declined: 'Muy bien, no envío nada. Guardé sus respuestas. Escriba seguir cuando quiera continuar.',
  attest: (fields, how) =>
    `Ya casi. El último paso necesita su propia firma: ${join(fields, 'y')}. Esa parte es suya, así que no la hago yo.${how ? `\n${how}` : ''}\nAvíseme cuando haya puesto su firma.`,
  attestLink: (link) => `Abra su enlace y marque la casilla usted mismo: ${link}`,
  attestFile: (file) => `El formulario lleno está listo para imprimir: ${file}`,
  attestAgain: 'Avíseme cuando lo haya firmado, o dígame que no si prefiere no hacerlo.',
  attestDeclined: 'Muy bien. No se envía nada sin su firma. Guardé sus respuestas por si cambia de opinión.',
  done: (summary, ref) => (/^listo\b/i.test(summary) ? `${summary}\nSu confirmación: ${ref}.` : `Listo. ${summary}\nSu confirmación: ${ref}.`.replace('Listo. \n', 'Listo.\n')),
  unconfirmed: (summary) => `Lo envié, pero todavía no tengo confirmación, así que no está listo hasta que lo confirmen.${summary ? ` ${summary}` : ''}`,
  mismatch: (labels, summary) =>
    `Lo envié, pero ${join(labels, 'y')} no quedó como lo aprobó, así que no lo cuento como listo.${summary ? ` ${summary}` : ''}`,
  failed: (summary) => `No se pudo enviar, y no hay nada confirmado.${summary ? ` ${summary}` : ''}`,
  laneHandoff: (summary) => `Esto no lo puedo terminar yo.${summary ? ` ${summary}` : ''}`,
  noLane: 'Todo está listo, pero todavía no puedo enviar este formulario yo. Se lo paso, con los datos que aprobó, a una persona que lo puede terminar.',
  next: (titles) => `También le puedo ayudar con ${join(titles, 'y')}. ¿Lo hacemos?`,
  paused: 'Claro. Guardo lo que me dijo. Escriba seguir cuando quiera continuar.',
  resume: 'Sigamos donde nos quedamos.',
  interrupted: (proposal) => `Algo lo interrumpió de mi lado, y no hay nada confirmado. Aquí está otra vez:\n\n${proposal}`,
  cantAsk: (labels) => `Necesito ${join(labels, 'y')} de los registros de la escuela, no de usted, así que le paso esto a una persona para terminarlo.`,
  yes: 'Sí',
  no: 'No',
  askSelfName: 'Primero, ¿cuál es su nombre y apellido? Va en el formulario como el adulto que lo llena.',
  askRoster: (kids) =>
    `¿Quiénes viven en su casa con usted? Por favor deme el nombre, el apellido y la edad de cada persona${kids.length ? `, incluyendo a ${join(kids, 'y')}` : ''}: pareja, abuelos, otros niños, todos los que comparten la renta y la comida.`,
  askIncomeSelf: 'Ahora los ingresos. ¿Cuánto gana usted en su trabajo, antes de impuestos? Si no tiene ingresos, dígame que ninguno.',
  askIncomeOf: (name) => `¿${name} tiene ingresos de un trabajo? Si es así, ¿cuánto gana ${name} antes de impuestos?`,
  askMoreIncomeSelf: '¿Tiene usted otro ingreso, como manutención, SSI, desempleo u otro trabajo? Si no, dígame que no.',
  askMoreIncomeOf: (name) => `¿${name} tiene otro ingreso, como manutención, SSI, una pensión u otro trabajo? Si no, dígame que no.`,
  askAnyoneElseIncome: '¿Alguien más en la casa tiene ingresos, como un joven que trabaja? Si no, dígame que no.',
  askFrequency: (owner, amount) => `¿Cada cuánto ${owner ? `recibe ${owner}` : 'se paga'} los ${amount}: cada semana, cada dos semanas, dos veces al mes o una vez al mes?`,
  askKind: (owner, amount) => `¿Qué tipo de ingreso son los ${amount}${owner ? ` de ${owner}` : ''}: de trabajo, u otra cosa como manutención o SSI?`,
  askOwner: (amount) => `¿De quién es el ingreso de ${amount}?`,
  askLastName: (first, self) => (self ? `Para ponerlo bien en el formulario: ¿cuál es su apellido, ${first}?` : `Para ponerlo bien en el formulario: ¿cuál es el apellido de ${first}?`),
  askWhich: (flag) => `¿Cuál de los niños ${flag}?`,
  askAddress: '¿Cuál es la dirección de su casa? La calle, la ciudad y el código postal.',
  you: 'Usted',
  your: (field) => `Su ${field}`,
  of: (name, field) => `${name} — ${field}`,
  list: (xs) => join(xs, 'y'),
};

export const REPLIES: Record<Lang, Replies> = { en, es };

export function replies(lang: Lang): Replies {
  return REPLIES[lang];
}

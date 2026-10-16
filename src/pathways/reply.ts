import type { Lang } from './types.js';

/**
 * What the helper says at each known step of a pathway, in English and Spanish, kept in step.
 * Short, warm and plain (VISION §11): no codes, no all-caps, no jargon. The model is not
 * needed for any of these; the engine fills in the values.
 */

export interface Replies {
  start(title: string, first: string): string;
  gotIt: string;
  corrected(changes: Array<{ label: string; from: string; to: string }>): string;
  sensitive(ask: string, why: string | undefined, optional: boolean): string;
  didntCatch(ask: string): string;
  dontKnow: string;
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
  declined: string;
  attest(fields: string[], how?: string): string;
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
}

const list = (xs: string[], and: string) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} ${and} ${xs[xs.length - 1]}`);

const en: Replies = {
  start: (title, first) => `I can help you with ${title}. It's a few questions, and nothing gets sent until you say yes.\n\n${first}`,
  gotIt: 'Got it.',
  corrected: (cs) => `Got it, I changed ${list(cs.map((c) => `${c.label} from ${c.from} to ${c.to}`), 'and')}.`,
  sensitive: (ask, why, optional) =>
    `This next one is personal, so share only what you're comfortable with. ${ask}${why ? ` ${why}` : ''}${optional ? ' You can also say skip.' : ''}`,
  didntCatch: (ask) => `Sorry, I didn't catch that. ${ask}`,
  dontKnow: "That's okay. When you have it, just text it to me here and we'll pick up where we left off.",
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
  declined: "Okay, I won't send anything. Your answers are saved. Say continue whenever you want to pick it back up.",
  attest: (fields, how) =>
    `Almost there. The form needs your own signature on: ${list(fields, 'and')}. That part is yours, so I won't do it for you.${how ? `\n${how}` : ''}\nTell me when you've done it.`,
  attestAgain: "Tell me when you've signed it, or say no if you'd rather not.",
  attestDeclined: "Okay. Nothing goes in without your signature. Your answers are saved if you change your mind.",
  done: (summary, ref) => `Done. ${summary}\nYour confirmation: ${ref}.`.replace('Done. \n', 'Done.\n'),
  unconfirmed: (summary) => `I sent it, but I don't have a confirmation yet, so it isn't done until they confirm.${summary ? ` ${summary}` : ''}`,
  mismatch: (labels, summary) =>
    `I sent it, but ${list(labels, 'and')} didn't read back the way you approved, so I'm not counting it as done.${summary ? ` ${summary}` : ''}`,
  failed: (summary) => `It didn't go through, and nothing is confirmed.${summary ? ` ${summary}` : ''}`,
  laneHandoff: (summary) => `I can't finish this one myself.${summary ? ` ${summary}` : ''}`,
  noLane: "Everything is ready, but I can't send this form myself yet. I'll pass it, with the values you approved, to a person who can finish it.",
  next: (titles) => `I can also help with ${list(titles, 'and')}. Want to do that next?`,
  paused: "No problem. I'll keep what you've told me. Just say continue when you're ready.",
  resume: "Let's pick up where we left off.",
  interrupted: (proposal) => `Something interrupted that on my side, and nothing is confirmed. Here it is again:\n\n${proposal}`,
  cantAsk: (labels) => `I need ${list(labels, 'and')} from the school's records, not from you, so I'll pass this to a person to finish.`,
  yes: 'Yes',
  no: 'No',
};

const es: Replies = {
  start: (title, first) => `Te puedo ayudar con ${title}. Son unas preguntas, y no envío nada hasta que me digas que sí.\n\n${first}`,
  gotIt: 'Anotado.',
  corrected: (cs) => `Listo, cambié ${list(cs.map((c) => `${c.label} de ${c.from} a ${c.to}`), 'y')}.`,
  sensitive: (ask, why, optional) =>
    `La siguiente pregunta es personal, así que comparte solo lo que quieras. ${ask}${why ? ` ${why}` : ''}${optional ? ' También puedes decir saltar.' : ''}`,
  didntCatch: (ask) => `Perdón, no te entendí. ${ask}`,
  dontKnow: 'Está bien. Cuando lo tengas, mándamelo aquí y seguimos donde nos quedamos.',
  why: (reason, ask) => `${reason ?? 'El formulario lo pide, y solo lo uso para este formulario.'} ${ask}`,
  declinedRequired:
    'Está bien. Este dato tiene que ir en el formulario, así que no lo puedo enviar sin él. ¿Quieres que te conecte con una persona que te pueda ayudar?',
  skipped: 'Claro, nos saltamos esa.',
  handoffOffer: 'Me está costando entender este dato por mensaje, y no quiero adivinar. ¿Quieres que te conecte con una persona que te pueda ayudar?',
  handoff: 'Muy bien. Le paso esto a una persona que te puede ayudar, y se va a comunicar contigo. Guardé todo lo que me dijiste, así que no tienes que empezar de nuevo.',
  covered: (why) => `${why}\n\nAsí que no hay nada que llenar para esto.`,
  proposal: (lines, attest) =>
    `Esto es todo lo que dirá el formulario:\n${lines.join('\n')}\n\n${attest ? 'La firma y la certificación las haces tú. Yo nunca hago esa parte por ti.\n\n' : ''}¿Quieres que lo envíe? O dime qué cambiar.`,
  updated: (proposal) => `Actualizado.\n\n${proposal}`,
  confirmOnce: 'Solo para confirmar: ¿quieres que envíe el formulario como te lo mostré?',
  proposalUnclear: '¿Quieres que lo envíe así, o cambio algo?',
  declined: 'Muy bien, no envío nada. Guardé tus respuestas. Escribe seguir cuando quieras continuar.',
  attest: (fields, how) =>
    `Ya casi. El formulario necesita tu propia firma en: ${list(fields, 'y')}. Esa parte es tuya, así que no la hago por ti.${how ? `\n${how}` : ''}\nAvísame cuando lo hayas hecho.`,
  attestAgain: 'Avísame cuando lo hayas firmado, o dime que no si prefieres no hacerlo.',
  attestDeclined: 'Muy bien. No se envía nada sin tu firma. Guardé tus respuestas por si cambias de opinión.',
  done: (summary, ref) => `Listo. ${summary}\nTu confirmación: ${ref}.`.replace('Listo. \n', 'Listo.\n'),
  unconfirmed: (summary) => `Lo envié, pero todavía no tengo confirmación, así que no está listo hasta que lo confirmen.${summary ? ` ${summary}` : ''}`,
  mismatch: (labels, summary) =>
    `Lo envié, pero ${list(labels, 'y')} no quedó como lo aprobaste, así que no lo cuento como listo.${summary ? ` ${summary}` : ''}`,
  failed: (summary) => `No se pudo enviar, y no hay nada confirmado.${summary ? ` ${summary}` : ''}`,
  laneHandoff: (summary) => `Esto no lo puedo terminar yo.${summary ? ` ${summary}` : ''}`,
  noLane: 'Todo está listo, pero todavía no puedo enviar este formulario yo. Se lo paso, con los datos que aprobaste, a una persona que lo puede terminar.',
  next: (titles) => `También te puedo ayudar con ${list(titles, 'y')}. ¿Lo hacemos?`,
  paused: 'Claro. Guardo lo que me dijiste. Escribe seguir cuando quieras continuar.',
  resume: 'Sigamos donde nos quedamos.',
  interrupted: (proposal) => `Algo lo interrumpió de mi lado, y no hay nada confirmado. Aquí está otra vez:\n\n${proposal}`,
  cantAsk: (labels) => `Necesito ${list(labels, 'y')} de los registros de la escuela, no de ti, así que le paso esto a una persona para terminarlo.`,
  yes: 'Sí',
  no: 'No',
};

export const REPLIES: Record<Lang, Replies> = { en, es };

export function replies(lang: Lang): Replies {
  return REPLIES[lang];
}

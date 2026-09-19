export type Locale = 'en' | 'es';

/** Resolve a family's message locale, defaulting to English. */
export function resolveLocale(locale?: string, fallback: Locale = 'en'): Locale {
  return locale === 'es' ? 'es' : fallback;
}

/**
 * An EXPLICIT answer to "which language do you prefer?" — as opposed to guessing the
 * language from how someone happens to write one message. Onboarding asks the question,
 * so the answer must beat detection (including the one-way sticky rule): a family that
 * chooses Spanish keeps Spanish even when a later message is written in English.
 *
 * Deliberately conservative: only a message that IS a language answer counts. Bare "en"
 * or "es" mid-sentence must not flip anyone ("en la escuela…" is Spanish, not English).
 */
export function explicitLocaleChoice(text: string): Locale | undefined {
  const t = String(text ?? '')
    .toLowerCase()
    .replace(/[¿?¡!.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return undefined;
  const core = t
    .replace(/^(?:i (?:prefer|want|would like|speak|use)|prefiero|quiero|hablo|use|in|en)\s+/, '')
    .replace(/\s+(?:please|por favor)$/, '')
    .trim();
  if (/^(english|ingl[eé]s)$/.test(core)) return 'en';
  if (/^(spanish|espa[nñ]ol)$/.test(core)) return 'es';
  // Or the message OPENS with the unambiguous English word for the language
  // ("Spanish please, my email is …"). "English"/"Spanish" as an opening word is
  // never anything but this answer.
  if (/^(spanish|espa[nñ]ol)\b/.test(t)) return 'es';
  if (/^(english|ingl[eé]s)\b/.test(t)) return 'en';
  return undefined;
}

/**
 * The locale for the NEXT turn, given what the family currently has and what they just
 * wrote. Order of authority:
 *   1. An explicit answer to the language question wins outright — including turning a
 *      previously-Spanish family back to English, because that's them telling us.
 *   2. Otherwise Spanish is STICKY: one English line (an email address, say) must never
 *      flip a Spanish-speaking family back to English.
 *   3. Otherwise guess from the message.
 */
export function nextLocale(current: string | undefined, text: string): Locale {
  const chosen = explicitLocaleChoice(text);
  if (chosen) return chosen;
  if (current === 'es') return 'es';
  return detectLocale(text);
}

/** Detect the likely message language from text (Spanish vs English), default en. */
export function detectLocale(text: string): Locale {
  const t = String(text ?? '').toLowerCase();
  if (!t.trim()) return 'en';
  // Strong signal: accented Spanish chars are unambiguous.
  if (/[áéíóúñ¿¡]/.test(t)) return 'es';
  // Strong, UNAMBIGUOUS Spanish words only. (Previously we matched short words
  // like "me"/"no"/"es"/"con" that also occur in English, which wrongly flipped
  // English messages — e.g. "for me" — to Spanish.)
  if (/\b(gracias|hola|ayuda|ayudame|porque|donde|como|que|cuando|esta|nino|nina|hijo|hija|quiero|necesito|escuela|beca|solicitud|inscripcion|matricula|familia|ayudar|informacion|tambien|entonces)\b/.test(t)) return 'es';
  return 'en';
}

/**
 * Translate the handful of proactive-follow-up templates we own. Custom
 * verify prompts built from district facts stay as-authored (English) unless
 * the LLM localizes them; this covers the generic/default messages.
 */
const ES: Record<string, string> = {
  'Any update on this?': '¿Hay alguna novedad sobre esto?',
  "I'm still on this and will chase the school. Anything new on your end?":
    'Sigo trabajando en esto y voy a contactar a la escuela. ¿Hay algo nuevo de tu lado?',
  'Quick follow-up — I\u2019m still on this and will chase the school. Anything new on your end?':
    'Te recuerdo que sigo con esto y voy a ponerme en contacto con la escuela. ¿Hay algo nuevo de tu lado?',
};

/** Localize a follow-up message body for the given locale. */
export function localizeFollowup(text: string, locale: Locale): string {
  if (locale === 'en') return text;
  return ES[text] ?? text;
}

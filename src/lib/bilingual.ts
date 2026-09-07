export type Locale = 'en' | 'es';

/** Resolve a family's message locale, defaulting to English. */
export function resolveLocale(locale?: string, fallback: Locale = 'en'): Locale {
  return locale === 'es' ? 'es' : fallback;
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

export type Locale = 'en' | 'es';

/** Resolve a family's message locale, defaulting to English. */
export function resolveLocale(locale?: string, fallback: Locale = 'en'): Locale {
  return locale === 'es' ? 'es' : fallback;
}

/** Detect the likely message language from text (Spanish vs English), default en. */
export function detectLocale(text: string): Locale {
  const t = String(text ?? '').toLowerCase();
  if (!t.trim()) return 'en';
  // Spanish function words / accented chars are strong signals.
  if (/[áéíóúñ¿¡]/.test(t)) return 'es';
  // Spanish stop-words appear more often than English-only ones in short messages.
  const es = /\b(el|la|los|las|yo|mi|mí|tu|si|sí|no|se|una|un|con|para|pero|por|porque|qué|cómo|dónde|ayuda|hija|hijo|niño|niña|gracias|me|te|que|es|son|está)\b/.test(t);
  if (es) return 'es';
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

/**
 * Form turns: when a parent asks for a form to be filled (sign up, enroll, apply, waitlist),
 * the turn is narrowed to the tools that get a form filled, and the loop does not end until
 * the fill has started or the parent has been asked for what is missing.
 *
 * Why this is code and not prompt: the full catalogue is ~40 tools behind a long system
 * prompt, and the failure we kept seeing was the model researching (web_search, browser_*)
 * and answering with a list of programs instead of calling skyvern_fill_form. A rule the
 * model can skip is a request; a catalogue that only holds form tools is a constraint.
 */

const ACTION =
  /\b(sign(?:ing)?\s*(?:him|her|them|my\s+\w+|\w+)?\s*up|signup|enroll|enrol|register|apply|fill(?:ing)?\s*(?:out|in)?|submit|waitlist|wait\s*list)\b|\b(inscrib\w*|llen\w*|solicit\w*|aplicar|registr\w*|matricul\w*)\b/i;
const OBJECT =
  /\b(form|application|sign[\s-]*up|enrollment|enrolment|registration|waitlist|wait\s*list|program|camp|class|after[\s-]*school|school|club|team|league|lunch|meals?)\b|\b(formulario|solicitud|programa|inscripci[oó]n|escuela|campamento)\b/i;
/** A plain question about a form ("what's on the enrollment form?") is not a request to fill it. */
const INFO_ONLY = /^\s*(what|when|where|which|who|how\s+(much|long|many|do\s+i\s+know)|is\s+there|are\s+there|qu[eé]|cu[aá]ndo|d[oó]nde)\b/i;
/** Short replies that accept an offer the agent just made. */
const AFFIRM = /^\s*(y(es|ep|eah|up)?|sure|ok(ay)?|please|go\s+ahead|do\s+it|s[ií]|claro|dale|por\s+favor)\b[\s!.]*$/i;
const OFFERED_FILL = /\b(fill|sign\s+\w+\s+up|sign\s+up|enroll|apply|start\s+the\s+(form|application)|llen\w*|inscrib\w*)\b[^?]*\?/i;

export function isFormRequest(text: string): boolean {
  const t = text.trim();
  if (!t || INFO_ONLY.test(t)) return false;
  return ACTION.test(t) && OBJECT.test(t);
}

/** A form turn is an explicit request, or a yes to a fill the agent just offered. */
export function isFormTurn(text: string, lastAssistantText?: string): boolean {
  if (isFormRequest(text)) return true;
  return Boolean(lastAssistantText && AFFIRM.test(text) && OFFERED_FILL.test(lastAssistantText));
}

/** Everything a form turn may need: find the form, read the family's info, fill it. Nothing
 * that sends, calls or submits on its own — the submit is staged by the fill's completion. */
export const FORM_TURN_TOOLS: ReadonlySet<string> = new Set([
  'skyvern_fill_form',
  'get_form_recipe',
  'web_search',
  'web_fetch',
  'browser_open',
  'browser_extract',
  'get_school_info',
  'get_knowledge',
  'search_school_graph',
  'save_profile',
  'list_open_cases',
  'log_case',
  'recall_history',
  'account_action',
  'connect_portal',
  'pdf_fields',
  'pdf_fill',
  'extract_pdf',
  'now',
]);

export const FORM_TURN_PROMPT =
  '\n\nTHIS TURN IS A FORM REQUEST. The parent wants a form filled. Your job this turn:\n' +
  '1. Get the URL of the application form itself (the page with the input fields), not the program landing page. ' +
  'Use get_form_recipe, then web_search / web_fetch if you do not already have it.\n' +
  '2. Call skyvern_fill_form with that URL, `program` (the program name), and `values`: every value the family profile and this ' +
  'conversation give you, keyed by the label a form would use ("Student first name", "Student last name", "Grade", ' +
  '"Date of birth", "Parent/guardian name", "Phone", "Email", "Home address", "School"). Never invent a value.\n' +
  '3. If a value the form clearly needs is missing (a date of birth, an address), still start the fill with what you have, and ' +
  'in the same reply ask the parent for all the missing values in ONE message.\n' +
  'If the form is a fillable PDF, use pdf_fields + pdf_fill instead. Do not reply with a list of programs or links instead of filling.';

export const FORM_TURN_NUDGE =
  'You have not started the form yet. Call skyvern_fill_form now with the application form URL and the values you have ' +
  "(pass `program` too). If you truly cannot find the form's URL, ask the parent for the link in one short message. " +
  'Do not answer with a list of programs.';

/** The reply is a question back to the parent (asking for the link or missing values). */
export function asksParent(text: string): boolean {
  return /\?\s*$/.test(text.trim()) || /\?\s*\n/.test(text);
}

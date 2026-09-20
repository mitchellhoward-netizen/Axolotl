import { getSupabase } from './db.js';

/**
 * Form recipe = "how to fill this form," learned from a successful fill. It
 * captures the STRUCTURE (which text fields to fill by label, which radios/
 * checkboxes to click, which selects to pick) — not the values, which vary per
 * parent. On the next encounter, the agent replays the structure with the
 * parent's data, so each form is filled perfectly after the first success.
 */

export interface RecipeFill {
  label: string;
}
export interface RecipeControl {
  label: string;
  kind: 'radio' | 'checkbox';
}
export interface RecipeSelect {
  name: string;
  option: string;
}

export interface FormRecipe {
  url: string;
  title?: string;
  fills: RecipeFill[];
  controls: RecipeControl[];
  selects: RecipeSelect[];
  notes?: string;
  /**
   * Present when WE recorded this from an outcome we could verify, rather than the model
   * telling us it filled the form. `valueKeys` are the field names we sent — not the page's
   * visible labels — because the fill path never sees the DOM. That makes an auto-recorded
   * recipe a reliable list of WHICH fields this form wants, and the model-authored
   * `fills[].label` list the hint for where they go.
   */
  verified?: {
    at: string;
    evidence: 'completed-fill' | 'confirmed-submit';
    runId?: string;
    valueKeys: string[];
  };
}

const mem = new Map<string, FormRecipe>();

export async function getFormRecipe(url: string): Promise<FormRecipe | undefined> {
  if (mem.has(url)) return mem.get(url);
  const c = getSupabase();
  if (c) {
    const { data, error } = await c.from('form_recipe').select('recipe').eq('url', url).maybeSingle();
    if (!error && data?.recipe) {
      const r = data.recipe as FormRecipe;
      mem.set(url, r);
      return r;
    }
  }
  return undefined;
}

export async function saveFormRecipe(recipe: FormRecipe, guardianId?: string): Promise<void> {
  mem.set(recipe.url, recipe);
  const c = getSupabase();
  if (!c) return;
  const { error } = await c
    .from('form_recipe')
    .upsert({ url: recipe.url, guardian_id: guardianId ?? null, recipe, updated_at: new Date().toISOString() }, { onConflict: 'url' });
  // This used to swallow the error, so a missing table was indistinguishable from a saved
  // recipe. Say it out loud instead.
  if (error) console.warn('[form-recipes] save failed:', error.message);
}

/**
 * Record the field mapping from a VERIFIED fill.
 *
 * Deliberately merges rather than overwrites: if the model already authored a label-keyed
 * recipe for this form, its `fills`/`controls`/`selects` are the more useful half and are kept.
 * What we add is the part only we can know for certain — that a real run completed, and the
 * exact set of field names that were sent.
 *
 * Called only from the vendor paths that have a verified outcome. There is no path here for
 * "the model said it filled the form".
 */
export async function recordVerifiedRecipe(input: {
  url: string;
  valueKeys: string[];
  evidence: 'completed-fill' | 'confirmed-submit';
  runId?: string;
}): Promise<FormRecipe> {
  const existing = await getFormRecipe(input.url);
  const keys = [...new Set(input.valueKeys.filter(Boolean))];
  const recipe: FormRecipe = {
    url: input.url,
    title: existing?.title,
    // Keep a model-authored structure if we have one; otherwise record the names we sent.
    fills: existing?.fills?.length ? existing.fills : keys.map((label) => ({ label })),
    controls: existing?.controls ?? [],
    selects: existing?.selects ?? [],
    notes: existing?.notes,
    verified: { at: new Date().toISOString(), evidence: input.evidence, runId: input.runId, valueKeys: keys },
  };
  await saveFormRecipe(recipe);
  console.log(`[form-recipes] verified recipe for ${input.url} (${input.evidence}, ${keys.length} fields${input.runId ? `, run ${input.runId}` : ''})`);
  return recipe;
}

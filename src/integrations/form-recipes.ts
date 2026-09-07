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
  if (c) {
    await c
      .from('form_recipe')
      .upsert({ url: recipe.url, guardian_id: guardianId ?? null, recipe, updated_at: new Date().toISOString() }, { onConflict: 'url' });
  }
}

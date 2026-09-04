import type { IntentResult } from '../../domain/intents.js';

/** Pluggable NLU. `rules` runs offline; `llm` adds recall at the cost of a key. */
export interface IntentEngine {
  detect(text: string): Promise<IntentResult>;
}

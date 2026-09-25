import type { IntentName } from '../../domain/intents.js';
import type { IntentEngine } from './engine.js';
import { LlmClient } from '../llm.js';

export interface LlmEngineOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
}

const INTENT_NAMES: IntentName[] = [
  'schedule_conference',
  'report_absence',
  'request_meal_voucher',
  'call_me',
  'call_school',
  'list_students',
  'help',
  'unknown',
];

/**
 * Structured intent classifier over LlmClient, so it gets the same provider handling as the
 * rest of the agent (native Messages API on Anthropic). It used to post `response_format:
 * json_object` straight to the OpenAI-compatible endpoint, which Anthropic rejects, so on a
 * Claude key every classification silently came back `unknown`. Falls back to `unknown` on
 * any failure.
 */
export class LlmIntentEngine implements IntentEngine {
  private readonly llm: LlmClient;

  constructor(opts: LlmEngineOptions) {
    this.llm = new LlmClient({ apiKey: opts.apiKey, baseUrl: opts.baseUrl, model: opts.model, maxTokens: 512, effort: 'low' });
  }

  async detect(text: string): Promise<{ name: IntentName; confidence: number }> {
    try {
      const raw = await this.llm.completeJson(
        'Classify the parent message into one intent and return ONLY a JSON object: {"intent": string, "confidence": number}. ' +
          `Allowed intents: ${INTENT_NAMES.join(', ')}. ` +
          'call_me means the parent wants you to call THEM (a demo). call_school means they want you to call the school/office/district.',
        text,
      );
      if (!raw) return { name: 'unknown', confidence: 0 };
      const match = raw.replace(/```(?:json)?/gi, '').match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : raw) as { intent?: string; confidence?: number };
      const name = INTENT_NAMES.includes(parsed.intent as IntentName)
        ? (parsed.intent as IntentName)
        : 'unknown';
      return { name, confidence: parsed.confidence ?? 0 };
    } catch {
      return { name: 'unknown', confidence: 0 };
    }
  }
}

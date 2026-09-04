import type { IntentName } from '../../domain/intents.js';
import type { IntentEngine } from './engine.js';

export interface LlmEngineOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
}

const INTENT_NAMES: IntentName[] = [
  'schedule_conference',
  'report_absence',
  'request_meal_voucher',
  'list_students',
  'help',
  'unknown',
];

/**
 * OpenAI-compatible structured intent classifier. Uses plain `fetch` so there
 * is no SDK dependency, and falls back to `unknown` on any failure.
 */
export class LlmIntentEngine implements IntentEngine {
  constructor(private readonly opts: LlmEngineOptions) {}

  async detect(text: string): Promise<{ name: IntentName; confidence: number }> {
    try {
      const res = await fetch(`${this.opts.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.opts.apiKey}`,
        },
        body: JSON.stringify({
          model: this.opts.model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'Classify the parent message into one intent and return JSON: {"intent": string, "confidence": number}. ' +
                `Allowed intents: ${INTENT_NAMES.join(', ')}.`,
            },
            { role: 'user', content: text },
          ],
        }),
      });

      if (!res.ok) return { name: 'unknown', confidence: 0 };
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const raw = data.choices?.[0]?.message?.content;
      if (!raw) return { name: 'unknown', confidence: 0 };

      const parsed = JSON.parse(raw) as { intent?: string; confidence?: number };
      const name = INTENT_NAMES.includes(parsed.intent as IntentName)
        ? (parsed.intent as IntentName)
        : 'unknown';
      return { name, confidence: parsed.confidence ?? 0 };
    } catch {
      return { name: 'unknown', confidence: 0 };
    }
  }
}

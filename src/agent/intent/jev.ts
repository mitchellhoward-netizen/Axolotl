import type { IntentName } from '../../domain/intents.js';
import type { IntentEngine } from './engine.js';

/**
 * Intent classifier on TypeSafe's Jev, a System One model: one Choice question over the
 * intent set, answered with calibrated probabilities instead of generated JSON. It costs
 * $0.042 per million input tokens (output is free) and answers in well under a second,
 * against a frontier model that bills output and thinks first.
 *
 * Only the message goes into `state`: no name, school or family record. Jev's docs say
 * accuracy drops as unrelated context grows, and zero data retention is an enterprise
 * option, so sending less is both more accurate and safer.
 *
 * Falls back to `unknown` on any failure, like the LLM engine.
 */

export const JEV_URL = 'https://api.typesafe.ai/v1/systemone';
export const JEV_USD_PER_M_INPUT = 0.042;

/** What each intent means, written as the literal condition Jev should check. */
export const INTENT_CRITERIA: Record<IntentName, string> = {
  onboarding:
    'The parent is new or wants to get set up: getting started, or telling us which children they have and which schools they attend.',
  attendance_issue:
    'A pattern of missed school: chronic absence, a child refusing or avoiding school, skipping, truancy, or an attendance warning letter or meeting. Not a single sick day.',
  call_me: 'The parent wants the assistant to phone THEM, or to hear or see a demonstration of it.',
  call_school: 'The parent wants the assistant to phone the school, district, office or a staff member on their behalf.',
  schedule_conference: 'The parent wants to schedule or book a meeting or parent-teacher conference.',
  report_absence:
    'The parent is reporting that a child will be, or was, absent, late or leaving early on a specific day, or wants an absence excused.',
  request_meal_voucher: 'The parent is asking about free or reduced-price school meals, lunch or breakfast help, or a meal voucher.',
  mckinney_vento_bus:
    'The family has lost stable housing (shelter, motel, car, staying with others) or the child needs transportation or a bus to get to school.',
  school_info:
    'The parent is asking for a fact about a school or district: address, phone number, hours, bell schedule, principal, or which school a child can attend.',
  demo_status: 'The parent is asking whether something the assistant did was real, actually submitted, or only a demo.',
  case_status: 'The parent is asking about the status or next step of something already in progress, or wants a reminder of open items.',
  list_students: 'The parent is asking which children or students we have on file for them.',
  help: 'A greeting, or a question about what the assistant can do, with no specific request.',
  unknown: 'None of the above, or the message is too unclear to tell what the parent wants.',
};

export interface JevChoiceAnswer {
  type: 'choice';
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface JevResponse {
  model: string;
  answers: Record<string, JevChoiceAnswer>;
  usage: { input_tokens: number; output_tokens: number };
}

export interface JevDetection {
  name: IntentName;
  confidence: number;
  probabilities: Record<string, number>;
  model?: string;
  inputTokens: number;
  seconds: number;
  error?: string;
}

export interface JevEngineOptions {
  apiKey: string;
  /** A versioned id (e.g. `jev-1.13.0`) pins behaviour; the default alias moves with releases. */
  model?: string;
  url?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

/** The request body for one message. Exported so tests can check it without the network. */
export function jevIntentRequest(text: string, model = 'jev-latest'): Record<string, unknown> {
  return {
    state: { parent_message: text },
    model,
    questions: {
      intent: {
        type: 'choice',
        instructions: 'What does the parent want in `parent_message`? Pick the single best match.',
        criteria: INTENT_CRITERIA,
      },
    },
  };
}

/** Read Jev's answer; anything outside the intent set becomes `unknown` with no confidence. */
export function parseJevIntent(data: JevResponse): Pick<JevDetection, 'name' | 'confidence' | 'probabilities'> {
  const answer = data.answers?.intent;
  if (!answer || !(answer.choice in INTENT_CRITERIA)) return { name: 'unknown', confidence: 0, probabilities: {} };
  return { name: answer.choice as IntentName, confidence: answer.confidence ?? 0, probabilities: answer.probabilities ?? {} };
}

export class JevIntentEngine implements IntentEngine {
  constructor(private readonly opts: JevEngineOptions) {}

  async detect(text: string): Promise<{ name: IntentName; confidence: number }> {
    const d = await this.detectDetailed(text);
    return { name: d.name, confidence: d.confidence };
  }

  /** Same decision plus probabilities, token usage and latency, for measurement. */
  async detectDetailed(text: string): Promise<JevDetection> {
    const started = performance.now();
    const seconds = () => (performance.now() - started) / 1000;
    const doFetch = this.opts.fetch ?? fetch;
    try {
      const res = await doFetch(this.opts.url ?? JEV_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.opts.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(jevIntentRequest(text, this.opts.model)),
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 10_000),
      });
      if (!res.ok) {
        // Status only: an error body may echo the message back.
        return { name: 'unknown', confidence: 0, probabilities: {}, inputTokens: 0, seconds: seconds(), error: `typesafe ${res.status}` };
      }
      const data = (await res.json()) as JevResponse;
      return { ...parseJevIntent(data), model: data.model, inputTokens: data.usage?.input_tokens ?? 0, seconds: seconds() };
    } catch (e) {
      return { name: 'unknown', confidence: 0, probabilities: {}, inputTokens: 0, seconds: seconds(), error: (e as Error)?.name ?? 'error' };
    }
  }
}

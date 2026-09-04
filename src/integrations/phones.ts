import { createHmac, timingSafeEqual } from 'node:crypto';

export interface CallResult {
  contact?: string;
  summary?: string;
  needs_from_parent?: string;
  deadlines?: string;
  next_step?: string;
  uncertain?: string;
}

interface RetellCallEvent {
  event: 'call_started' | 'call_ended' | 'call_analyzed' | string;
  call_id?: string;
  agent_id?: string;
  metadata?: Record<string, unknown>;
  transcript?: string;
  call_analysis?: { custom_data?: unknown; summary?: string };
  to_number?: string;
}

/**
 * Retell voice-agent client. Creates outbound phone calls and (in the app's
 * webhook handler) turns call transcripts into family-case updates.
 */
export class RetellClient {
  constructor(
    private readonly apiKey: string,
    private readonly agentId: string,
    private readonly fromNumber: string,
    private readonly webhookSecret?: string,
  ) {}

  private get headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' };
  }

  /** Place an outbound call. `conversationId` ties it to the family; `vars` fill the prompt's {{variables}}. */
  async createCall(
    toNumber: string,
    conversationId: string,
    vars?: Record<string, unknown>,
  ): Promise<{ call_id?: string }> {
    const body: Record<string, unknown> = {
      from_number: this.fromNumber,
      to_number: toNumber,
      override_agent_id: this.agentId,
      metadata: { conversationId },
    };
    if (vars && Object.keys(vars).length) body.retell_llm_dynamic_variables = vars;
    const res = await fetch('https://api.retellai.com/v2/create-phone-call', {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Retell create-call ${res.status}: ${text.slice(0, 200)}`);
    return (JSON.parse(text) as { call_id?: string }) ?? {};
  }

  /** Verify a Retell webhook signature (HMAC-SHA256 of the raw body). */
  verifySignature(rawBody: string, signature: string): boolean {
    if (!this.webhookSecret) return true; // skip verification if not configured
    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('base64');
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature ?? ''));
  }

  /** Extract a structured CallResult from a call-analyzed event's transcript/metadata. */
  parseCallResult(event: RetellCallEvent): CallResult {
    // Prefer structured custom_data; else infer from the transcript text.
    const custom = event.call_analysis?.custom_data as CallResult | undefined;
    if (custom) return custom;
    return { summary: event.call_analysis?.summary ?? event.transcript?.slice(0, 500) };
  }
}

export function createRetellClient(env: NodeJS.ProcessEnv = process.env): RetellClient | null {
  if (env.RETELL_API_KEY && env.RETELL_AGENT_ID && env.RETELL_FROM_NUMBER) {
    return new RetellClient(
      env.RETELL_API_KEY,
      env.RETELL_AGENT_ID,
      env.RETELL_FROM_NUMBER,
      env.RETELL_WEBHOOK_SECRET,
    );
  }
  return null;
}

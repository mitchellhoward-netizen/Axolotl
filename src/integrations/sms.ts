import 'dotenv/config';

export interface SmsResult {
  ok: boolean;
  provider: 'textbelt' | 'retell';
  /** Provider id for the message (textId / agent_id / chat_id), when returned. */
  id?: string;
  error?: string;
}

export interface SmsSender {
  send(to: string, message?: string): Promise<SmsResult>;
}

const RETELL_BASE = process.env.RETELL_API_BASE ?? 'https://api.retellai.com';
// Note: unlike the phone-call API, Retell exposes the SMS chat endpoint at the
// root (no /v2 prefix) — confirmed by a live 404 on /v2/create-sms-chat.
const RETELL_CREATE_SMS_ENDPOINT = `${RETELL_BASE}/create-sms-chat`;
const TEXTBELT_ENDPOINT = 'https://textbelt.com/text';

/** The confirmation text sent to a parent the moment they join the waitlist. */
export const WAITLIST_MESSAGE =
  "Hey — you're on the waitlist. We'll text you when it's your turn to use Axolotl.";

/**
 * Textbelt sender — the free / cheap SMS path with NO business profile needed.
 * POST https://textbelt.com/text { phone, message, key }. The free key is
 * "textbelt" (1 text/day); create your own key for more volume (pay-per-use).
 * US/Canada focused. No A2P/brand registration required.
 */
export class TextbeltSmsSender implements SmsSender {
  constructor(private readonly apiKey: string) {}

  async send(to: string, message?: string): Promise<SmsResult> {
    const body: Record<string, unknown> = { phone: to, message: message ?? '', key: this.apiKey };
    try {
      const res = await fetch(TEXTBELT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let parsed: { success?: boolean; textId?: number | string; error?: string } = {};
      try {
        parsed = JSON.parse(text) as typeof parsed;
      } catch {
        /* non-JSON; fall through */
      }
      if (!res.ok || !parsed.success) {
        return {
          ok: false,
          provider: 'textbelt',
          error: parsed.error ?? `Textbelt ${res.status}: ${text.slice(0, 200)}`,
        };
      }
      return {
        ok: true,
        provider: 'textbelt',
        id: parsed.textId != null ? String(parsed.textId) : undefined,
      };
    } catch (e) {
      return { ok: false, provider: 'textbelt', error: (e as Error)?.message ?? String(e) };
    }
  }
}

/**
 * Retell outbound-SMS sender (opt-in).
 *
 * ⚠️ Retell's `create-sms-chat` starts an SMS chat where a **chat-mode agent**
 * generates the initial message — there is no free-form message body field. So
 * we hand the exact text to the agent as a dynamic variable (`{{waitlist_message}}`)
 * that the SMS agent's prompt should emit, and we bind the agent via
 * `override_agent_id`. The from-number must be SMS-enabled on Retell.
 */
export class RetellSmsSender implements SmsSender {
  constructor(
    private readonly apiKey: string,
    private readonly fromNumber: string,
    private readonly agentId: string | undefined,
  ) {}

  private get headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' };
  }

  async send(to: string, message?: string): Promise<SmsResult> {
    if (!this.agentId) {
      return {
        ok: false,
        provider: 'retell',
        error: 'No SMS agent configured (set RETELL_SMS_AGENT_ID or RETELL_AGENT_ID).',
      };
    }
    const body: Record<string, unknown> = {
      from_number: this.fromNumber,
      to_number: to,
      override_agent_id: this.agentId,
      override_agent_version: 'latest_published',
      metadata: { kind: 'waitlist_confirm' },
    };
    if (message) body.retell_llm_dynamic_variables = { waitlist_message: message };

    try {
      const res = await fetch(RETELL_CREATE_SMS_ENDPOINT, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) {
        return { ok: false, provider: 'retell', error: `Retell SMS ${res.status}: ${text.slice(0, 220)}` };
      }
      let parsed: { agent_id?: string; chat_id?: string; sms_chat?: { id?: string } } = {};
      try {
        parsed = JSON.parse(text) as typeof parsed;
      } catch {
        /* not-JSON success body; keep id undefined */
      }
      return {
        ok: true,
        provider: 'retell',
        id: parsed.agent_id ?? parsed.chat_id ?? parsed.sms_chat?.id,
      };
    } catch (e) {
      return { ok: false, provider: 'retell', error: (e as Error)?.message ?? String(e) };
    }
  }
}

/**
 * Build a sender from env, or null when the provider isn't usable.
 * Default is Textbelt (free/cheap, no business profile). Set `SMS_PROVIDER=retell`
 * to use Retell instead. The free "textbelt" key is 1 text/day; set TEXTBELT_KEY
 * for more volume.
 */
export function createSmsSender(env: NodeJS.ProcessEnv = process.env): SmsSender | null {
  const provider = (env.SMS_PROVIDER ?? 'textbelt').toLowerCase();
  if (provider === 'textbelt') {
    return new TextbeltSmsSender(env.TEXTBELT_KEY || 'textbelt');
  }
  if (provider === 'retell') {
    const agentId = env.RETELL_SMS_AGENT_ID ?? env.RETELL_AGENT_ID;
    if (env.RETELL_API_KEY && env.RETELL_FROM_NUMBER && agentId) {
      return new RetellSmsSender(env.RETELL_API_KEY, env.RETELL_FROM_NUMBER, agentId);
    }
    return null;
  }
  return null;
}

/**
 * Normalize a phone to E.164. The waitlist form sends digits only (e.g.
 * "18313459066"), so when there is no explicit country code we assume NANP
 * (+1). Accepts "+", spaces, dashes, and parens. Returns '' for empty/invalid.
 */
export function normalizeE164(input: string, defaultCountryCode = '1'): string {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  const hadPlus = raw.startsWith('+');
  let digits = raw.replace(/\D/g, '');
  if (!digits.length) return '';

  if (hadPlus) return `+${digits}`;

  // No explicit country code: assume NANP (US/CA).
  if (digits.length === 10) digits = defaultCountryCode + digits;
  else if (digits.length === 11 && digits[0] !== defaultCountryCode) digits = defaultCountryCode + digits;

  return `+${digits}`;
}

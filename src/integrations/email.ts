export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

export interface EmailReceipt {
  sent: boolean;
  id?: string;
}

export interface EmailProvider {
  send(msg: EmailMessage): Promise<EmailReceipt>;
}

/**
 * Real sender via Resend's REST API (https://api.resend.com/emails). Requires a
 * verified sender domain OR the account's onboarding address in `from`.
 */
export class ResendEmailProvider implements EmailProvider {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(msg: EmailMessage): Promise<EmailReceipt> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ from: this.from, to: [msg.to], subject: msg.subject, text: msg.body }),
    });
    const raw = await res.text();
    if (!res.ok) throw new Error(`Resend error ${res.status}: ${raw.slice(0, 200)}`);
    const j = (JSON.parse(raw) as { id?: string }) ?? {};
    return { sent: true, id: j.id };
  }
}

/** Offline fallback: logs + returns a fake receipt so the flow stays testable. */
export class MockEmailProvider implements EmailProvider {
  async send(msg: EmailMessage): Promise<EmailReceipt> {
    console.log(`[email][mock] → ${msg.to}\nSubject: ${msg.subject}\n${msg.body}`);
    return { sent: true, id: `mock-${Date.now().toString(36)}` };
  }
}

/** Choose the provider from env: real Resend when a key + from are set, else mock. */
export function createEmailProvider(env: NodeJS.ProcessEnv = process.env): EmailProvider {
  if (env.RESEND_API_KEY && env.EMAIL_FROM) {
    return new ResendEmailProvider(env.RESEND_API_KEY, env.EMAIL_FROM);
  }
  return new MockEmailProvider();
}

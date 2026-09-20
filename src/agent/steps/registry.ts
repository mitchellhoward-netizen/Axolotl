import type { ChannelAdapter } from './adapter.js';
import type { Channel } from './types.js';
import { EmailAdapter } from './adapters/email.js';
import { TextAdapter } from './adapters/text.js';
import { FormAdapter } from './adapters/form.js';
import { CallAdapter } from './adapters/call.js';
import { BrowserAdapter } from './adapters/browser.js';
import { AccountAdapter } from './adapters/account.js';
import { SubmitAdapter } from './adapters/submit.js';
import { BrowserAuthDriver } from '../../integrations/auth.js';
import { createEmailProvider, type EmailProvider } from '../../integrations/email.js';
import { createVoiceProvider, type VoiceProvider } from '../../integrations/voice.js';

/**
 * Builds the channel→adapter registry from env, exactly like createEmailProvider /
 * createVoiceProvider choose real vs mock per channel.
 */
export function buildAdapters(
  env: NodeJS.ProcessEnv = process.env,
  /** Test seam: inject providers instead of letting the ambient env choose a real one. */
  override: { email?: EmailProvider; voice?: VoiceProvider } = {},
): Record<Channel, ChannelAdapter> {
  const email = override.email ?? createEmailProvider(env);
  const voice = override.voice ?? createVoiceProvider(env);
  return {
    email: new EmailAdapter(email),
    text: new TextAdapter(),
    form: new FormAdapter(env.FORM_ENDPOINT, email),
    call: new CallAdapter(voice),
    browser: new BrowserAdapter(),
    account: new AccountAdapter(new BrowserAuthDriver()),
    submit: new SubmitAdapter(),
  };
}

import {
  browserOpen,
  browserClickByText,
  browserFill,
  browserState,
  browserWait,
} from './browser.js';

/**
 * The auth hand. An `AuthDriver` is the primitive surface the AccountAdapter
 * needs to drive a create-account / log-in / verify-code flow. Two impls:
 *  - `BrowserAuthDriver` (production) — the Stagehand browser.
 *  - a mock in tests — pure state machine, no browser, deterministic.
 * Abstracting here keeps the adapter's state machine unit-testable offline.
 */

export interface AuthState {
  url: string;
  hasCodePrompt: boolean;
  isLoggedIn: boolean;
  text: string;
}

export interface AuthDriver {
  open(url: string): Promise<void>;
  /** Click a button/link by visible text; throws if nothing matches. */
  clickByText(text: string): Promise<void>;
  fill(fields: Array<{ label: string; value: string }>): Promise<void>;
  wait(ms: number): Promise<void>;
  state(): Promise<AuthState>;
}

export class BrowserAuthDriver implements AuthDriver {
  async open(url: string): Promise<void> {
    const r = await browserOpen(url);
    if (!r.ok) throw new Error(r.reason);
  }

  async clickByText(text: string): Promise<void> {
    const r = await browserClickByText(text);
    if (!r.ok) throw new Error(r.reason);
    if (!r.data) throw new Error(`no element matching "${text}"`);
  }

  async fill(fields: Array<{ label: string; value: string }>): Promise<void> {
    const r = await browserFill(fields);
    if (!r.ok) throw new Error(r.reason);
  }

  async wait(ms: number): Promise<void> {
    const r = await browserWait(ms);
    if (!r.ok) throw new Error(r.reason);
  }

  async state(): Promise<AuthState> {
    const r = await browserState();
    if (!r.ok) throw new Error(r.reason);
    return r.data;
  }
}

import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import {
  browserOpen,
  browserWait,
  browserClickByText,
  browserClickBySelector,
  browserFill,
  browserState,
  browserInspect,
  browserClose,
} from '../src/integrations/browser.js';

/**
 * One-session signup: send the code, keep the SAME browser session alive while
 * the parent retrieves the code, then complete. The code is likely session-bound,
 * so send + complete must share one session.
 */

const URL = 'https://app.mycareconnect.io/carewait/gki';
const EMAIL = process.argv[2] ?? '';
const PASSWORD = process.argv[3] ?? '';
const CODE_FILE = process.argv[4] ?? '/tmp/gki-code.txt';

async function waitForCode(timeoutMs = 600000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (existsSync(CODE_FILE)) {
      const code = readFileSync(CODE_FILE, 'utf8').trim();
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('timed out waiting for code');
}

async function main(): Promise<void> {
  process.env.BROWSER_BACKEND = 'stagehand';
  await browserOpen(URL);
  await browserWait(9000);
  await browserClickByText('Apply');
  await browserWait(7000);
  await browserClickByText('Sign Up');
  await browserWait(8000);

  await browserFill([{ label: 'Email / Cell', value: EMAIL }]);
  await browserClickByText('Send Verification Code');
  await browserWait(3000);
  console.log('CODE_SENT');

  const code = await waitForCode();
  console.log('GOT_CODE');

  await browserFill([
    { label: 'Email / Cell', value: EMAIL },
    { label: 'Verification Code', value: code },
    { label: 'Password', value: PASSWORD },
    { label: 'Confirm Password', value: PASSWORD },
  ]);
  await browserClickBySelector('input[type="checkbox"]');
  await browserWait(1500);
  await browserClickByText('Sign Up');

  await browserWait(3000);
  const early = await browserInspect();
  await browserWait(9000);
  const s = await browserState();
  const insp = await browserInspect();

  console.log('EARLY_ERRORS', JSON.stringify(early.ok ? early.data.errors : early));
  console.log('FINAL_STATE', JSON.stringify(s.ok ? { url: s.data.url, isLoggedIn: s.data.isLoggedIn, text: s.data.text.slice(-500) } : s));
  console.log('FINAL_BUTTONS', JSON.stringify(insp.ok ? insp.data.buttons : insp));
  console.log('FINAL_ERRORS', JSON.stringify(insp.ok ? insp.data.errors : insp));

  await browserClose();
}

main().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});

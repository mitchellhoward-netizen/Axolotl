import 'dotenv/config';
import {
  browserOpen,
  browserWait,
  browserClickByText,
  browserFill,
  browserState,
  browserInspect,
  browserClose,
} from '../src/integrations/browser.js';

const URL = 'https://app.mycareconnect.io/carewait/gki';
const EMAIL = process.argv[2] ?? 'mitchgrom16@gmail.com';
const PASSWORD = process.argv[3] ?? 'AxolotlGKI2026!';

async function main(): Promise<void> {
  process.env.BROWSER_BACKEND = 'stagehand';
  await browserOpen(URL);
  await browserWait(9000);
  await browserClickByText('Returning Families');
  await browserWait(7000);
  await browserFill([
    { label: 'Email / Cell', value: EMAIL },
    { label: 'Password', value: PASSWORD },
  ]);
  await browserClickByText('Log In');
  await browserWait(10000);
  const s = await browserState();
  const insp = await browserInspect();
  console.log('STATE:', JSON.stringify(s.ok ? { url: s.data.url, isLoggedIn: s.data.isLoggedIn, hasCodePrompt: s.data.hasCodePrompt, text: s.data.text.slice(-700) } : s));
  console.log('BUTTONS:', JSON.stringify(insp.ok ? insp.data.buttons : insp));
  console.log('ERRORS:', JSON.stringify(insp.ok ? insp.data.errors : insp));
  await browserClose();
}

main().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});

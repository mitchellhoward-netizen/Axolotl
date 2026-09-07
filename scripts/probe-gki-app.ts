import 'dotenv/config';
import {
  browserOpen,
  browserWait,
  browserClickByText,
  browserFill,
  browserState,
  browserFields,
  browserInspect,
  browserClose,
} from '../src/integrations/browser.js';

const BASE = 'https://app.mycareconnect.io/carewait/gki';
const EMAIL = process.argv[2] ?? 'mitchgrom16@gmail.com';
const PASSWORD = process.argv[3] ?? 'AxolotlGKI2026!';

async function dump(label: string): Promise<void> {
  const s = await browserState();
  const f = await browserFields();
  const insp = await browserInspect();
  console.log(`\n=== ${label} ===`);
  console.log('url:', s.ok ? s.data.url : s);
  console.log('text:', (s.ok ? s.data.text : '').replace(/\n/g, ' | ').slice(0, 1400));
  console.log('fields:', JSON.stringify(f.ok ? f.data.fields : f));
  console.log('optionGroups:', JSON.stringify(f.ok ? f.data.optionGroups : f));
  console.log('buttons:', JSON.stringify(insp.ok ? insp.data.buttons : insp));
  console.log('errors:', JSON.stringify(insp.ok ? insp.data.errors : insp));
}

async function main(): Promise<void> {
  process.env.BROWSER_BACKEND = 'stagehand';
  await browserOpen(BASE);
  await browserWait(9000);
  await browserClickByText('Returning Families');
  await browserWait(7000);
  await browserFill([
    { label: 'Email / Cell', value: EMAIL },
    { label: 'Password', value: PASSWORD },
  ]);
  await browserClickByText('Log In');
  await browserWait(10000);
  await dump('DASHBOARD');

  await browserOpen(`${BASE}/application/create-traditional`);
  await browserWait(12000);
  await dump('APPLICATION STEP 1');

  await browserClose();
}

main().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});

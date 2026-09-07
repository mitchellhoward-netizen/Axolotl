import 'dotenv/config';
import {
  browserOpen,
  browserWait,
  browserClickByText,
  browserFill,
  browserState,
  browserFormControls,
  browserClose,
} from '../src/integrations/browser.js';

const BASE = 'https://app.mycareconnect.io/carewait/gki';
const EMAIL = process.argv[2] ?? 'mitchgrom16@gmail.com';
const PASSWORD = process.argv[3] ?? 'AxolotlGKI2026!';

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

  await browserOpen(`${BASE}/application/create-traditional`);
  await browserWait(12000);

  const s = await browserState();
  const fc = await browserFormControls();
  console.log('url:', s.ok ? s.data.url : s);
  console.log('TEXT:', (s.ok ? s.data.text : '').replace(/\n/g, ' | '));
  console.log('SELECTS:', JSON.stringify(fc.ok ? fc.data.selects : fc, null, 1));
  console.log('ROLE CONTROLS:', JSON.stringify(fc.ok ? fc.data.roleControls : fc, null, 1));

  await browserClose();
}

main().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});

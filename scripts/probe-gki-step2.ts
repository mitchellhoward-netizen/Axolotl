import 'dotenv/config';
import {
  browserOpen,
  browserWait,
  browserClickByText,
  browserFill,
  browserClickControl,
  browserSelectOption,
  browserState,
  browserFields,
  browserFormControls,
  browserClose,
} from '../src/integrations/browser.js';

const BASE = 'https://app.mycareconnect.io/carewait/gki';
const EMAIL = process.argv[2] ?? 'mitchgrom16@gmail.com';
const PASSWORD = process.argv[3] ?? 'AxolotlGKI2026!';

async function login(): Promise<void> {
  await browserOpen(BASE);
  await browserWait(9000);
  await browserClickByText('Returning Families');
  await browserWait(7000);
  await browserFill([{ label: 'Email / Cell', value: EMAIL }, { label: 'Password', value: PASSWORD }]);
  await browserClickByText('Log In');
  await browserWait(10000);
  await browserOpen(`${BASE}/application/create-traditional`);
  await browserWait(12000);
}

async function fillStep1(): Promise<void> {
  await browserClickControl('Never Received Cash Aid', 'radio');
  await browserSelectOption('data[cw_app_application.wat_app_application_subsidy__FamilyType]', 'Biological/Adoptive');
  await browserSelectOption('data[cw_app_application.wat_app_application_fielddata__S004]', 'No');
  await browserSelectOption('data[cw_app_application.wat_app_application_fielddata__S003]', 'No');
  await browserClickControl('Friend/Relative', 'radio');
  await browserWait(1500);
  await browserClickByText('Next');
  await browserWait(12000);
}

async function main(): Promise<void> {
  process.env.BROWSER_BACKEND = 'stagehand';
  await login();
  await fillStep1();

  const s = await browserState();
  const f = await browserFields();
  const fc = await browserFormControls();
  console.log('URL:', s.ok ? s.data.url : s);
  console.log('TEXT:', (s.ok ? s.data.text : '').replace(/\n/g, ' | ').slice(0, 3000));
  console.log('NATIVE FIELDS:', JSON.stringify(f.ok ? f.data.fields : f, null, 1));
  console.log('CONTROLS:', JSON.stringify(fc.ok ? fc.data.controls : fc, null, 1));
  console.log('SELECTS:', JSON.stringify(fc.ok ? fc.data.selects.map((x) => x.name) : fc));

  await browserClose();
}

main().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});

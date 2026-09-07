import 'dotenv/config';
import {
  browserOpen,
  browserWait,
  browserClickByText,
  browserFill,
  browserClickControl,
  browserSelectOption,
  browserState,
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

  console.log('textFill:', JSON.stringify(await browserFill([
    { label: 'First Name', value: 'Jane' },
    { label: 'Last Name', value: 'Parent' },
    { label: 'Cell Phone', value: '8315551234' },
    { label: 'Parent Date of Birth', value: '01/15/1985' },
    { label: 'Address', value: '123 Test St' },
  ])));

  console.log('clicks:', JSON.stringify({
    marital: await browserClickControl('Married', 'radio'),
    race: await browserClickControl('White', 'checkbox'),
    ethnicity: await browserClickControl('Not Hispanic or Latino', 'radio'),
    contact: await browserClickControl('SMS', 'radio'),
    reason: await browserClickControl('Working (employed/self-employed)', 'checkbox'),
    relationship: await browserClickControl('Mother', 'radio'),
  }));

  console.log('language:', JSON.stringify(await browserSelectOption('data[cw_app_parenta][cw_app_parenta.wat_app_contact__Language]', 'English')));

  const fc = await browserFormControls();
  const mailSame = fc.ok ? fc.data.controls.find((c) => /mailing address is the same/i.test(c.text)) : undefined;
  if (mailSame && !mailSame.checked) {
    console.log('mailing-same checkbox:', JSON.stringify(await browserClickControl('My mailing address is the same as my home address', 'checkbox')));
  } else {
    console.log('mailing-same already checked');
  }

  await browserWait(2000);
  await browserClickByText('Next');
  await browserWait(12000);
  const s = await browserState();
  console.log('AFTER NEXT url:', s.ok ? s.data.url : s);
  console.log('AFTER NEXT text:', (s.ok ? s.data.text : '').replace(/\n/g, ' | ').slice(0, 1500));

  await browserClose();
}

main().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});

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

  console.log('cash aid:', JSON.stringify(await browserClickControl('Never Received Cash Aid', 'radio')));
  console.log('family type:', JSON.stringify(await browserSelectOption('data[cw_app_application.wat_app_application_subsidy__FamilyType]', 'Biological/Adoptive')));
  console.log('moved for ag:', JSON.stringify(await browserSelectOption('data[cw_app_application.wat_app_application_fielddata__S004]', 'No')));
  console.log('40% income:', JSON.stringify(await browserSelectOption('data[cw_app_application.wat_app_application_fielddata__S003]', 'No')));
  console.log('hear about us:', JSON.stringify(await browserClickControl('Friend/Relative', 'radio')));
  await browserWait(2000);

  const fc = await browserFormControls();
  console.log('CHECKED/SELECTED:', JSON.stringify(fc.ok ? fc.data.controls.filter((c) => c.checked) : fc));

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

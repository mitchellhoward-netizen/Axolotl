import 'dotenv/config';
import {
  browserOpen,
  browserWait,
  browserClickByText,
  browserFill,
  browserClickControl,
  browserSelectOption,
  browserInspect,
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
  await browserFill([{ label: 'Email / Cell', value: EMAIL }, { label: 'Password', value: PASSWORD }]);
  await browserClickByText('Log In');
  await browserWait(10000);
  await browserOpen(`${BASE}/application/create-traditional`);
  await browserWait(12000);

  await browserClickControl('Never Received Cash Aid', 'radio');
  await browserSelectOption('data[cw_app_application.wat_app_application_subsidy__FamilyType]', 'Biological/Adoptive');
  await browserSelectOption('data[cw_app_application.wat_app_application_fielddata__S004]', 'No');
  await browserSelectOption('data[cw_app_application.wat_app_application_fielddata__S003]', 'No');
  await browserClickControl('Friend/Relative', 'radio');
  await browserWait(1500);
  await browserClickByText('Next');
  await browserWait(12000);

  const insp = await browserInspect();
  console.log('INPUTS:', JSON.stringify(insp.ok ? insp.data.inputs : insp, null, 1));

  await browserClose();
}

main().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});

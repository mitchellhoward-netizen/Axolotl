import 'dotenv/config';
import {
  browserOpen,
  browserWait,
  browserClickByText,
  browserFill,
  browserAct,
  browserState,
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

  const r = await browserAct(
    "Fill this eligibility questionnaire with fictional test values. Do NOT click Next or Cancel. " +
      "1) Leave every 'Means-Tested Government Programs' checkbox unchecked. " +
      "2) For 'Do you receive Cash Aid from your county?' choose 'Never Received Cash Aid'. " +
      "3) For 'What is your family type?' open the dropdown and choose a two-parent family option. " +
      "4) Leave the 'At Risk' / 'Child Protective Services' checkboxes unchecked. " +
      "5) Answer No to 'Has your family moved in the last 24 months to look for or get an agricultural job?'. " +
      "6) Answer No to 'Is more than 40% of your family income from seasonal agricultural work?'. " +
      "7) For 'How did you hear about us?' choose 'Friend/Relative'.",
  );
  console.log('ACT RESULT:', JSON.stringify(r));
  await browserWait(3000);

  await browserClickByText('Next');
  await browserWait(12000);
  const s = await browserState();
  console.log('STEP2 url:', s.ok ? s.data.url : s);
  console.log('STEP2 text:', (s.ok ? s.data.text : '').replace(/\n/g, ' | ').slice(0, 1600));

  await browserClose();
}

main().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});

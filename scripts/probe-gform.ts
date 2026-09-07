import 'dotenv/config';
import {
  browserAssessPage,
  browserOpen,
  browserWait,
  browserFields,
  browserFormControls,
  browserClose,
} from '../src/integrations/browser.js';

const URL = 'https://docs.google.com/forms/d/e/1FAIpQLSfRnWKflaGL76N0UG9r222aktVFaiB0bLQejxv0MYlSvNw6xQ/viewform';

async function main(): Promise<void> {
  process.env.BROWSER_BACKEND = 'stagehand';
  const a = await browserAssessPage(URL, '');
  console.log('ASSESS:', JSON.stringify(a, null, 1));

  await browserOpen(URL);
  await browserWait(9000);
  const f = await browserFields();
  console.log('FIELDS:', JSON.stringify(f.ok ? f.data : f, null, 1));
  const fc = await browserFormControls();
  console.log('CONTROLS:', JSON.stringify(fc.ok ? fc.data.controls : fc, null, 1));
  console.log('SELECTS:', JSON.stringify(fc.ok ? fc.data.selects : fc, null, 1));

  await browserClose();
}

main().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});

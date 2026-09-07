import 'dotenv/config';
import {
  browserAssessPage,
  browserOpen,
  browserWait,
  browserFields,
  browserFormControls,
  browserClose,
  browserReset,
} from '../src/integrations/browser.js';

const URLS = [
  'https://www.spinsc.org/ourstory#contact',
  'https://childcare.santacruzcoe.org/child-care-referral-form/',
  'https://www.encompasscs.org/contact_us',
  'https://benefitscal.com/ApplyForBenefits/ABHLT',
];

async function main(): Promise<void> {
  process.env.BROWSER_BACKEND = 'stagehand';
  for (const url of URLS) {
    process.stdout.write(`\n=== ${url}\n`);
    const a = await browserAssessPage(url, '');
    console.log(`title=${a.ok ? a.data.title : a.reason} | hasForm=${a.ok ? a.data.hasForm : ''} | fields=${a.ok ? a.data.fieldCount : ''} | blank=${a.ok ? a.data.blank : ''}`);
    if (a.ok && a.data.hasForm && a.data.fieldCount > 0) {
      await browserOpen(url);
      await browserWait(10000);
      const f = await browserFields();
      const fc = await browserFormControls();
      console.log('fields:', JSON.stringify(f.ok ? f.data.fields.map((x) => x.label) : f.reason));
      console.log('controls:', JSON.stringify(fc.ok ? fc.data.controls.map((c) => c.text).slice(0, 20) : fc.reason));
      console.log('selects:', JSON.stringify(fc.ok ? fc.data.selects.map((s) => s.name) : fc.reason));
    }
    await browserReset();
    await new Promise((r) => setTimeout(r, 2000));
    process.env.BROWSER_BACKEND = 'stagehand';
  }
  await browserClose();
}

main().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});

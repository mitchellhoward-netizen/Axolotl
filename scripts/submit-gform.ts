import 'dotenv/config';
import {
  browserOpen,
  browserWait,
  browserClickControl,
  browserFill,
  browserSubmit,
  browserState,
  browserClose,
} from '../src/integrations/browser.js';

const URL = 'https://docs.google.com/forms/d/e/1FAIpQLSfRnWKflaGL76N0UG9r222aktVFaiB0bLQejxv0MYlSvNw6xQ/viewform';

async function main(): Promise<void> {
  process.env.BROWSER_BACKEND = 'stagehand';
  await browserOpen(URL);
  await browserWait(9000);

  console.log('attending:', JSON.stringify(await browserClickControl("Yes, I'll be there", 'radio')));
  console.log('heard-from:', JSON.stringify(await browserClickControl('Friend', 'radio')));
  console.log('fill:', JSON.stringify(await browserFill([
    { label: 'What are the names of people attending?', value: 'Jane Parent' },
    { label: 'Comments and/or questions', value: 'Looking forward to it!' },
  ])));
  await browserWait(1500);

  console.log('submit:', JSON.stringify(await browserSubmit()));
  await browserWait(8000);

  const s = await browserState();
  console.log('AFTER SUBMIT url:', s.ok ? s.data.url : s);
  console.log('AFTER SUBMIT text:', (s.ok ? s.data.text : '').replace(/\n/g, ' | ').slice(0, 800));

  await browserClose();
}

main().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});

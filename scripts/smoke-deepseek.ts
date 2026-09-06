import 'dotenv/config';
import { browserOpen, browserObserve, browserExtract, browserClose } from '../src/integrations/browser.js';

/** Live smoke test of the DeepSeek-backed browser AI path (Browserbase + generate shim). */
async function main(): Promise<void> {
  const open = await browserOpen('https://example.com');
  console.log('browserOpen:', JSON.stringify(open));
  if (!open.ok) process.exit(1);

  const obs = await browserObserve('What is on this page?');
  console.log('browserObserve:', JSON.stringify(obs).slice(0, 800));

  const ext = await browserExtract('extract the main heading text', ['heading']);
  console.log('browserExtract:', JSON.stringify(ext).slice(0, 800));

  await browserClose();
}

main().catch((e) => {
  console.error('FAILED:', (e as Error)?.message ?? e);
  process.exit(1);
});

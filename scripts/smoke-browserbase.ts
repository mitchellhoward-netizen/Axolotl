import 'dotenv/config';
import { Stagehand, browserbase } from '@browserbasehq/stagehand';

/** Live smoke test of the Browserbase cloud path (no local Chromium needed). */
async function main(): Promise<void> {
  const key = process.env.BROWSERBASE_API_KEY;
  if (!key) {
    console.error('BROWSERBASE_API_KEY not set.');
    process.exit(1);
  }

  const browser = await browserbase.launch({ apiKey: key });
  const llmKey = process.env.STAGEHAND_API_KEY ?? process.env.OPENAI_API_KEY;
  const stagehand = await Stagehand.create(
    llmKey
      ? { browser, model: { modelName: process.env.STAGEHAND_MODEL ?? 'openai/gpt-4o-mini', apiKey: llmKey } }
      : { browser },
  );

  const [page] = await browser.context.pages();
  await page.goto('https://example.com');
  const url = await page.url();
  const title = await page.title();
  console.log(`OK — loaded ${url} — title: "${title}"`);
  await stagehand.close();
}

main().catch((e) => {
  console.error('FAILED:', (e as Error)?.message ?? e);
  process.exit(1);
});

import 'dotenv/config';
import { browserOpen, browserWait, browserVision, browserClose } from '../src/integrations/browser.js';
async function main() {
  process.env.BROWSER_BACKEND = 'stagehand';
  await browserOpen('https://docs.google.com/presentation/d/e/2PACX-1vRACGBT6xwVIBqdHalsC8TG1Diva88K7OYNAKQh24uUBX2yU_xXpotAk7kY6erfpiAjelGNbHraVQ4S/pub?start=false&loop=false&delayms=3000&slide=id.p');
  await browserWait(9000);
  const r = await browserVision('These are the SUESD Family Resources Guide slides. List the resource categories mentioned and any form/program names you can read (e.g. enrollment, meals, transportation). Be concise.');
  console.log('VISION RESULT:', r.ok ? r.data.slice(0, 800) : r.reason);
  await browserClose();
}
main().catch((e) => { console.error('ERR', e); process.exit(1); });

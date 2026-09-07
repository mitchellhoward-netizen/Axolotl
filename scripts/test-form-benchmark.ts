import 'dotenv/config';
import {
  browserOpen,
  browserWait,
  browserAssessPage,
  browserFill,
  browserClickByText,
  browserClickControl,
  browserSelectOption,
  browserState,
  browserClose,
  browserReset,
} from '../src/integrations/browser.js';
import { fillPdf } from '../src/integrations/pdf.js';

/**
 * Form benchmark. For each tier, run ONE representative form task and verify we
 * can FILL it correctly with a deterministic machine verifier. FILL-ONLY — we
 * never submit real forms here (submitting fake data to real school forms would
 * pollute them). Prints a scoreboard + overall success rate.
 *
 * Run: npm run test:forms   (needs BROWSER_BACKEND=stagehand + browser key)
 */

interface TaskResult {
  id: string;
  title: string;
  tier: number;
  pass: boolean;
  detail: string;
  ms: number;
}

const CKC = 'https://docs.google.com/forms/d/e/1FAIpQLSd6KaS8fLGLY8T_QuRJkcYh2fmrwvfb0PJs67W2Ius9MbLTFQ/viewform';
const GFORM = 'https://docs.google.com/forms/d/e/1FAIpQLSfRnWKflaGL76N0UG9r222aktVFaiB0bLQejxv0MYlSvNw6xQ/viewform';
const CAPITOLA = 'https://www.cityofcapitola.gov/DocumentCenter/View/212/Scholarship-Application--Spanish';
const GKIBASE = 'https://app.mycareconnect.io/carewait/gki';
const GKI_EMAIL = 'mitchgrom16@gmail.com';
const GKI_PASS = 'AxolotlGKI2026!';

// Tier 2 — PDF fill by Spanish label (offline, no browser).
async function pdfTask(): Promise<{ pass: boolean; detail: string }> {
  const r = await fillPdf(CAPITOLA, [
    { label: 'Nombre del niño', value: 'Maya López' },
    { label: 'Correo electrónico', value: 'maya@example.com' },
    { label: 'Estado', value: 'CA' },
    { label: 'Ingresos mensuales de la familia', value: '3000' },
  ]);
  if (!r.ok || !r.data) return { pass: false, detail: r.reason ?? 'fill failed' };
  const d = r.data;
  const ok = d.filled === 4 && d.failed.length === 0;
  return { pass: ok, detail: `filled ${d.filled}/4, failed ${d.failed.length}` };
}

// Tier 1 — Google Form fill (CKC Soquel), machine-verified, no submit.
async function ckcFillTask(): Promise<{ pass: boolean; detail: string }> {
  const a = await browserAssessPage(CKC, 'afterschool soquel');
  if (!a.ok || !a.data.hasForm) return { pass: false, detail: a.reason ?? 'no form fields' };
  await browserOpen(CKC);
  await browserWait(7000);
  const f = await browserFill([
    { label: 'Email', value: 'test@example.com' },
    { label: 'Child First Name', value: 'Maya' },
    { label: 'Child Last Name', value: 'Smith' },
    { label: 'Guardian First & Last Name', value: 'Jane Parent' },
    { label: 'Guardian Phone Number', value: '5551234567' },
  ]);
  if (!f.ok) return { pass: false, detail: f.reason ?? 'fill failed' };
  const ok = f.data.verified === true && f.data.filled >= 4;
  return { pass: ok, detail: `verified=${f.data.verified}, filled=${f.data.filled}` };
}

// Tier 1 — Google Form fill (safe test form), machine-verified, NO submit.
async function gformFillTask(): Promise<{ pass: boolean; detail: string }> {
  await browserOpen(GFORM);
  await browserWait(9000);
  await browserClickControl("Yes, I'll be there", 'radio');
  await browserClickControl('Friend', 'radio');
  const f = await browserFill([
    { label: 'What are the names of people attending?', value: 'Jane Parent' },
    { label: 'Comments and/or questions', value: 'benchmark test' },
  ]);
  if (!f.ok) return { pass: false, detail: f.reason ?? 'fill failed' };
  const ok = f.data.verified === true;
  return { pass: ok, detail: `verified=${f.data.verified}, filled=${f.data.filled}` };
}

// Tier 3 — account-gated portal (Go Kids): login + fill eligibility step 1.
async function gkiReachTask(): Promise<{ pass: boolean; detail: string }> {
  await browserOpen(GKIBASE);
  await browserWait(9000);
  await browserClickByText('Returning Families');
  await browserWait(7000);
  await browserFill([
    { label: 'Email / Cell', value: GKI_EMAIL },
    { label: 'Password', value: GKI_PASS },
  ]);
  await browserClickByText('Log In');
  await browserWait(10000);
  const s = await browserState();
  if (!s.ok || !s.data.isLoggedIn) return { pass: false, detail: `login failed: ${s.reason ?? ''}` };
  await browserOpen(`${GKIBASE}/application/create-traditional`);
  await browserWait(12000);
  await browserClickControl('Never Received Cash Aid', 'radio');
  await browserClickControl('Friend/Relative', 'radio');
  await browserSelectOption('data[cw_app_application.wat_app_application_subsidy__FamilyType]', 'Biological/Adoptive');
  const step1 = await browserState();
  const text = step1.ok ? step1.data.text : '';
  const ok = Boolean(step1.ok && (/cash aid/i.test(text) || /family/i.test(text)) && !step1.data.hasSignInWall);
  return { pass: ok, detail: `logged in + reached eligibility step 1 (url=${s.data.url})` };
}

async function main(): Promise<void> {
  process.env.BROWSER_BACKEND = 'stagehand';
  const results: TaskResult[] = [];

  const run = async (id: string, title: string, tier: number, fn: () => Promise<{ pass: boolean; detail: string }>) => {
    const start = Date.now();
    try {
      const r = await fn();
      results.push({ id, title, tier, pass: r.pass, detail: r.detail, ms: Date.now() - start });
      console.log(`${r.pass ? 'PASS' : 'FAIL'} ${id} — ${r.detail} (${Date.now() - start}ms)`);
    } catch (e) {
      results.push({ id, title, tier, pass: false, detail: String((e as Error)?.message ?? e), ms: Date.now() - start });
      console.log(`FAIL ${id} — ${String((e as Error)?.message ?? e)}`);
    }
  };

  console.log('Benchmark: filling representative form tasks per tier…\n');
  await browserReset();
  await run('t1-ckc-fill', 'CKC Soquel (Google Form fill)', 1, ckcFillTask);
  await browserReset();
  await run('t1-gform-fill', 'Google Form fill (test form)', 1, gformFillTask);
  await run('t2-pdf-fill', 'Capitola scholarship (PDF fill)', 2, pdfTask);
  await browserReset();
  await run('t3-gki-reach', 'Go Kids (login + step 1 fill)', 3, gkiReachTask);

  const passed = results.filter((r) => r.pass).length;
  const rate = (passed / results.length) * 100;
  console.log(`\n${'─'.repeat(56)}`);
  for (const r of results) console.log(`${r.pass ? '✅' : '❌'}  Tier ${r.tier}  ${r.title}  (${r.ms}ms)`);
  console.log('─'.repeat(56));
  console.log(`RESULT: ${passed}/${results.length} forms handled end-to-end (${rate.toFixed(0)}%)`);

  await browserClose();
}

main().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});

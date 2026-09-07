import 'dotenv/config';
import assert from 'node:assert/strict';
import { fillPdf } from '../src/integrations/pdf.js';
import { MockEmailProvider } from '../src/integrations/email.js';
import { existsSync, readFileSync } from 'node:fs';

const CAPITOLA = 'https://www.cityofcapitola.gov/DocumentCenter/View/212/Scholarship-Application--Spanish';

async function main(): Promise<void> {
  // 1. Fill the PDF (offline).
  const r = await fillPdf(CAPITOLA, [
    { label: 'Nombre del niño', value: 'Maya López' },
    { label: 'Correo electrónico', value: 'maya@example.com' },
    { label: 'Estado', value: 'CA' },
  ]);
  assert.ok(r.ok && r.data, `pdf fill failed: ${r.reason ?? ''}`);
  assert.ok(r.data.filePath && existsSync(r.data.filePath), 'filled PDF file should exist');
  console.log('filled PDF:', r.data.filePath, `(${(readFileSync(r.data.filePath!).length / 1024).toFixed(1)} KB)`);

  // 2. "Send" it to the school via email with the PDF as an attachment.
  const email = new MockEmailProvider();
  const rec = await email.send({
    to: 'kap@district.example.org',
    subject: 'Completed scholarship application',
    body: 'Attached is the completed application for Maya López.',
    attachments: [{ filename: 'capitola-scholarship-maya.pdf', path: r.data.filePath }],
  });
  assert.ok(rec.sent, 'mock email should send');
  console.log('email receipt:', rec.id);

  console.log('\nPDF delivery (fill → attach → email): PASS');
}

main().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});

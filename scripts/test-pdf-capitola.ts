import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { listPdfFields, fillPdf } from '../src/integrations/pdf.js';

/**
 * Real-form test: the Capitola scholarship PDF has mangled field names, so
 * label-based fill only works through the known-form map in pdf-forms.ts.
 * Fills by plain Spanish label and proves the values land on the right fields.
 * (Network test — the city could update the PDF, but field order is pinned by
 * scripts/gen-pdf-forms.ts which fails loudly on drift.)
 */

const URL = 'https://www.cityofcapitola.gov/DocumentCenter/View/212/Scholarship-Application--Spanish';

async function main(): Promise<void> {
  // 1. Field listing should decode mangled names to Spanish labels.
  const listed = await listPdfFields(URL);
  assert.ok(listed.ok, `list failed: ${listed.reason}`);
  assert.strictEqual(listed.data!.fieldCount, 30);
  const labels = listed.data!.fields.map((f) => f.label);
  for (const expected of ['Nombre del niño', 'Correo electrónico', 'Estado', 'Ingresos mensuales de la familia']) {
    assert.ok(labels.includes(expected), `expected decoded label "${expected}"`);
  }
  console.log('✓ pdf_fields: 30 fields, labels decoded (e.g. "Nombre del niño")');

  // 2. Fill by Spanish label (NOT by garbled field name).
  const res = await fillPdf(URL, [
    { label: 'Nombre del niño', value: 'Maya López' },
    { label: 'Correo electrónico', value: 'maya@example.com' },
    { label: 'Teléfono principal', value: '8315551234' },
    { label: 'Estado', value: 'CA' },
    { label: 'Ingresos mensuales de la familia', value: '3000' },
    { label: 'Total de gastos mensuales', value: '2500' },
  ]);
  assert.ok(res.ok, `fill failed: ${res.reason}`);
  assert.strictEqual(res.data!.filled, 6, `expected 6 filled, got ${res.data!.filled}`);
  assert.deepStrictEqual(res.data!.unmatched, [], `unmatched: ${JSON.stringify(res.data!.unmatched)}`);
  assert.deepStrictEqual(res.data!.failed, [], `failed: ${JSON.stringify(res.data!.failed)}`);
  console.log('✓ pdf_fill: 6/6 Spanish labels resolved via known-form map');

  // 3. Re-open the output and prove values landed on the correct (garbled) fields.
  const reopened = await PDFDocument.load(res.data!.bytes!);
  const form = reopened.getForm();
  assert.strictEqual(form.getTextField('538 2 4O5H').getText(), 'Maya López');
  assert.strictEqual(form.getTextField('5885 28Q45H').getText(), 'maya@example.com');
  assert.strictEqual(form.getTextField('2 545 68462H').getText(), '8315551234');
  assert.strictEqual(form.getTextField('95H').getText(), 'CA');
  assert.strictEqual(form.getTextField('48959 34929  2 32 P59 29 49  48959QH').getText(), '3000');
  assert.strictEqual(form.getTextField('52  959 34929H').getText(), '2500');
  console.log('✓ re-open verify: every value landed on the right field');

  console.log('\nCapitola scholarship (Tier 2) label-fill: PASS');
}

main().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});

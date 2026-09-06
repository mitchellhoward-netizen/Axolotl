import { PDFDocument, StandardFonts } from 'pdf-lib';
import assert from 'node:assert/strict';
import { fillPdfBytes, listPdfFieldsBytes } from '../src/integrations/pdf.js';

/**
 * Deterministic test of the PDF form-filling capability. Builds a fillable
 * PDF fixture (text, checkbox, radio, dropdown), fills it by natural-language
 * label + exact field name, then re-opens the output to prove the values
 * persisted. No network, no real form submitted.
 */

async function makeFixture(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const form = doc.getForm();

  form.createTextField('nombre_completo');
  form.createTextField('correo_electronico');
  const acepto = form.createCheckBox('acepto_terminos');
  acepto.addToPage(page, { x: 50, y: 650, width: 14, height: 14 });

  const grado = form.createRadioGroup('grado');
  grado.addOptionToPage('4to', page, { x: 50, y: 700, width: 14, height: 14, font, size: 11 });
  grado.addOptionToPage('5to', page, { x: 50, y: 680, width: 14, height: 14, font, size: 11 });

  const escuela = form.createDropdown('escuela');
  escuela.addOptions(['Soquel', 'New Brighton', 'Main Street']);

  return doc.save();
}

async function main(): Promise<void> {
  const fixture = await makeFixture();

  // 1. Field listing.
  const listed = await listPdfFieldsBytes(fixture);
  assert.ok(listed.ok, `list should succeed: ${listed.reason}`);
  assert.strictEqual(listed.data!.fieldCount, 5, 'expected 5 fields');
  const names = listed.data!.fields.map((f) => f.name).sort();
  assert.deepStrictEqual(
    names,
    ['acepto_terminos', 'correo_electronico', 'escuela', 'grado', 'nombre_completo'],
  );
  console.log('✓ listPdfFieldsBytes:', names.join(', '));

  // 2. Fill by label (incl. accent-stripping match) + exact field name.
  const res = await fillPdfBytes(fixture, [
    { label: 'Nombre completo', value: 'Maya López' },
    { label: 'Correo electrónico', value: 'maya@example.com' },
    { label: 'Acepto términos', value: 'yes' },
    { label: 'Grado', value: '4to' },
    { field: 'escuela', value: 'New Brighton' },
    { field: 'no_existe', value: 'x' }, // should be unmatched
  ]);
  assert.ok(res.ok, `fill should succeed: ${res.reason}`);
  assert.strictEqual(res.data!.filled, 5, `expected 5 filled, got ${res.data!.filled}`);
  assert.deepStrictEqual(res.data!.unmatched, ['no_existe']);
  assert.strictEqual(res.data!.failed.length, 0, `no failures: ${JSON.stringify(res.data!.failed)}`);
  assert.ok(res.data!.filePath, 'should write a filled PDF file');
  console.log('✓ fillPdfBytes: 5/5 filled, 1 unmatched, file:', res.data!.filePath);

  // 3. Re-open the output and prove the values persisted.
  const reopened = await PDFDocument.load(res.data!.bytes!);
  const form = reopened.getForm();
  assert.strictEqual(form.getTextField('nombre_completo').getText(), 'Maya López');
  assert.strictEqual(form.getTextField('correo_electronico').getText(), 'maya@example.com');
  assert.strictEqual(form.getCheckBox('acepto_terminos').isChecked(), true);
  assert.strictEqual(form.getRadioGroup('grado').getSelected(), '4to');
  assert.strictEqual(form.getDropdown('escuela').getSelected().join(','), 'New Brighton');
  console.log('✓ re-open verify: text, checkbox, radio, dropdown all persisted');

  console.log('\nPDF fill capability: PASS');
}

main().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});

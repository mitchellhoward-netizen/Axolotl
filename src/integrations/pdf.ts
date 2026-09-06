import {
  PDFDocument,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
  PDFField,
} from 'pdf-lib';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findForm, type KnownForm, type KnownFormField } from './pdf-forms.js';

/**
 * PDF form filling ("the PDF gap"). School districts lean heavily on PDF
 * applications; `extractPdf` only reads them. Here we fill the AcroForm
 * (fillable) fields — text, checkbox, radio, dropdown — and produce a
 * completed PDF the parent can review, then email or upload (submit is a
 * separate, consent-gated step).
 */

export type PdfFieldType =
  | 'text'
  | 'checkbox'
  | 'radio'
  | 'dropdown'
  | 'optionlist'
  | 'button'
  | 'signature'
  | 'other';

export interface PdfFieldInfo {
  name: string;
  type: PdfFieldType;
  /** Current value (text/selected option/checked state), if any. */
  value?: string;
  /** Valid choices for radio/dropdown/option-list fields. */
  options?: string[];
  /** Human label from a known-form map (when the PDF's own name is mangled). */
  label?: string;
}

export interface PdfResult<T> {
  ok: boolean;
  reason?: string;
  data?: T;
}

export interface PdfFillField {
  /** Human label ("Child First Name") — matched to the closest field name. */
  label?: string;
  /** Exact AcroForm field name from `pdf_fields` — takes priority over label. */
  field?: string;
  value: string;
}

export interface PdfFillData {
  /** Requested fields successfully written and verified. */
  filled: number;
  total: number;
  /** Labels/names that matched no field in the PDF. */
  unmatched: string[];
  /** Fields that matched but could not be written. */
  failed: Array<{ field: string; error: string }>;
  /** Total AcroForm fields in the source PDF. */
  fieldCount: number;
  filledFieldNames: string[];
  /** The filled PDF bytes (for tests / attachments). */
  bytes?: Uint8Array;
  /** Absolute path the filled PDF was written to. */
  filePath?: string;
  /** base64 data URL of the filled PDF. */
  dataUrl?: string;
}

function msg(e: unknown): string {
  return String((e as Error)?.message ?? e);
}

/** Normalize for matching: lowercase, strip accents + non-alphanumerics. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function fieldType(f: PDFField): PdfFieldType {
  if (f instanceof PDFTextField) return 'text';
  if (f instanceof PDFCheckBox) return 'checkbox';
  if (f instanceof PDFRadioGroup) return 'radio';
  if (f instanceof PDFDropdown) return 'dropdown';
  if (f instanceof PDFOptionList) return 'optionlist';
  return 'other';
}

function fieldOptions(f: PDFField): string[] | undefined {
  try {
    if (f instanceof PDFRadioGroup || f instanceof PDFDropdown || f instanceof PDFOptionList) {
      const opts = f.getOptions();
      return opts.length ? opts : undefined;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

/** `getSelected()` is `string` for radio and `string[]` for dropdown/list — normalize. */
function selectedString(f: PDFRadioGroup | PDFDropdown | PDFOptionList): string | undefined {
  const s = f.getSelected();
  if (s == null) return undefined;
  return Array.isArray(s) ? (s[0] ?? undefined) : s;
}

function fieldValue(f: PDFField): string | undefined {
  try {
    if (f instanceof PDFTextField) return f.getText() || undefined;
    if (f instanceof PDFCheckBox) return f.isChecked() ? 'checked' : 'unchecked';
    if (f instanceof PDFRadioGroup || f instanceof PDFDropdown || f instanceof PDFOptionList) {
      return selectedString(f);
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

async function fetchPdfBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Map a label or exact name to one of the PDF's field names. */
function resolveField(needle: string, names: string[]): string | undefined {
  const n = norm(needle);
  if (!n) return undefined;
  const exact = names.find((f) => f.toLowerCase() === needle.toLowerCase());
  if (exact) return exact;
  const normExact = names.find((f) => norm(f) === n);
  if (normExact) return normExact;
  for (const f of names) {
    const fn = norm(f);
    if (fn.length >= 3 && (fn.includes(n) || n.includes(fn))) return f;
  }
  return undefined;
}

/** Human label for a raw field name, from a known-form map (if registered). */
function labelForField(form: KnownForm, name: string): string | undefined {
  return form.fields.find((f) => f.field === name)?.label;
}

/** Match a requested label against a known-form map's labels + aliases. */
function resolveFormEntry(needle: string, form: KnownForm): KnownFormField | undefined {
  const n = norm(needle);
  if (!n) return undefined;
  for (const f of form.fields) {
    const candidates = [f.label, ...(f.aliases ?? [])];
    if (candidates.some((c) => norm(c) === n)) return f;
  }
  for (const f of form.fields) {
    const candidates = [f.label, ...(f.aliases ?? [])];
    for (const c of candidates) {
      const cn = norm(c);
      if (cn.length >= 3 && (cn.includes(n) || n.includes(cn))) return f;
    }
  }
  return undefined;
}

/** Resolve a label to a real field name via a known-form map (fallback). */
function resolveFieldInForm(needle: string, form: KnownForm, names: string[]): string | undefined {
  const entry = resolveFormEntry(needle, form);
  if (!entry) return undefined;
  const exact = names.find((n) => n === entry.field);
  if (exact) return exact;
  return resolveField(entry.field, names);
}

function isTruthy(v: string): boolean {
  const t = norm(v);
  if (!t) return false;
  const falsey = ['no', 'false', '0', 'off', 'unchecked', 'uncheck', 'notchecked', 'none'];
  return !falsey.includes(t);
}

type ChoiceField = PDFRadioGroup | PDFDropdown | PDFOptionList;

function selectChoice(f: ChoiceField, value: string): void {
  const opts = f.getOptions();
  const v = value.trim();
  if (opts.includes(v)) return void f.select(v);
  const ci = opts.find((o) => o.toLowerCase() === v.toLowerCase());
  if (ci) return void f.select(ci);
  const nv = norm(v);
  const neq = opts.find((o) => norm(o) === nv);
  if (neq) return void f.select(neq);
  const contains = opts.find((o) => norm(o).includes(nv) || nv.includes(norm(o)));
  if (contains) return void f.select(contains);
  throw new Error(`option "${value}" not among: ${opts.join(', ')}`);
}

async function setFieldValue(f: PDFField, value: string): Promise<void> {
  if (f instanceof PDFTextField) {
    f.setText(value);
  } else if (f instanceof PDFCheckBox) {
    if (isTruthy(value)) f.check();
    else f.uncheck();
  } else if (f instanceof PDFRadioGroup || f instanceof PDFDropdown || f instanceof PDFOptionList) {
    selectChoice(f, value);
  } else {
    throw new Error(`cannot fill field type ${fieldType(f)}`);
  }
}

async function fieldHoldsValue(f: PDFField, value: string): Promise<boolean> {
  if (f instanceof PDFTextField) return (f.getText() ?? '').trim() === value.trim();
  if (f instanceof PDFCheckBox) return f.isChecked() === isTruthy(value);
  if (f instanceof PDFRadioGroup || f instanceof PDFDropdown || f instanceof PDFOptionList) {
    return Boolean(selectedString(f));
  }
  return true;
}

/** List the fillable AcroForm fields in raw PDF bytes. */
export async function listPdfFieldsBytes(
  buf: Uint8Array,
  knownMap?: KnownForm,
): Promise<PdfResult<{ fields: PdfFieldInfo[]; fieldCount: number }>> {
  try {
    const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
    const form = doc.getForm();
    const fields = form.getFields().map((f) => {
      const name = f.getName();
      return {
        name,
        type: fieldType(f),
        value: fieldValue(f),
        options: fieldOptions(f),
        label: knownMap ? labelForField(knownMap, name) : undefined,
      };
    });
    return { ok: true, data: { fields, fieldCount: fields.length } };
  } catch (e) {
    return { ok: false, reason: msg(e) };
  }
}

export async function listPdfFields(
  url: string,
): Promise<PdfResult<{ fields: PdfFieldInfo[]; fieldCount: number }>> {
  try {
    return listPdfFieldsBytes(await fetchPdfBytes(url), findForm(url));
  } catch (e) {
    return { ok: false, reason: msg(e) };
  }
}

/** Fill raw PDF bytes and return the completed document. */
export async function fillPdfBytes(
  buf: Uint8Array,
  fields: PdfFillField[],
  knownMap?: KnownForm,
): Promise<PdfResult<PdfFillData>> {
  const out: PdfFillData = {
    filled: 0,
    total: fields.length,
    unmatched: [],
    failed: [],
    fieldCount: 0,
    filledFieldNames: [],
  };
  try {
    const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
    const form = doc.getForm();
    const names = form.getFields().map((f) => f.getName());
    out.fieldCount = names.length;

    for (const req of fields) {
      const value = String(req.value ?? '');
      const needle = req.field?.trim() || req.label?.trim() || '';
      // 1) exact field name, 2) generic label->name match, 3) known-form map.
      let name = req.field?.trim() ? resolveField(req.field.trim(), names) : undefined;
      if (!name && req.label?.trim()) name = resolveField(req.label.trim(), names);
      if (!name && req.label?.trim() && knownMap) {
        name = resolveFieldInForm(req.label.trim(), knownMap, names);
      }
      if (!name) {
        out.unmatched.push(needle || '(unnamed)');
        continue;
      }
      try {
        const field = form.getField(name);
        await setFieldValue(field, value);
        if (await fieldHoldsValue(field, value)) {
          out.filled++;
          out.filledFieldNames.push(name);
        } else {
          out.failed.push({ field: name, error: 'value did not persist' });
        }
      } catch (e) {
        out.failed.push({ field: name, error: msg(e) });
      }
    }

    const bytes = await doc.save();
    out.bytes = bytes;
    const dir = path.join(tmpdir(), 'axolotl');
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `filled-${Date.now().toString(36)}.pdf`);
    await writeFile(filePath, bytes);
    out.filePath = filePath;
    out.dataUrl = `data:application/pdf;base64,${Buffer.from(bytes).toString('base64')}`;
    return { ok: true, data: out };
  } catch (e) {
    return { ok: false, reason: msg(e), data: out };
  }
}

export async function fillPdf(
  url: string,
  fields: PdfFillField[],
): Promise<PdfResult<PdfFillData>> {
  try {
    return fillPdfBytes(await fetchPdfBytes(url), fields, findForm(url));
  } catch (e) {
    return { ok: false, reason: msg(e) };
  }
}

import { type PDFDict, PDFDocument, PDFHexString, PDFName, PDFString, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { FieldValue } from '../pathways/types.js';

/**
 * Filling a flat, image-only PDF (a Canva export with no text layer and no fields) by drawing
 * the values onto the page at measured coordinates.
 *
 * Coordinates are PDF user space: points, origin at the page's bottom-left. For a text field,
 * (x, y) is the left end of the baseline and `w` the width it must fit in (the font shrinks to
 * fit, down to `MIN_SIZE`; past that the field is reported as overflowing, never cut). For a
 * check, (x, y) is the centre of the box. A choice field is a set of boxes, one per allowed
 * value, and the value says which one to check.
 *
 * What was drawn is written into the PDF itself, in the document info dictionary under
 * `/AxolotlFill` (JSON, as a UTF-16 hex string): the form id, the language, the structured
 * values and every mark with its page, position, size and text. `readBack` reads it from the
 * bytes alone, so a grader can check the artifact without trusting the code that made it.
 * The record is built inside the drawing loop, from what was actually put on the page.
 */

export type OverlayField =
  | { kind: 'text'; page: number; x: number; y: number; w?: number; size?: number; format?: (v: string) => string }
  | { kind: 'check'; page: number; x: number; y: number; size?: number }
  | { kind: 'choice'; page: number; options: Record<string, { x: number; y: number }>; size?: number };

export type OverlayMap = Record<string, OverlayField>;

export interface DrawnMark {
  field: string;
  /** Page index in the output PDF. */
  page: number;
  x: number;
  y: number;
  size: number;
  /** The text drawn, or "X" for a check. */
  text: string;
}

export interface OverlayRecord {
  v: 1;
  formId: string;
  lang: string;
  /** The structured fill that was drawn, field id → value (false and empty included). */
  values: Record<string, FieldValue>;
  drawn: DrawnMark[];
}

export interface OverlayResult {
  bytes: Uint8Array;
  record: OverlayRecord;
  /** Fields whose text didn't fit their box even at the smallest size. Drawn, but flagged. */
  overflow: string[];
  /** Fields with characters the standard font can't encode. Not drawn. */
  unencodable: string[];
  /** Values with no place on this map (a bug in the form map). Not drawn. */
  unmapped: string[];
}

export const INFO_KEY = 'AxolotlFill';
const MIN_SIZE = 5;
const DEFAULT_SIZE = 9;
const INK = rgb(0.05, 0.12, 0.45);

export async function drawOverlay(
  source: Uint8Array,
  map: OverlayMap,
  values: Record<string, FieldValue>,
  opts: { formId: string; lang: string; /** Source page indexes to keep, in order (all by default). */ pages?: number[] },
): Promise<OverlayResult> {
  const src = await PDFDocument.load(source);
  const keep = opts.pages ?? src.getPageIndices();
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, keep);
  copied.forEach((p) => out.addPage(p));
  const outIndex = new Map(keep.map((srcIdx, i) => [srcIdx, i]));
  const font = await out.embedFont(StandardFonts.Helvetica);

  const drawn: DrawnMark[] = [];
  const overflow: string[] = [];
  const unencodable: string[] = [];
  const unmapped: string[] = [];

  const pageFor = (field: string, srcPage: number): { page: PDFPage; idx: number } | undefined => {
    const idx = outIndex.get(srcPage);
    if (idx === undefined) {
      unmapped.push(field);
      return undefined;
    }
    return { page: out.getPage(idx), idx };
  };
  const cross = (page: PDFPage, x: number, y: number, size: number) => {
    const h = size / 2;
    page.drawLine({ start: { x: x - h, y: y - h }, end: { x: x + h, y: y + h }, thickness: 1.3, color: INK });
    page.drawLine({ start: { x: x - h, y: y + h }, end: { x: x + h, y: y - h }, thickness: 1.3, color: INK });
  };

  for (const [field, value] of Object.entries(values)) {
    const spec = map[field];
    if (!spec) {
      unmapped.push(field);
      continue;
    }
    if (spec.kind === 'text') {
      const raw = typeof value === 'string' ? value : String(value);
      if (!raw) continue;
      const text = spec.format ? spec.format(raw) : raw;
      if (!encodable(font, text)) {
        unencodable.push(field);
        continue;
      }
      const at = pageFor(field, spec.page);
      if (!at) continue;
      let size = spec.size ?? DEFAULT_SIZE;
      if (spec.w) {
        while (size > MIN_SIZE && font.widthOfTextAtSize(text, size) > spec.w) size -= 0.25;
        if (font.widthOfTextAtSize(text, size) > spec.w) overflow.push(field);
      }
      at.page.drawText(text, { x: spec.x, y: spec.y, size, font, color: INK });
      drawn.push({ field, page: at.idx, x: spec.x, y: spec.y, size, text });
    } else if (spec.kind === 'check') {
      if (value !== true) continue;
      const at = pageFor(field, spec.page);
      if (!at) continue;
      const size = spec.size ?? 7;
      cross(at.page, spec.x, spec.y, size);
      drawn.push({ field, page: at.idx, x: spec.x, y: spec.y, size, text: 'X' });
    } else {
      if (typeof value !== 'string' || !value) continue;
      const opt = spec.options[value];
      if (!opt) {
        unmapped.push(`${field}=${value}`);
        continue;
      }
      const at = pageFor(field, spec.page);
      if (!at) continue;
      const size = spec.size ?? 7;
      cross(at.page, opt.x, opt.y, size);
      drawn.push({ field, page: at.idx, x: opt.x, y: opt.y, size, text: `X:${value}` });
    }
  }

  const skipped = new Set([...unencodable, ...unmapped]);
  const record: OverlayRecord = {
    v: 1,
    formId: opts.formId,
    lang: opts.lang,
    values: Object.fromEntries(Object.entries(values).filter(([k]) => !skipped.has(k))),
    drawn,
  };
  out.setTitle(`${opts.formId} (${opts.lang})`);
  out.setProducer('Axolotl pdf-overlay');
  out.setKeywords(['axolotl-fill', opts.formId, opts.lang]);
  infoDict(out).set(PDFName.of(INFO_KEY), PDFHexString.fromText(JSON.stringify(record)));
  const bytes = await out.save();
  return { bytes, record, overflow, unencodable, unmapped };
}

/** What a filled PDF says it holds, from its own bytes. Null when it carries no fill record. */
export async function readBack(pdf: Uint8Array): Promise<OverlayRecord | null> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  const raw = infoDict(doc).lookup(PDFName.of(INFO_KEY));
  if (!(raw instanceof PDFHexString || raw instanceof PDFString)) return null;
  try {
    const rec = JSON.parse(raw.decodeText()) as OverlayRecord;
    return rec && rec.v === 1 ? rec : null;
  } catch {
    return null;
  }
}

/** The document info dictionary (pdf-lib keeps its accessor private; setTitle and friends use it). */
function infoDict(doc: PDFDocument): PDFDict {
  return (doc as unknown as { getInfoDict(): PDFDict }).getInfoDict();
}

function encodable(font: PDFFont, text: string): boolean {
  try {
    font.encodeText(text);
    return true;
  } catch {
    return false;
  }
}

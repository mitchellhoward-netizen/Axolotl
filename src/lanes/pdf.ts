import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PVUSD_UBA_PDF } from '../forms/ca-pvusd-uba-2026.js';
import { drawOverlay, readBack, type OverlayMap, type OverlayRecord } from '../forms/pdf-overlay.js';
import type { FieldValue, FormFill, FormMap, Lang, LaneResult, LaneRunner, Text } from '../pathways/types.js';

/**
 * Lane C/F for a flat PDF: draw the approved fill onto the blank form's page images, hand the
 * parent the filled pages to sign, and read back what the file holds.
 *
 * Where the PDF goes: the result carries the bytes (`pdf`) and, when the lane was given an
 * `outDir`, the path it wrote (`path`, also in `detail`). The file is written BEFORE the parent
 * is asked to sign, so whatever `attest` does (send it to the parent, print it) has the file.
 *
 * Status: never "done". A paper form returned to the school prints no receipt, so the best
 * this lane can say is "sent, not confirmed" (`sent_unconfirmed`) once the parent has the
 * filled form and has said they'll sign it; the confirmation is the school's notice later.
 * The parent declining to sign is a `handoff` (nothing went anywhere). A fill with missing
 * facts, text that doesn't fit, or a read-back that differs from the fill is `failed`.
 */

export interface PdfTemplate {
  formId: string;
  /** The blank form on disk. */
  path: string;
  /** Source page indexes per language, in output order. */
  pages: Partial<Record<Lang, number[]>>;
  overlay: (lang: Lang) => OverlayMap;
  /** What to tell the parent once the filled form is in their hands. */
  summary?: Text;
}

export interface PdfLaneResult extends LaneResult {
  /** The filled PDF (absent when nothing was produced). */
  pdf?: Uint8Array;
  /** Where it was written, if the lane has an `outDir`. */
  path?: string;
  /** The full read-back record from the PDF's own metadata (values and every mark drawn). */
  record?: OverlayRecord;
}

export interface PdfLaneOptions {
  templates?: PdfTemplate[];
  /** Write each filled PDF here (created if needed). */
  outDir?: string;
  /** Filename for a run; default `<formId>-<lang>-<timestamp>.pdf`. */
  fileName?: (formId: string, lang: Lang) => string;
}

const PVUSD_SUMMARY: Text = {
  en:
    "Your Universal Benefits Application is filled in. Print it, sign and date the box at the bottom of page 1, and take it to your child's school office or to Food & Nutrition Services (831-786-2325). " +
    "The district doesn't give a receipt for this form, so I'll treat it as sent but not confirmed until the school's notice arrives. If you'd like, call Food & Nutrition Services first: your child may already qualify without the form.",
  es:
    'Su Solicitud de Beneficios Universales está llena. Imprímala, firme y ponga la fecha en el recuadro al final de la página 1, y llévela a la oficina de la escuela de su hijo o a Servicios de Alimentos y Nutrición (831-786-2325). ' +
    'El distrito no da un comprobante por este formulario, así que lo consideraré enviado pero sin confirmar hasta que llegue el aviso de la escuela. Si quiere, llame primero a Servicios de Alimentos y Nutrición: es posible que su hijo ya califique sin el formulario.',
};

export const DEFAULT_TEMPLATES: PdfTemplate[] = [{ ...PVUSD_UBA_PDF, summary: PVUSD_SUMMARY }];

const FAILED: Text = {
  en: "I couldn't finish filling in the form, so nothing has been sent. I'll look at what went wrong.",
  es: 'No pude terminar de llenar el formulario, así que no se envió nada. Voy a revisar qué salió mal.',
};
const DECLINED: Text = {
  en: "That's fine: nothing has been sent. The form is filled in and ready whenever you want to sign it.",
  es: 'Está bien: no se ha enviado nada. El formulario está lleno y listo para cuando quiera firmarlo.',
};

export class PdfLane implements LaneRunner {
  readonly kind = 'pdf' as const;
  private readonly templates: PdfTemplate[];

  constructor(private readonly opts: PdfLaneOptions = {}) {
    this.templates = opts.templates ?? DEFAULT_TEMPLATES;
  }

  async run(form: FormMap, fill: FormFill, ctx: { lang: Lang; attest: (fields: string[]) => Promise<void> }): Promise<PdfLaneResult> {
    const fail = (detail: string, extra: Partial<PdfLaneResult> = {}): PdfLaneResult => ({ status: 'failed', readBack: {}, parentSummary: FAILED, detail, ...extra });
    const tpl = this.templates.find((t) => t.formId === form.id);
    if (!tpl) return fail(`no PDF template for ${form.id}`);
    if (fill.missing.length) return fail(`fill has missing facts: ${fill.missing.join(', ')}`);
    const leaked = fill.attestations.filter((a) => a in fill.values);
    if (leaked.length) return fail(`attestation fields in values: ${leaked.join(', ')}`);
    const lang: Lang = tpl.pages[ctx.lang] ? ctx.lang : 'en';
    const pages = tpl.pages[lang]!;

    const blank = new Uint8Array(await readFile(tpl.path));
    const drawn = await drawOverlay(blank, tpl.overlay(lang), fill.values, { formId: form.id, lang, pages });
    const problems = [
      ...drawn.overflow.map((f) => `${f}: too long for its box`),
      ...drawn.unencodable.map((f) => `${f}: characters the form font can't write`),
      ...drawn.unmapped.map((f) => `${f}: no place on the form`),
    ];
    if (problems.length) return fail(problems.join('; '));

    // Read back from the bytes, and compare with what we meant to write.
    const back = await readBack(drawn.bytes);
    if (!back) return fail('the filled PDF carries no fill record');
    const diff = diffValues(fill.values, back.values);
    if (diff.length) return fail(`read-back differs: ${diff.join(', ')}`, { readBack: back.values, record: back });

    let filePath: string | undefined;
    if (this.opts.outDir) {
      await mkdir(this.opts.outDir, { recursive: true });
      const name = this.opts.fileName?.(form.id, lang) ?? `${form.id}-${lang}-${Date.now()}.pdf`;
      filePath = path.join(this.opts.outDir, name);
      await writeFile(filePath, drawn.bytes);
    }

    // The signature and date are the parent's. We never mark them.
    try {
      await ctx.attest(fill.attestations.length ? fill.attestations : ['signature', 'date']);
    } catch (e) {
      return { status: 'handoff', readBack: back.values, parentSummary: DECLINED, detail: `parent did not attest: ${(e as Error).message}`, pdf: drawn.bytes, path: filePath, record: back };
    }

    return {
      status: 'sent_unconfirmed',
      readBack: back.values,
      parentSummary: tpl.summary ?? {
        en: 'The form is filled in. Sign it and return it to the office; there is no receipt, so it counts as sent but not confirmed.',
        es: 'El formulario está lleno. Fírmelo y entréguelo en la oficina; no hay comprobante, así que cuenta como enviado sin confirmar.',
      },
      detail: filePath ? `filled PDF: ${filePath}` : 'filled PDF returned in memory (no outDir)',
      pdf: drawn.bytes,
      path: filePath,
      record: back,
    };
  }
}

export function diffValues(want: Record<string, FieldValue>, got: Record<string, FieldValue>): string[] {
  const keys = new Set([...Object.keys(want), ...Object.keys(got)]);
  return [...keys].filter((k) => want[k] !== got[k]).sort();
}

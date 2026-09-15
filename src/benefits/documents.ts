import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface DocumentFile { id: string; mimeType: string; bytes: Buffer }
export interface DocumentPage { text: string; method: 'pdf_text' | 'ocr' }
export type DocumentField = 'provider' | 'patient' | 'serviceDate' | 'receiptDate' | 'description' |
  'totalCents' | 'paidCents' | 'planName' | 'coverageStart' | 'coverageEnd' | 'filingDeadline';
export interface DocumentFact {
  field: DocumentField; value: string | number;
  source: { document: string; page: number; line: number; quote: string; method: DocumentPage['method'] };
}
export interface DocumentAnalysis {
  id: string; digest: string; kind: 'receipt' | 'plan' | 'unknown';
  status: 'extracted' | 'unreadable'; pages: number;
  facts: DocumentFact[]; issues: string[];
}
export interface DocumentReview {
  documents: DocumentAnalysis[];
  issues: string[];
  questions: string[];
}
export const documentDigest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

// Deliberately conservative: these are attributed candidates, never eligibility
// decisions. This extractor makes no model calls. The personal planner can read
// structured candidates as untrusted data; they never confer action authority.
const labels: Array<[DocumentField, RegExp]> = [
  ['provider', /^(?:provider|merchant|practice|pharmacy|optician)\s*:\s*(.+)$/i],
  ['patient', /^(?:patient(?: name)?|member name|dependent name)\s*:\s*(.+)$/i],
  ['serviceDate', /^(?:date of service|service date|purchase date)\s*:\s*(.+)$/i],
  ['receiptDate', /^(?:receipt date|transaction date|date)\s*:\s*(.+)$/i],
  ['description', /^(?:description|item|service|item description)\s*:\s*(.+)$/i],
  ['totalCents', /^(?:grand total|total(?: amount)?)(?:\s*:\s*|\s+)(.+)$/i],
  ['paidCents', /^(?:amount paid|paid)(?:\s*:\s*|\s+)(.+)$/i],
  ['planName', /^(?:plan name|benefit plan)\s*:\s*(.+)$/i],
  ['coverageStart', /^(?:coverage start(?: date)?|plan start(?: date)?)\s*:\s*(.+)$/i],
  ['coverageEnd', /^(?:coverage end(?: date)?|plan end(?: date)?)\s*:\s*(.+)$/i],
  ['filingDeadline', /^(?:claim(?:s)? (?:filing |submission )?deadline|filing deadline|submit claims by)\s*:\s*(.+)$/i],
];

function dateValue(raw: string): string | undefined {
  let value = raw;
  const english = raw.match(/^(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}),? (\d{4})$/i);
  if (english) {
    const month = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].indexOf(english[1]!.toLowerCase()) + 1;
    value = `${english[3]}-${String(month).padStart(2, '0')}-${english[2]!.padStart(2, '0')}`;
  }
  // Slash dates remain ambiguous, even in an English document. Do not guess locale.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value) return value;
}

function moneyValue(raw: string): number | undefined {
  const match = raw.match(/^(?:USD\s*\$?|\$)\s*(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})(?:\s*USD)?$/i);
  if (!match) return;
  const cents = Number(match[1]!.replaceAll(',', '')) * 100 + Number(match[2]);
  if (Number.isSafeInteger(cents) && cents >= 0 && cents <= 100_000_000) return cents;
}

export function analyzeDocument(id: string, digest: string, pages: DocumentPage[]): DocumentAnalysis {
  const facts: DocumentFact[] = [];
  const issues = new Set<string>();
  if (!pages.length || pages.length > 20 || pages.reduce((n, p) => n + p.text.length, 0) > 120_000) throw new Error('Document exceeds extraction limits');
  for (const [page, content] of pages.entries()) {
    for (const [line, original] of content.text.split(/\r?\n/).entries()) {
      const quote = original.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim();
      for (const [field, pattern] of labels) {
        const match = quote.match(pattern);
        if (!match) continue;
        const raw = match[1]!.trim();
        if (raw.length > 250) { issues.add(`Page ${page + 1}: ${field} is too long to interpret safely.`); continue; }
        const value = field.endsWith('Cents') ? moneyValue(raw) :
          ['serviceDate', 'receiptDate', 'coverageStart', 'coverageEnd', 'filingDeadline'].includes(field) ? dateValue(raw) : raw;
        if (value === undefined) { issues.add(`Page ${page + 1}: ${field} has an ambiguous date, currency or amount; supply a clearer source.`); continue; }
        facts.push({ field, value, source: { document: id, page: page + 1, line: line + 1, quote, method: content.method } });
        if (facts.length > 100) throw new Error('Too many document facts');
      }
    }
  }
  const plan = facts.some(f => ['planName', 'coverageStart', 'coverageEnd', 'filingDeadline'].includes(f.field));
  const receipt = facts.some(f => ['totalCents', 'paidCents', 'serviceDate', 'description'].includes(f.field));
  const kind = plan && !receipt ? 'plan' : receipt && !plan ? 'receipt' : 'unknown';
  if (kind === 'unknown') issues.add('Document type is unclear or mixes receipt and plan facts. Upload separate, clearly labeled documents.');
  for (const [field] of labels) {
    if (field === 'description') continue; // Multiple item descriptions are not conflicting totals.
    if (new Set(facts.filter(f => f.field === field).map(f => f.value)).size > 1) issues.add(`Conflicting ${field} values in this document; do not choose one automatically.`);
  }
  const start = facts.find(f => f.field === 'coverageStart')?.value;
  const end = facts.find(f => f.field === 'coverageEnd')?.value;
  if (typeof start === 'string' && typeof end === 'string' && start > end) issues.add('Coverage dates are reversed; supply the correct plan source.');
  const total = facts.find(f => f.field === 'totalCents')?.value;
  const paid = facts.find(f => f.field === 'paidCents')?.value;
  if (total !== undefined && paid !== undefined && total !== paid) issues.add('Receipt total differs from amount paid. Clarify the actual out-of-pocket expense before preparing a claim.');
  return { id, digest, kind, status: 'extracted', pages: pages.length, facts, issues: [...issues] };
}

/** All parsing runs locally in bounded child processes, never through a shell.
 * Limits contain ordinary malformed/decompression-heavy files, but are not a
 * malware sandbox. No secrets are inherited by document processes. */
export async function extractDocument(file: DocumentFile, signal: AbortSignal): Promise<DocumentAnalysis> {
  const digest = documentDigest(file.bytes);
  let directory: string | undefined;
  try {
    if (file.bytes.length > 5 * 1024 * 1024 || !['application/pdf', 'image/png', 'image/jpeg'].includes(file.mimeType)) throw new Error('Unsupported document');
    signal.throwIfAborted();
    directory = await mkdtemp(join(tmpdir(), 'benny-document-'));
    const input = join(directory, 'input');
    await writeFile(input, file.bytes, { mode: 0o600 });
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(20_000)]);
    const run = (command: string, args: string[]): Promise<string> => new Promise((resolve, reject) => {
      execFile('/usr/bin/prlimit', ['--as=536870912', '--cpu=15', '--fsize=33554432', '--', `/usr/bin/${command}`, ...args],
        { cwd: directory, signal: bounded, timeout: 20_000, killSignal: 'SIGKILL', maxBuffer: 512_000,
          env: { PATH: '/usr/bin:/bin', LC_ALL: 'C', OMP_THREAD_LIMIT: '1', HOME: directory!, TMPDIR: directory! } },
        (error, stdout) => error ? reject(new Error('Local document extraction failed')) : resolve(stdout));
    });
    const ocr = (path: string) => run('tesseract', [path, 'stdout', '-l', 'eng', '--psm', '6']);
    const pages: DocumentPage[] = [];
    if (file.mimeType === 'application/pdf') {
      const info = await run('pdfinfo', [input]);
      const count = Number(info.match(/^Pages:\s+(\d+)$/m)?.[1]);
      if (!count || count > 20 || /^Encrypted:\s+yes/m.test(info)) throw new Error('Unsupported PDF');
      const text = await run('pdftotext', ['-layout', '-enc', 'UTF-8', input, '-']);
      const images = await run('pdfimages', ['-list', input]);
      const imagePages = new Set(images.split('\n').flatMap(line => {
        const page = line.match(/^\s*(\d+)\s+\d+\s+/)?.[1];
        return page ? [Number(page)] : [];
      }));
      const parts = text.split('\f');
      for (let page = 1; page <= count; page++) {
        const embedded = parts[page - 1] ?? '';
        // A scan can have only a footer or an obsolete hidden text layer. Read
        // the rendered image-bearing page, rather than silently losing its body.
        if (embedded.trim() && !imagePages.has(page)) pages.push({ text: embedded, method: 'pdf_text' });
        else {
          const prefix = join(directory, 'page');
          await run('pdftoppm', ['-f', String(page), '-l', String(page), '-singlefile', '-scale-to', '2000', '-png', input, prefix]);
          pages.push({ text: await ocr(`${prefix}.png`), method: 'ocr' });
        }
      }
    } else pages.push({ text: await ocr(input), method: 'ocr' });
    return analyzeDocument(file.id, digest, pages);
  } catch {
    return { id: file.id, digest, kind: 'unknown', status: 'unreadable', pages: 0, facts: [],
      issues: ['Could not safely read this file. Use an unlocked PDF of at most 20 pages or a clear English JPEG/PNG; check that local OCR tools are installed. No partial facts were accepted.'] };
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}

export function reviewDocuments(documents: DocumentAnalysis[]): DocumentReview {
  const issues = documents.flatMap((d, index) => d.issues.map(i => `Document ${index + 1}: ${i}`));
  const questions: string[] = [];
  if (documents.some(d => d.facts.some(f => f.source.method === 'ocr'))) questions.push('OCR was used. Compare all extracted values with the original before relying on them.');
  const receipts = documents.filter(d => d.kind === 'receipt');
  const plans = documents.filter(d => d.kind === 'plan');
  for (const [kind, group, fields] of [
    ['receipt', receipts, ['provider', 'patient', 'serviceDate', 'description', 'totalCents']],
    ['plan', plans, ['planName', 'coverageStart', 'coverageEnd', 'filingDeadline']],
  ] as const) {
    if (group.length > 1) issues.push(`Multiple ${kind} documents: keep one expense and one applicable plan per task; I will not merge or sum them.`);
    for (const field of fields) if (!group.some(d => d.facts.some(f => f.field === field))) questions.push(`Provide a ${kind} source for ${field}.`);
  }
  questions.push('Verify actual enrollment, dependent authority, expense coverage and prior reimbursement with the provider. Documents alone do not establish these.');
  return { documents, issues, questions };
}

export function documentSummary(review: DocumentReview): string {
  const lines = ['Document review — extracted candidates, NOT eligibility or submission approval.'];
  for (const [index, d] of review.documents.entries()) {
    lines.push(`\nDocument ${index + 1}: ${d.id}\n${d.kind}, ${d.status}, ${d.pages} pages:`);
    // Bound the iMessage, but keep every candidate/citation in encrypted storage.
    for (const f of d.facts.slice(0, 12)) lines.push(`${f.field}: ${typeof f.value === 'number' ? `$${(f.value / 100).toFixed(2)}` : f.value} [p${f.source.page}, line ${f.source.line}, ${f.source.method}]`);
    if (d.facts.length > 12) lines.push('Additional source candidates retained; narrow the document before preparing a claim.');
  }
  lines.push('\nNeeds review:', ...review.issues, ...review.questions);
  const text = lines.join('\n');
  return text.length <= 5500 ? text : `${text.slice(0, 5300)}\n[Review too long for one message. Remove extra documents and review again; nothing approved.]`;
}

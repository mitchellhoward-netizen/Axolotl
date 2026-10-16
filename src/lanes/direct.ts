/**
 * Lane A, direct (docs/PATHWAYS.md §2.1): post the mapped values over HTTP, no browser, and
 * read the response. Built for the LINQ Connect Income Form replica
 * (src/replicas/linq-income-form.ts): session cookie and form token, "Add Student" round trips,
 * validation errors, the review page, the parent's certification by their own link, and the
 * reference code.
 *
 * Honesty rules: 'done' only with a reference code read off the institution's page; readBack is
 * what the review page showed, not what we sent; attestation fields are never posted by us.
 */
import type { AttestHow, FieldValue, FormFill, FormMap, Lang, LaneResult, LaneRunner, Text } from '../pathways/types.js';

export interface DirectLaneOptions {
  /** The form's base URL (the replica's `url`). */
  url: string;
  /** The parent's attestation link for a pending token. Default: `${url}/attest?token=…`. */
  parentUrl?: (token: string) => string;
  /**
   * Called with the parent's link before `ctx.attest` is awaited: the caller delivers it to the
   * parent (a text, in production; the simulated parent, in tests). The lane never opens it.
   */
  onParentLink?: (link: string, fields: string[]) => void | Promise<void>;
  fetch?: typeof fetch;
  /** How many times to read the status page after the parent attests. Default 5. */
  statusReads?: number;
  /** Wait between status reads, ms. Default 100. */
  statusWaitMs?: number;
}

/** The reference sentence, as the replica (and LINQ) prints it, in either language. */
const REFERENCE = /(?:Your reference code is|Su código de referencia es):\s*(?:<[^>]+>\s*)*([A-Z0-9]{6})\b/;

const decode = (s: string) =>
  s.replace(/&(amp|lt|gt|quot|#39);/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e]!);

const attr = (html: string, re: RegExp): string | undefined => {
  const m = re.exec(html);
  return m?.[1] !== undefined ? decode(m[1]) : undefined;
};

class Session {
  private cookies = new Map<string, string>();
  constructor(private readonly base: string, private readonly f: typeof fetch) {}

  async request(path: string, body?: URLSearchParams): Promise<{ status: number; html: string }> {
    const res = await this.f(new URL(path, this.base), {
      method: body ? 'POST' : 'GET',
      headers: {
        ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
        ...(this.cookies.size ? { cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
      },
      body: body?.toString(),
      redirect: 'follow',
    });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(';');
      const i = pair!.indexOf('=');
      if (i > 0) this.cookies.set(pair!.slice(0, i).trim(), pair!.slice(i + 1).trim());
    }
    return { status: res.status, html: await res.text() };
  }
}

const summary = (en: string, es: string): Text => ({ en, es });

function errorsOf(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of html.matchAll(/data-error-for="([^"]+)">([^<]*)</g)) out[decode(m[1]!)] = decode(m[2]!);
  return out;
}

function readBackOf(html: string): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  for (const m of html.matchAll(/<dd data-field="([^"]+)" data-value="([^"]*)"/g)) out[decode(m[1]!)] = decode(m[2]!);
  return out;
}

const studentRowsNeeded = (values: Record<string, FieldValue>) =>
  Math.max(1, ...Object.keys(values).map((k) => /^student\.(\d+)\./.exec(k)).filter(Boolean).map((m) => Number(m![1]) + 1));

export function directLane(opts: DirectLaneOptions): LaneRunner {
  const f = opts.fetch ?? fetch;
  const base = opts.url.replace(/\/$/, '');
  const parentUrl = opts.parentUrl ?? ((token: string) => `${base}/attest?token=${encodeURIComponent(token)}`);
  const reads = opts.statusReads ?? 5;
  const wait = opts.statusWaitMs ?? 100;

  async function attempt(form: FormMap, fill: FormFill, ctx: { lang: Lang; attest: (fields: string[], how?: AttestHow) => Promise<void> }): Promise<LaneResult | 'session_expired'> {
    const http = new Session(`${base}/`, f);
    const first = await http.request(`/?lang=${ctx.lang}`);
    if (first.status !== 200) return { status: 'failed', readBack: {}, parentSummary: summary("The form didn't open.", 'El formulario no se abrió.'), detail: `GET / → ${first.status}` };
    let page = first.html;
    const token = () => attr(page, /name="_csrf" value="([^"]*)"/);
    if (!token()) return { status: 'failed', readBack: {}, parentSummary: summary("The form didn't load right.", 'El formulario no cargó bien.'), detail: 'no form token on the page' };

    // "Add Student" until the page has a row for every student we fill.
    const need = studentRowsNeeded(fill.values);
    let rows = Number(attr(page, /data-student-count="(\d+)"/) ?? 1);
    while (rows < need) {
      const r = await http.request('/form', new URLSearchParams({ _csrf: token()!, lang: ctx.lang, action: 'add_student' }));
      if (r.status === 403) return 'session_expired';
      page = r.html;
      const now = Number(attr(page, /data-student-count="(\d+)"/) ?? rows);
      if (now <= rows) return { status: 'failed', readBack: {}, parentSummary: summary("The form wouldn't take every child.", 'El formulario no aceptó a todos los niños.'), detail: `Add Student stuck at ${rows} of ${need}` };
      rows = now;
    }

    const body = new URLSearchParams({ _csrf: token()!, lang: ctx.lang, action: 'next' });
    for (const [k, v] of Object.entries(fill.values)) body.set(k, typeof v === 'boolean' ? (v ? 'on' : '') : v);
    let r = await http.request('/form', body);
    if (r.status === 403) return 'session_expired';
    page = r.html;
    const errs = errorsOf(page);
    if (Object.keys(errs).length) {
      return {
        status: 'failed',
        readBack: {},
        parentSummary: summary('The form turned back some answers, so nothing was sent. I need to fix them first.', 'El formulario rechazó algunas respuestas, así que no se envió nada. Primero tengo que corregirlas.'),
        detail: `validation: ${Object.entries(errs).map(([k, m]) => `${k}: ${m}`).join('; ')}`,
      };
    }

    let readBack: Record<string, FieldValue> = {};
    if (/id="review"/.test(page)) {
      readBack = readBackOf(page);
      const wrong = Object.keys(fill.values).filter((k) => readBack[k] !== fill.values[k]);
      const extra = Object.keys(readBack).filter((k) => !(k in fill.values));
      if (wrong.length || extra.length) {
        return {
          status: 'failed',
          readBack,
          parentSummary: summary("The form showed something different from what you approved, so I didn't submit it.", 'El formulario mostró algo distinto de lo que usted aprobó, así que no lo envié.'),
          detail: `review mismatch: ${[...wrong, ...extra.map((k) => `+${k}`)].join(', ')}`,
        };
      }
      r = await http.request('/confirm', new URLSearchParams({ _csrf: token()!, lang: ctx.lang }));
      if (r.status === 403) return 'session_expired';
      page = r.html;
    }

    const pendingToken = /data-status="pending_attestation"/.test(page) ? attr(page, /data-token="([^"]+)"/) : undefined;
    if (pendingToken) {
      const link = parentUrl(pendingToken);
      try {
        await opts.onParentLink?.(link, fill.attestations);
        await ctx.attest(fill.attestations, { link });
      } catch (e) {
        return {
          status: 'handoff',
          readBack,
          parentSummary: summary(
            "Everything is filled in. The last step is yours: open your link and check the box that says the information is true. Until then it isn't submitted.",
            'Todo está lleno. El último paso es suyo: abra su enlace y marque la casilla que dice que la información es verdadera. Hasta entonces no está enviado.',
          ),
          detail: `attestation not completed: ${(e as Error).message}; parent link ${link}`,
        };
      }
      for (let i = 0; i < reads; i++) {
        const s = await http.request(`/status?token=${encodeURIComponent(pendingToken)}&lang=${ctx.lang}`);
        page = s.html;
        if (!/data-status="pending_attestation"/.test(page)) break;
        if (i < reads - 1) await new Promise((res) => setTimeout(res, wait));
      }
    }

    const ref = REFERENCE.exec(page)?.[1];
    if (ref) {
      return {
        status: 'done',
        reference: ref,
        readBack,
        parentSummary: summary(`Done. Palm Springs USD received your Income Form. Your reference code is ${ref}.`, `Listo. El distrito de Palm Springs recibió su formulario de ingresos. Su código de referencia es ${ref}.`),
        detail: `reference ${ref}`,
      };
    }
    const stillPending = /data-status="pending_attestation"/.test(page);
    return {
      status: 'sent_unconfirmed',
      readBack,
      parentSummary: stillPending
        ? summary("The form is waiting for your check mark, and I haven't seen it go through yet.", 'El formulario espera su marca y todavía no he visto que se haya enviado.')
        : summary("I sent the form, but the district's page didn't show a reference code, so I can't say it's done. I'll check again.", 'Envié el formulario, pero la página del distrito no mostró un código de referencia, así que no puedo decir que está listo. Lo revisaré otra vez.'),
      detail: stillPending ? 'still pending attestation after status reads' : 'no reference code on the final page',
    };
  }

  return {
    kind: 'direct',
    async run(form, fill, ctx) {
      if (fill.missing.length) {
        return { status: 'failed', readBack: {}, parentSummary: summary('I still need a few answers before I can fill this out.', 'Todavía necesito algunas respuestas para llenarlo.'), detail: `missing: ${fill.missing.join(', ')}` };
      }
      const posted = fill.attestations.filter((a) => a in fill.values);
      if (posted.length) {
        return { status: 'failed', readBack: {}, parentSummary: summary("Some boxes are yours to check, so I didn't send it.", 'Algunas casillas le toca marcarlas a usted, así que no lo envié.'), detail: `attestation in values: ${posted.join(', ')}` };
      }
      let out = await attempt(form, fill, ctx);
      // A stale session gets one fresh start; a second one is a failure, not a loop.
      if (out === 'session_expired') out = await attempt(form, fill, ctx);
      if (out === 'session_expired') {
        return { status: 'failed', readBack: {}, parentSummary: summary("The form kept timing out, so nothing was sent.", 'El formulario se venció varias veces, así que no se envió nada.'), detail: 'session expired twice' };
      }
      return out;
    },
  };
}

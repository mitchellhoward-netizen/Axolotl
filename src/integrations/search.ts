import 'dotenv/config';

/**
 * Tavily search provider (Product integration via the REST API — Path B/E).
 * Replaces the r.jina.ai per-search + per-fetch round-trips with a single Tavily
 * search that returns page content inline. Falls back to the jina reader when
 * TAVILY_API_KEY is unset (or on failure), so nothing breaks without a key.
 *
 * IMPORTANT: TAVILY_API_KEY / queries must never contain PII. Queries are
 * district/topic strings only — never a child name, address, or housing status.
 */

export interface SearchHit {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export interface SearchResult {
  answer?: string;
  hits: SearchHit[];
}

interface JinaHit {
  title: string;
  url: string;
  content: string;
}

/** Module-level cache: Tavily returns page content inline, so when the research
 * loop later asks to "fetch" a hit, we serve the cached content instead of a 2nd
 * network round-trip. */
const contentByUrl = new Map<string, string>();

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

export function searchEnabled(): boolean {
  return Boolean(process.env.TAVILY_API_KEY);
}

function searchDepth(): 'basic' | 'advanced' {
  return process.env.TAVILY_DEPTH === 'advanced' ? 'advanced' : 'basic';
}

/** Tavily search. Returns the answer (optional) + hits with inline content. On any
 * failure or no-key, falls back to the jina reader so search always works. */
export async function search(query: string, opts?: { maxResults?: number; depth?: 'basic' | 'advanced'; includeAnswer?: boolean }): Promise<SearchResult> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return jinaSearch(query, opts?.maxResults ?? 5);
  try {
    const res = await withTimeout(
      fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: key,
          query,
          search_depth: opts?.depth ?? searchDepth(),
          max_results: opts?.maxResults ?? 5,
          include_raw_content: true,
          include_answer: opts?.includeAnswer ?? false,
        }),
      }),
      9000,
      null,
    );
    if (!res || !res.ok) return jinaSearch(query, opts?.maxResults ?? 5);
    const data = (await res.json()) as { answer?: string; results?: Array<{ title?: string; url?: string; content?: string; raw_content?: string; score?: number }> };
    const hits: SearchHit[] = [];
    for (const r of data.results ?? []) {
      const url = r.url ?? '';
      const content = (r.content ?? r.raw_content ?? '').slice(0, 6000);
      if (content) contentByUrl.set(url, content);
      if (url) hits.push({ title: r.title ?? url, url, content, score: r.score });
    }
    return { answer: data.answer, hits };
  } catch {
    return jinaSearch(query, opts?.maxResults ?? 5);
  }
}

/** Serve previously-fetched Tavily content for a URL, if any (else an empty string). */
export function cachedContent(url: string): string | undefined {
  return contentByUrl.get(url);
}

/** jina reader fetch — the fallback for a page we don't already have content for. */
export async function fetchUrl(url: string): Promise<string> {
  const cached = contentByUrl.get(url);
  if (cached) return cached;
  try {
    const res = await withTimeout(fetch(`https://r.jina.ai/${encodeURIComponent(url)}`), 9000, null);
    return res?.ok ? await res.text() : '';
  } catch {
    return '';
  }
}

/** jina-based search fallback (no Tavily key / on failure): DDG HTML via jina → urls → fetch each. */
async function jinaSearch(query: string, maxResults: number): Promise<SearchResult> {
  try {
    const res = await withTimeout(fetch(`https://r.jina.ai/https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`), 9000, null);
    const md = res?.ok ? await res.text() : '';
    const urls = extractUrlsMd(md, maxResults);
    const hits: JinaHit[] = [];
    for (const url of urls) {
      const content = await fetchUrl(url);
      if (content) hits.push({ title: url, url, content: content.slice(0, 4000) });
    }
    return { hits };
  } catch {
    return { hits: [] };
  }
}

/** Minimal URL extraction from DDG/jina markdown (mirrors research.ts extractUrls). */
function extractUrlsMd(markdown: string, limit: number): string[] {
  const urls: string[] = [];
  const uddgRe = /https:\/\/duckduckgo\.com\/l\/\?uddg=([^&\s)]+)/g;
  let m: RegExpExecArray | null;
  while ((m = uddgRe.exec(markdown)) && urls.length < limit) {
    const u = m[1];
    if (u) {
      try { urls.push(decodeURIComponent(u)); } catch { /* skip */ }
    }
  }
  const bareRe = /https:\/\/(?!html\.duckduckgo\.com|r\.jina\.ai|duckduckgo\.com)[^\s)\]]+/g;
  while ((m = bareRe.exec(markdown)) && urls.length < limit * 2) {
    const u = m[0];
    if (u && !urls.includes(u)) urls.push(u);
  }
  return urls.filter((u, i, a) => a.indexOf(u) === i).slice(0, limit);
}

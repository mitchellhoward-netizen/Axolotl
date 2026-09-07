import { SearchSession, DEFAULT_BUDGET, extractSearchTerms, normalizeQuery, type SearchBudget } from './trajectory.js';
import { KNOWLEDGE_CATEGORIES, type KnowledgeCategory } from '../domain/knowledge.js';
import { extractPdf, isPdfUrl } from '../integrations/browser.js';
import type { LlmClient } from '../agent/llm.js';

/** A grounded knowledge candidate produced from real web research. */
export interface CandidateNode {
  category: string;
  title: string;
  summary: string;
  url: string;
}

/** Category → search hint, for gap-aware query formulation. */
const CATEGORY_QUERY_HINTS: Record<KnowledgeCategory, string> = {
  TRANSPORTATION: 'transportation bus service eligibility',
  MEALS: 'free reduced meals application',
  BASIC_NEEDS: 'enrollment homeless McKinney-Vento',
  ATTENDANCE: 'attendance policy absence',
  LEARNING: 'language support English learner',
  BEHAVIOR: 'bullying safety plan',
  SPECIAL_ED: 'special education IEP evaluation',
  ACCOMMODATIONS: '504 plan accommodations',
  ACTIVITIES: 'free before after school program enrichment fee waiver sign up',
  GENERAL_NAVIGATION: 'office contact',
};

function envBudget(): SearchBudget {
  const n = (v: string | undefined, d: number) => (v ? Number(v) : d);
  return {
    maxSearches: n(process.env.RESEARCH_MAX_SEARCHES, DEFAULT_BUDGET.maxSearches),
    maxFetches: n(process.env.RESEARCH_MAX_FETCHES, DEFAULT_BUDGET.maxFetches),
    maxSteps: n(process.env.RESEARCH_MAX_STEPS, DEFAULT_BUDGET.maxSteps),
    maxNoProgress: n(process.env.RESEARCH_MAX_NO_PROGRESS, DEFAULT_BUDGET.maxNoProgress),
  };
}

/** DuckDuckGo HTML via the jina.ai reader → markdown containing result links. */
async function searchWeb(query: string): Promise<string> {
  try {
    const res = await fetch(`https://r.jina.ai/https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
    return res.ok ? await res.text() : '';
  } catch {
    return '';
  }
}

/** Fetch a page as text via the jina.ai reader. (Static text; the browser layer is Phase 2.) */
async function fetchWeb(url: string): Promise<string> {
  try {
    const res = await fetch(`https://r.jina.ai/${encodeURIComponent(url)}`);
    return res.ok ? await res.text() : '';
  } catch {
    return '';
  }
}

/** Extract candidate result URLs (multiple) from DuckDuckGo markdown. */
export function extractUrls(markdown: string, limit = 5): string[] {
  const urls: string[] = [];
  const uddgRe = /https:\/\/duckduckgo\.com\/l\/\?uddg=([^&\s)]+)/g;
  let m: RegExpExecArray | null;
  while ((m = uddgRe.exec(markdown)) && urls.length < limit) {
    const u = m[1];
    if (u) {
      try {
        urls.push(decodeURIComponent(u));
      } catch {
        /* skip malformed */
      }
    }
  }
  const bareRe = /https:\/\/(?!html\.duckduckgo\.com|r\.jina\.ai|duckduckgo\.com)[^\s)\]]+/g;
  while ((m = bareRe.exec(markdown)) && urls.length < limit * 2) {
    const u = m[0];
    if (u && !urls.includes(u)) urls.push(u);
  }
  return urls.filter((u, i, a) => a.indexOf(u) === i).slice(0, limit);
}

function inferDomain(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

function normalizeCategory(category: string): KnowledgeCategory | undefined {
  const cat = category.trim().toUpperCase().replace(/[\s-]+/g, '_');
  return (KNOWLEDGE_CATEGORIES as string[]).includes(cat) ? (cat as KnowledgeCategory) : undefined;
}

/** Map a parent's free-text goal to a canonical category (best-effort). */
export function inferCategory(goal: string): KnowledgeCategory | undefined {
  const g = goal.toLowerCase();
  if (/transport|bus|ride|pickup|dropoff|route/.test(g)) return 'TRANSPORTATION';
  if (/meal|lunch|breakfast|food|hungr|free.?reduced/.test(g)) return 'MEALS';
  if (/homeless|shelter|motel|housing|enroll|address|residency|records|school of origin/.test(g)) return 'BASIC_NEEDS';
  if (/attend|absent|sick|truant|illness/.test(g)) return 'ATTENDANCE';
  if (/language|english learner|translate|interpret|bilingual|spanish/.test(g)) return 'LEARNING';
  if (/bull|harass|safety plan|threat/.test(g)) return 'BEHAVIOR';
  if (/504|accommodation|disability|adhd|autism/.test(g)) return 'ACCOMMODATIONS';
  if (/iep|special education|evaluation|assessment|speech|occupational/.test(g)) return 'SPECIAL_ED';
  if (/after ?school|before ?school|afterschool|enrich|club|sport|tutor|extra?curricular|youth program|(programs? for)|summer (school|program|camp)|day ?care|child ?care/.test(g)) return 'ACTIVITIES';
  return undefined;
}

function seedQueries(districtName: string, schoolName: string, goal?: string): string[] {
  const base = `${districtName} ${schoolName}`;
  if (goal) return [`${base} ${goal}`, `${districtName} ${goal}`];
  return [`${base}`, `${districtName} transportation meals enrollment special education`];
}

/** Form the next queries from uncovered gaps + learned terms (+ LLM suggestion). */
async function formulateQueries(
  session: SearchSession,
  districtName: string,
  schoolName: string,
  llm: LlmClient | undefined,
  covered: Set<KnowledgeCategory>,
  target: KnowledgeCategory[],
): Promise<string[]> {
  const queries: string[] = [];

  if (llm?.enabled) {
    const suggested = await llm.suggestNextQuery({
      question: session.originalQuestion,
      district: districtName,
      school: schoolName,
      priorQueries: [...session.issuedQueries],
      learnedTerms: [...session.learnedTerms],
      gaps: target.filter((c) => !covered.has(c)).map((c) => CATEGORY_QUERY_HINTS[c] ?? c),
    });
    if (suggested) queries.push(suggested);
  }

  for (const cat of target) {
    if (covered.has(cat)) continue;
    queries.push(`${districtName} ${schoolName} ${CATEGORY_QUERY_HINTS[cat]}`);
  }

  for (const term of [...session.learnedTerms].slice(-4).reverse()) {
    if (/^\d/.test(term)) queries.push(`"${term}" ${districtName}`);
    else if (!queries.some((q) => q.includes(term))) queries.push(`${districtName} ${term}`);
  }

  return queries;
}

/**
 * Focused research for a SINGLE question (vs. the broad district crawl above):
 * one/two searches + fetch the top pages, and return the raw page text for the
 * LLM to synthesize a direct answer. Used by the voice→text handoff so a
 * deferred question is answered quickly, not via the whole knowledge-graph crawl.
 */
export async function researchQuestion(
  question: string,
  districtName?: string,
  schoolName?: string,
  maxPages = 2,
): Promise<string> {
  const query = [question, districtName, schoolName].filter(Boolean).join(' ');
  const md = await searchWeb(query);
  const urls = extractUrls(md, maxPages + 2);
  const pages: string[] = [];
  for (const url of urls) {
    if (pages.length >= maxPages) break;
    try {
      let page: string;
      if (isPdfUrl(url)) {
        const pr = await extractPdf(url);
        page = pr.ok ? pr.data.text : '';
      } else {
        page = await fetchWeb(url);
      }
      if (page) pages.push(page.slice(0, 8000));
    } catch {
      /* skip a bad page */
    }
  }
  return pages.join('\n\n');
}

/**
 * The deep-research loop for a school/district. Iteratively searches, fetches
 * unseen pages, extracts learned terminology, and categorizes grounded knowledge
 * nodes — trajectory-aware (prior queries + useful docs + learned terms), bounded
 * (budget + stuck detection), and self-recovering (exact-phrase / domain search).
 *
 * Returns [] when the LLM isn't enabled or research fails; callers then fall back
 * to the generic grounded-law drafts, so the graph still gets a typed skeleton.
 */
export async function researchDistrictNodes(
  districtName: string,
  schoolName: string,
  llm: LlmClient | undefined,
  goal?: string,
): Promise<CandidateNode[]> {
  if (!llm?.enabled) return [];

  const goalCategory = goal ? inferCategory(goal) : undefined;
  const target: KnowledgeCategory[] = goalCategory ? [goalCategory] : [...KNOWLEDGE_CATEGORIES];
  const session = new SearchSession(
    `${districtName} ${schoolName}${goal ? ` — ${goal}` : ''}`,
    envBudget(),
  );

  const nodes: CandidateNode[] = [];
  const covered = new Set<KnowledgeCategory>();
  let queries = seedQueries(districtName, schoolName, goal);
  let domain: string | undefined;

  while (true) {
    // Find the next issuable (non-duplicate) query.
    let query: string | undefined;
    while (queries.length) {
      if (!session.canSearch()) break;
      const next = queries.shift();
      if (!next) continue;
      if (session.issueQuery(next) !== null) {
        query = next;
        break;
      }
    }

    if (!query) {
      const stop = session.evaluateStop(target.length - covered.size);
      if (stop.stop) {
        session.stop(stop.reason ?? 'exhausted');
        break;
      }
      const formed = await formulateQueries(session, districtName, schoolName, llm, covered, target);
      if (formed.some((q) => !session.issuedQueries.has(normalizeQuery(q)))) {
        queries = formed;
        continue;
      }
      session.stop('no-new-queries');
      break;
    }

    const searchMd = await searchWeb(query);
    const urls = extractUrls(searchMd).filter((u) => !session.hasSeen(u));
    if (domain === undefined) domain = inferDomain(urls[0]);

    let newSources = urls.length;
    let usefulSources = 0;

    // Recovery: exact-phrase and (if we learned a domain) site-restricted search.
    if (urls.length === 0) {
      for (const r of session.recoveryQueries(query, domain)) {
        if (!session.canSearch()) break;
        if (session.issueQuery(r) === null) continue;
        const rmd = await searchWeb(r);
        const rurls = extractUrls(rmd).filter((u) => !session.hasSeen(u));
        if (rurls.length) {
          urls.push(...rurls);
          newSources += rurls.length;
          break;
        }
      }
    }

    const stepTerms = new Set<string>();
    for (const url of urls) {
      if (!session.canFetch()) break;
      let page: string;
      if (isPdfUrl(url)) {
        const pr = await extractPdf(url);
        page = pr.ok ? pr.data.text : '';
      } else {
        page = await fetchWeb(url);
      }
      if (!page || page.length < 40) {
        session.markFetched({ url, useful: false });
        continue;
      }
      const terms = llm.enabled
        ? (await llm.extractSearchTerms(page)) ?? extractSearchTerms(page)
        : extractSearchTerms(page);
      for (const t of terms) stepTerms.add(t);

      const kn = await llm.generateKnowledgeNodes(districtName, page);
      const useful = Boolean(kn && kn.length > 0);
      if (kn) {
        for (const n of kn) {
          const resolved = { ...n, url: n.url || url };
          nodes.push(resolved);
          const cat = normalizeCategory(resolved.category);
          if (cat) covered.add(cat);
        }
        usefulSources++;
      }
      session.markFetched({ url, useful });
    }

    session.addLearnedTerms(stepTerms);
    session.recordStep({
      kind: 'search',
      subject: query,
      reason: 'gap',
      newSources,
      usefulSources,
      learnedTerms: [...stepTerms],
    });

    const stop = session.evaluateStop(target.length - covered.size);
    if (stop.stop) {
      session.stop(stop.reason ?? 'done');
      break;
    }

    queries = await formulateQueries(session, districtName, schoolName, llm, covered, target);
  }

  if (process.env.RESEARCH_LOG_TRAJECTORY !== 'false') {
    console.log('[research] trajectory:', JSON.stringify(session.snapshot()));
  }
  return nodes;
}

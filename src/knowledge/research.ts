import { runTool } from '../agent/tools.js';
import type { LlmClient } from '../agent/llm.js';

/** A grounded knowledge candidate produced from real web research. */
export interface CandidateNode {
  category: string;
  title: string;
  summary: string;
  url: string;
}

/** Pull the first real result URL out of the DuckDuckGo search markdown. */
function extractFirstUrl(markdown: string): string | undefined {
  // DDG result links are wrapped as /l/?uddg=<urlencoded>.
  const uddg = markdown.match(/https:\/\/duckduckgo\.com\/l\/\?uddg=([^&)]+)/);
  if (uddg?.[1]) {
    try {
      return decodeURIComponent(uddg[1]);
    } catch {
      /* fall through */
    }
  }
  // Fall back to the first non-wrapper https URL.
  const m = markdown.match(/https:\/\/(?!html\.duckduckgo\.com|r\.jina\.ai|duckduckgo\.com)[^\s)\]]+/);
  return m?.[0];
}

/**
 * The "deep research" step for a school/district: find its site, fetch it, and
 * use the LLM to extract grounded, category-tagged knowledge nodes. Returns []
 * when the LLM isn't enabled or research fails (callers fall back to the generic
 * grounded-law drafts, so the graph still gets a typed skeleton).
 */
export async function researchDistrictNodes(
  districtName: string,
  schoolName: string,
  llm: LlmClient | undefined,
): Promise<CandidateNode[]> {
  if (!llm?.enabled) return [];
  const deps = { getCases: () => [], appendCase: () => {}, proposeSteps: () => {} };
  try {
    const search = await runTool('web_search', { query: `${districtName} ${schoolName}` }, deps as never);
    const url = extractFirstUrl(String(search ?? ''));
    if (!url) return [];
    const page = await runTool('web_fetch', { url }, deps as never);
    if (!page) return [];
    const nodes = await llm.generateKnowledgeNodes(districtName, String(page));
    return (nodes ?? []).map((n) => ({ ...n, url: n.url || url }));
  } catch (e) {
    console.error('[research] failed:', (e as Error)?.message ?? e);
    return [];
  }
}

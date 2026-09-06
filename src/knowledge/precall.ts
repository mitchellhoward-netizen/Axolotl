import 'dotenv/config';
import { KnowledgeGraph } from './graph.js';
import { searchSchoolGraph } from './resource-graph.js';
import { resolveAnyDistrict } from './discovery.js';

/**
 * Pre-call research brief. Fetches everything we already know about a school /
 * district deterministically (knowledge graph + resource graph — no LLM, no web
 * search) so a phone call can START informed instead of researching live. This
 * is the "do a little research before the call" step: resolve the school, pull
 * down the rights/entitlements and the forms/contacts, and hand the voice agent
 * a plain-language cheat sheet.
 *
 * Plain language throughout: statute numbers are deliberately omitted (the voice
 * agent is told never to quote them; the text agent translates them anyway).
 */
export async function buildPreCallBrief(districtName?: string, schoolName?: string): Promise<string> {
  const input = String(districtName ?? schoolName ?? '').trim();
  if (!input) return '';

  const district = resolveAnyDistrict(input);
  const graph = new KnowledgeGraph();
  const nodes = await graph.get(district.id);
  const chain = await searchSchoolGraph(district.id);

  const lines: string[] = [];

  if (district.resolved) {
    lines.push(`School district: ${district.name} (${district.state}).`);
    if (district.liaison) {
      lines.push(
        `District homeless liaison: ${district.liaison.name} — ${district.liaison.role}, ${district.liaison.phone}, ${district.liaison.email}.`,
      );
    }
  }

  // Rights/entitlements in plain words (verified or draft) — no statute codes.
  for (const n of nodes) {
    if (n.status !== 'verified' && n.status !== 'draft') continue;
    lines.push(`- ${n.title}: ${n.summary}`);
  }

  // Forms / eligibility / contacts / deadlines from the resource chain.
  if (chain) {
    if (chain.eligibility.length) lines.push(`Eligibility: ${chain.eligibility.map((n) => n.summary).join('; ')}`);
    if (chain.forms.length) lines.push(`Forms: ${chain.forms.map((n) => n.title).join(', ')}`);
    if (chain.contacts.length) lines.push(`Contacts: ${chain.contacts.map((n) => `${n.title} — ${n.summary}`).join('; ')}`);
    if (chain.deadlines.length) lines.push(`Deadlines: ${chain.deadlines.map((n) => n.title).join(', ')}`);
  }

  return lines.join('\n');
}

import type { FamilyProfile } from '../domain/types.js';
import type { DistrictProfile } from '../knowledge/districts.js';

export interface LlmOptions {
  apiKey?: string;
  baseUrl: string;
  model: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ToolsResult {
  text?: string;
  calls?: ToolCall[];
}

/**
 * OpenAI-compatible "brain" for the agent. Gated on an API key: without one,
 * every method returns `null` and the caller falls back to the seeded/rules path
 * (which is fully offline and testable).
 */
export class LlmClient {
  constructor(private readonly opts: LlmOptions) {}

  get enabled(): boolean {
    return Boolean(this.opts.apiKey);
  }

  /**
   * Function-calling turn. Returns the model's text reply and/or the tool calls
   * it wants to make, for the caller to drive the loop. Null on failure.
   */
  async chatWithTools(
    system: string,
    messages: unknown[],
    tools: unknown[],
    toolChoice: 'auto' | 'required' | 'none' = 'auto',
  ): Promise<ToolsResult | null> {
    if (!this.enabled) return null;
    try {
      const res = await fetch(`${this.opts.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.opts.apiKey}` },
        body: JSON.stringify({
          model: this.opts.model,
          temperature: 0.2,
          messages: [{ role: 'system', content: system }, ...messages],
          tools,
          tool_choice: toolChoice,
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string | null; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }> } }>;
      };
      const msg = data.choices?.[0]?.message;
      if (!msg) return null;
      const text = msg.content ?? undefined;
      const calls = (msg.tool_calls ?? [])
        .map((c) => ({ id: c.id ?? '', name: c.function?.name ?? '', arguments: c.function?.arguments ?? '{}' }))
        .filter((c) => c.name);
      return { text, calls: calls.length ? calls : undefined };
    } catch {
      return null;
    }
  }

  private async complete(system: string, user: string, json = false): Promise<string | null> {
    if (!this.enabled) return null;
    try {
      const res = await fetch(`${this.opts.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.opts.apiKey}` },
        body: JSON.stringify({
          model: this.opts.model,
          temperature: 0,
          ...(json ? { response_format: { type: 'json_object' } } : {}),
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return data.choices?.[0]?.message?.content ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Learn a district: return a structured profile. Returns `null` when the model
   * is unavailable or can't produce a usable result (caller falls back).
   */
  async researchDistrict(name: string): Promise<DistrictProfile | null> {
    const raw = await this.complete(
      'You research a U.S. K-12 school district and return ONLY a JSON object with keys: ' +
        'name, short, elementary, liaison ({name,role,phone,email}), busPasses ({name,phone}), schools, known. ' +
        'Be accurate and honest: if you are unsure about a field, omit it or use an empty string. ' +
        'Never invent phone numbers, names, or addresses.',
      `District or school: ${name}`,
      true,
    );
    if (!raw) return null;
    try {
      const d = JSON.parse(raw) as Partial<DistrictProfile>;
      if (!d.name) return null;
      return {
        name: d.name,
        short: d.short ?? '',
        elementary: d.elementary,
        liaison: d.liaison,
        busPasses: d.busPasses,
        schools: d.schools,
        known: d.known === true,
      };
    } catch {
      return null;
    }
  }

  /**
   * From a fetched district/school web page, extract grounded knowledge nodes
   * (category/title/summary/url) for the canonical 10 categories. Returns null on
   * failure or when the content doesn't support confident facts — callers then
   * fall back to the generic grounded-law drafts.
   */
  async generateKnowledgeNodes(
    districtName: string,
    pageText: string,
  ): Promise<Array<{ category: string; title: string; summary: string; url: string }> | null> {
    const raw = await this.complete(
      'You extract grounded facts about a school district from web content. Return ONLY a JSON object: ' +
        '{"nodes":[{"category":"TRANSPORTATION|MEALS|BASIC_NEEDS|ATTENDANCE|LEARNING|BEHAVIOR|SPECIAL_ED|ACCOMMODATIONS|ACTIVITIES|GENERAL_NAVIGATION","title":string,"summary":string,"url":string}]} . ' +
        'Use exactly one of those 10 category values per node. Only include facts actually supported by the content; if a fact is missing, omit it (do NOT invent policies, phone numbers, names, or laws). ' +
        'summary = one honest, plain-language sentence. url = the source page.',
      `District: ${districtName}\n\nWeb content:\n${pageText.slice(0, 12_000)}`,
      true,
    );
    if (!raw) return null;
    try {
      // The model may wrap JSON in ``` fences or add prose; extract the object.
      const cleaned = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      const json = match ? match[0] : cleaned;
      const parsed = JSON.parse(json) as { nodes?: Array<{ category: string; title: string; summary: string; url: string }> };
      if (!Array.isArray(parsed.nodes)) return null;
      return parsed.nodes;
    } catch {
      return null;
    }
  }

  /** Fluent, grounded answer to an open-ended parent question (or null). */
  async answerQuestion(
    question: string,
    profile?: FamilyProfile,
    district?: DistrictProfile,
  ): Promise<string | null> {
    const ctx = [
      district ? `School/district: ${district.name}` : '',
      district?.liaison
        ? `District homeless liaison: ${district.liaison.name}, ${district.liaison.phone}, ${district.liaison.email}`
        : '',
      profile?.children.length
        ? `Children: ${profile.children.map((c) => `${c.name}${c.grade ? ` (grade ${c.grade})` : ''}`).join(', ')}`
        : '',
      profile?.needs.length ? `Needs: ${profile.needs.join(', ')}` : '',
      profile?.challenges.length ? `Challenges: ${profile.challenges.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    return this.complete(
      'You are a warm, respectful school assistant for parents, answering over iMessage. ' +
        'Keep it short (2-4 sentences), plain language, no jargon. Output PLAIN TEXT for iMessage — NEVER use Markdown ' +
        '(no **bold**, __underscore__, # headings, or -/* bullets). Ground your answer in the facts given ' +
        'and in well-known federal/state education law (McKinney-Vento, IDEA, Section 504, NSLP, Title III). ' +
        "If you don't know something, say so and point them to the school office. " +
        'Never invent phone numbers, names, or policies, and never claim you submitted or performed an action.',
      `Context:\n${ctx || '(none)'}\n\nParent question: ${question}`,
    );
  }

  /**
   * From the live conversation (history + latest hint), extract exactly what the
   * parent wants DONE over the phone: a concrete issue, the goal of the call, and
   * what we already know. This is the voice agent's brief.
   */
  async buildCallBrief(
    profile: FamilyProfile | undefined,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    hint: string,
  ): Promise<{ issue: string; goal: string; what_we_know: string } | null> {
    const kids = profile?.children?.map((c) => `${c.name} (grade ${c.grade})`).join(', ') ?? 'unknown';
    const context = [
      `Family: ${profile?.parentName ?? 'parent'} — kids: ${kids}`,
      profile?.school ? `School: ${profile.school}${profile.district ? ` (${profile.district})` : ''}` : '',
      profile?.needs?.length ? `Needs: ${profile.needs.join(', ')}` : '',
      profile?.challenges?.length ? `Challenges: ${profile.challenges.join(', ')}` : '',
      profile?.notes ? `Notes: ${profile.notes}` : '',
    ].filter(Boolean).join('\n');

    const thread = history
      .map((m) => `${m.role === 'user' ? 'PARENT' : 'AGENT'}: ${m.content}`)
      .join('\n');

    const raw = await this.complete(
      'You prepare a brief for a phone call the agent is about to make to a school on a parent\u2019s behalf. ' +
        'Read the conversation and return ONLY a JSON object with keys: issue, goal, what_we_know. ' +
        'issue = the specific problem the parent wants addressed over the phone (one concrete sentence). ' +
        'goal = what the call should accomplish (one concrete sentence). ' +
        'what_we_know = everything relevant we already know, so the caller does not re-ask. ' +
        'Be faithful to the conversation — capture the parent\u2019s actual request, not a generic topic. ' +
        'Only include facts actually present in the conversation or family context. NEVER invent numbers, names, dates, or details.',
      `Family context:\n${context}\n\nConversation:\n${thread || '(just started)'}\n\nLatest parent message: ${hint}`,
      true,
    );
    if (!raw) return null;
    try {
      const b = JSON.parse(raw) as { issue?: string; goal?: string; what_we_know?: string };
      if (!b.issue || !b.goal) return null;
      return { issue: b.issue, goal: b.goal, what_we_know: b.what_we_know ?? '' };
    } catch {
      return null;
    }
  }
}

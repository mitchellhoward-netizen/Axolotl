import type { FamilyProfile } from '../domain/types.js';
import type { DistrictProfile } from '../knowledge/districts.js';

export interface LlmOptions {
  apiKey?: string;
  baseUrl: string;
  model: string;
  /** Cap total tokens per call (bounds reasoning time for latency-sensitive paths like voice). */
  maxTokens?: number;
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

  /** Anthropic's OpenAI-compat endpoint rejects `response_format:{type:'json_object'}`
   * (it wants `json_schema`); detect it so we omit that field and rely on the prompt. */
  private get isAnthropic(): boolean {
    return /anthropic/i.test(this.opts.baseUrl) || /^claude/i.test(this.opts.model);
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
    onToken?: (token: string) => void,
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
          ...(tools.length ? { tools, tool_choice: toolChoice } : {}),
          ...(onToken ? { stream: true } : {}),
          // Anthropic requires a token cap; default to 1024 (reply turns are short).
          max_tokens: this.opts.maxTokens ?? 1024,
        }),
      });
      if (!res.ok) {
        console.warn(`[llm] ${this.opts.model} non-OK ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
        return null;
      }

      // Non-streaming path (unchanged).
      if (!onToken || !res.body) {
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
      }

      // Streaming path: emit content deltas, accumulate tool_calls by index.
      let text = '';
      const toolAcc = new Map<number, { id: string; name: string; args: string }>();
      const decoder = new TextDecoder();
      let buffer = '';
      const stream = res.body as unknown as AsyncIterable<Uint8Array>;
      for await (const chunk of stream) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          const payload = t.slice(5).trim();
          if (payload === '[DONE]') continue;
          let json: { choices?: Array<{ delta?: { content?: string | null; tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> } }> };
          try {
            json = JSON.parse(payload);
          } catch {
            continue;
          }
          const delta = json.choices?.[0]?.delta;
          if (!delta) continue;
          if (delta.content) {
            text += delta.content;
            onToken(delta.content);
          }
          for (const tc of delta.tool_calls ?? []) {
            const idx = tc.index ?? 0;
            const acc = toolAcc.get(idx) ?? { id: '', name: '', args: '' };
            if (tc.id) acc.id = tc.id;
            if (tc.function?.name) acc.name = tc.function.name;
            if (tc.function?.arguments) acc.args += tc.function.arguments;
            toolAcc.set(idx, acc);
          }
        }
      }
      const calls = [...toolAcc.values()]
        .filter((a) => a.name)
        .map((a) => ({ id: a.id, name: a.name, arguments: a.args || '{}' }));
      return { text: text || undefined, calls: calls.length ? calls : undefined };
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
          // Anthropic rejects response_format json_object (wants json_schema); the
          // prompts already instruct "return ONLY a JSON object", so omit it there.
          ...(json && !this.isAnthropic ? { response_format: { type: 'json_object' } } : {}),
          // Anthropic requires a token cap; offline JSON reasoning needs room -> 2048.
          max_tokens: this.opts.maxTokens ?? 2048,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
      if (!res.ok) {
        console.warn(`[llm] ${this.opts.model} non-OK ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
        return null;
      }
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
      'You research a U.S. K-12 school or district and return ONLY a JSON object with keys: ' +
        'name, short, elementary, liaison ({name,role,phone,email}), busPasses ({name,phone}), schools, type, known. ' +
        '`type` is one of "public", "private", "charter", or "unknown" — it matters a lot, because ' +
        'public-school programs (McKinney-Vento, free/reduced meals) do NOT apply to private schools. ' +
        'Be accurate and honest: if you are unsure about a field, omit it or use an empty string. ' +
        'Never invent phone numbers, names, or addresses.',
      `District or school: ${name}`,
      true,
    );
    if (!raw) return null;
    try {
      const d = JSON.parse(raw) as Partial<DistrictProfile> & { type?: string };
      if (!d.name) return null;
      const type = ['public', 'private', 'charter', 'unknown'].includes(String(d.type ?? ''))
        ? (String(d.type) as DistrictProfile['type'])
        : undefined;
      return {
        id: '', // filled by researchDistrictProfile with the stable derived id
        name: d.name,
        short: d.short ?? '',
        city: d.city,
        state: d.state,
        elementary: d.elementary,
        liaison: d.liaison,
        busPasses: d.busPasses,
        schools: d.schools,
        known: d.known === true,
        type: type ?? 'unknown',
      };
    } catch {
      return null;
    }
  }

  /**
   * Generate candidate hypotheses (the "solution space" H) for a fuzzy parent message — the
   * solution-generation side of the intelligence layer (TAD's load-shifting insight). Returns a
   * raw array of `{ claim, direction, program?, assumptions?, belief }`, or null on failure. The
   * caller maps these onto the `Intention` Hypothesis shape.
   */
  async generateIntentHypotheses(
    message: string,
    profileSummary: string,
  ): Promise<Array<{ claim: string; direction: string; program?: string; assumptions?: Record<string, string>; belief: number }> | null> {
    const raw = await this.complete(
      'You are an education-bureaucracy agent. A parent texted you. Enumerate the PLAUSIBLE answers ' +
        '(the "space of viable solutions") for what the family needs to do next. Return ONLY a JSON ' +
        'array of 2–4 objects, each with: ' +
        '"claim" (a short, concrete answer, e.g. "Request a speech/language IEP evaluation"), ' +
        '"direction" (one line describing that path), ' +
        '"program" (the program or form family it belongs to, if any), ' +
        '"assumptions" (an object of decision-flip dimension -> assumed value the claim relies on, e.g. ' +
        '{"iep504":"has-iep"}, {"incomeEligibility":"snap"}), and ' +
        '"belief" (a 0..1 prior you think this is the right answer; make them roughly sum to 1). ' +
        'The dimensions can be any of: residency, grade, school, schoolType, incomeEligibility, ' +
        'language, iep504, docsOnHand, existingEnrollment. Be honest: if the message is genuinely ' +
        'ambiguous, list the competing paths; if not, return fewer. Never invent a specific form URL, ' +
        'deadline, or phone number.',
      `Parent message: "${message}"\n\nKnown about the family: ${profileSummary || 'not much yet'}`,
      true,
    );
    if (!raw) return null;
    try {
      const arr = JSON.parse(raw) as Array<{ claim?: string; direction?: string; program?: string; assumptions?: Record<string, string>; belief?: number }>;
      if (!Array.isArray(arr) || arr.length < 2) return null;
      return arr
        .filter((a) => typeof a.claim === 'string' && a.claim.length > 0)
        .map((a) => ({ claim: a.claim!, direction: a.direction ?? a.claim!, program: a.program, assumptions: a.assumptions, belief: typeof a.belief === 'number' ? a.belief : 0.5 }));
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

  /**
   * Suggest the next web-search query from the research trajectory so far.
   * Returns null on failure (caller falls back to deterministic formulation).
   */
  async suggestNextQuery(input: {
    question: string;
    district: string;
    school: string;
    priorQueries: string[];
    learnedTerms: string[];
    gaps: string[];
  }): Promise<string | null> {
    const raw = await this.complete(
      'You are choosing the next web-search query for a school-bureaucracy research loop. ' +
        'Return ONLY a JSON object {"query": string}. The query must advance research toward the ' +
        'uncovered gaps, use any learned terminology, and never repeat a prior query. ' +
        'Do not invent facts — a query, not an answer.',
      JSON.stringify(input),
      true,
    );
    if (!raw) return null;
    try {
      const cleaned = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned) as { query?: string };
      return parsed.query?.trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * Extract search-relevant terminology from a fetched school/district page
   * (policy/regulation numbers, program + form names, office names). Null on
   * failure (caller falls back to deterministic `extractSearchTerms`).
   */
  async extractSearchTerms(pageText: string): Promise<string[] | null> {
    const raw = await this.complete(
      'Extract the search-relevant terminology from this school/district web page: policy or ' +
        'regulation numbers, program names, form names, office names, and proper nouns useful for ' +
        'further searching. Return ONLY a JSON object {"terms": [string, ...]} with at most 12 terms. ' +
        'Do not invent terms.',
      pageText.slice(0, 12_000),
      true,
    );
    if (!raw) return null;
    try {
      const cleaned = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : cleaned) as { terms?: string[] };
      return Array.isArray(parsed.terms) ? parsed.terms.map(String).slice(0, 12) : null;
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
      'You are Axolotl, a warm, proactive school assistant for parents over iMessage. Be genuinely helpful. ' +
        'Keep it short (2-4 sentences), plain language, no jargon. Output PLAIN TEXT — NEVER use Markdown ' +
        '(no **bold**, __underscore__, # headings, or -/* bullets). Ground your answer in the facts given ' +
        'and in well-known federal/state education law (McKinney-Vento, IDEA, Section 504, NSLP, Title III). ' +
        "If the parent's message is unclear or incomplete, ASK a gentle, specific clarifying question to understand their situation " +
        "(e.g. \"I want to get this right — what's going on with your child?\"). " +
        "NEVER say you're not sure you can help, never list your capabilities as a canned response, and never just tell them to contact the school office — you are there to help them through it. " +
        'If you truly cannot answer, say so briefly and offer the most helpful next step. Never invent phone numbers, names, or policies.',
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

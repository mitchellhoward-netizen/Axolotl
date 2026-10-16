import { cliLlmClient } from './cli-llm.js';
import { hash, membersOf, rng, type HarnessFamily, type HarnessLang, type PersonaId } from './families.js';
import type { ParentOptions, ParentReply, ParentStats, SimulatedParent } from './parent.js';

/**
 * The LLM-simulated parent: the held-out test. Nothing in the agent was tuned against it (the
 * scripted parent in parent.ts is keyword matching; this one reads the agent's texts the way a
 * person would). Same `SimulatedParent` interface, so the runner takes either.
 *
 * How it works. The model gets a system prompt that makes it this parent (a texting style from
 * the family's persona and language, a literacy level), plus the household's TRUE facts
 * rendered as plain text from the family's record (names, ages, birth dates, schools, incomes,
 * benefits, contact; never field ids), and the rule to say "I don't know" to anything not in
 * it. Each turn it sees the whole conversation and answers with a small JSON envelope:
 *   {"text": "<the text message>", "action": "reply" | "approve" | "sign" | "give_up" | "done"}
 * The adapter turns `sign` into the harness's attest() callback (the parent's own hands open the
 * link / sign the page) before the text is sent, `approve` into ParentReply.approved, and
 * `give_up` / `done` into the end of the conversation. Only `text` reaches the agent.
 *
 * What it cannot do: inflate the score. The scoreboard grades the submission against the true
 * record, not against what the parent model approved; `approved` here only means the parent
 * gave an explicit yes (so "sent without yes" stays honest), and a wrong value the model
 * carelessly approves still counts as a wrong field.
 *
 * Transport: the `claude` CLI (src/eval/cli-llm.ts), whose child environment drops the
 * account/session variables and uses an empty HOME, so no account detail reaches the model.
 */

export interface LlmParentOptions extends ParentOptions {
  model: string;
  /** Returns the model's reply and its cost, given a system prompt and the conversation.
   * Default: the `claude` CLI. */
  complete?: (system: string, turns: Array<{ role: 'agent' | 'parent'; text: string }>) => Promise<{ text: string; costUsd: number }>;
  /** The parent's first message, made beforehand with `llmParentOpening` (opening() is sync). */
  opening?: string;
}

export type LlmParent = SimulatedParent & { costUsd(): number; style: string };

const STYLES: Record<PersonaId, string> = {
  straightforward: 'Plain and cooperative. You answer what is asked, in a sentence or two.',
  needs_time: 'Busy, texting between other things. Sometimes you say you need to check something (a pay stub, a card) and come back with it in your next message.',
  asks_first: 'Distrustful of forms. Before giving personal details you ask what this is for, who sees it, or whether it is safe; once the answer sounds reasonable you cooperate.',
  two_at_once: 'Chatty. You often put several facts in one message, even ones not asked yet, and add small personal asides.',
  out_of_order: 'Scattered. You sometimes answer a different thing than was asked first, or volunteer a fact out of order, then get back to the question.',
  corrects_later: 'A bit careless. Once in the conversation you may give a number slightly off from memory, then correct yourself in a later message ("wait, actually it is ..."). You always end up giving the true value.',
  side_request: 'Worried about other things. Once or twice you ask an unrelated question (immigration status, a sick kid, whether the school will see your money) alongside your answer.',
  unsure_income: 'Unsure about money. When asked about income you first say something vague ("it changes", "not sure how to say it"), and give the exact figure from your facts when the helper asks in a simpler way or helps you work it out.',
  terse: 'Terse. Very short replies, often one or two words or just a number, no punctuation, no greetings.',
  impatient: 'In a hurry. Short messages, you want this done fast, and you get annoyed if asked the same thing twice ("I already told you").',
};

function langStyle(lang: HarnessLang, r: () => number): { line: string; mix: boolean } {
  if (lang === 'es') {
    return r() < 0.6
      ? { line: 'You write ONLY in Spanish (Mexican, informal), even if the helper writes in English. You read English poorly.', mix: false }
      : { line: 'You write mostly in Spanish but mix in English words the way many California parents do ("el income", "la escuela de mi kid", "ok"). You understand simple English.', mix: true };
  }
  return r() < 0.3
    ? { line: 'You write in English, with an occasional Spanish word, the way many California parents do.', mix: true }
    : { line: 'You write in English.', mix: false };
}

function literacy(r: () => number): string {
  const x = r();
  return x < 0.4
    ? 'Your reading level is low: you skip long explanations, you write with typos and no capital letters, and phone autocorrect sometimes changes a word.'
    : x < 0.7
      ? 'You type on a phone: lowercase, some typos, little punctuation.'
      : 'You type reasonably carefully, but on a phone.';
}

const KIND_LABEL: Record<string, string> = {
  earned: 'wages from a job (before taxes)',
  self_employment: 'self-employment (own business; it changes month to month, this is the usual amount)',
  child_support: 'child support received',
  ssi: 'SSI (disability payments from Social Security)',
  social_security: 'Social Security',
  unemployment: 'unemployment benefits',
  alimony: 'alimony',
  pension: 'pension / retirement',
};
const FREQ_LABEL: Record<string, string> = { weekly: 'every week', biweekly: 'every two weeks', twice_monthly: 'twice a month (the 1st and the 15th)', monthly: 'once a month', annual: 'once a year' };
const REL_LABEL: Record<string, string> = { self: 'you', spouse: 'your spouse / partner (lives with you)', parent: "your parent (the kids' grandparent, lives with you)", child: 'your child' };

function districtLabel(d: string): string {
  return d === 'psusd' ? 'Palm Springs Unified School District' : d === 'pvusd' ? 'Pajaro Valley Unified School District' : d;
}

/** The household's truth, as the parent knows it: plain words, never field ids. */
export function renderTruth(fam: HarnessFamily): string {
  const rec = fam.record;
  const v = (k: string) => rec.get(k)?.value;
  const ms = membersOf(rec);
  const name = (id: string) => {
    const m = ms.find((x) => x.id === id);
    return m ? `${m.first} ${m.last}`.trim() : id;
  };
  const benefitsOf = (id: string) => (v(`member.${id}.benefits`) as string[] | undefined) ?? [];
  const lines: string[] = [`Today is ${fam.asOf}. You live in California; your kids go to school in ${districtLabel(fam.district)}.`, '', 'People who live in your home (this is everyone; nobody else lives with you):'];
  for (const m of ms) {
    const mi = v(`member.${m.id}.middle_initial`);
    lines.push(`- ${m.first}${mi ? ` ${mi}.` : ''} ${m.last}: ${REL_LABEL[m.relationship] ?? m.relationship}, age ${v(`member.${m.id}.age`)}, born ${v(`member.${m.id}.dob`)}`);
    if (m.student) lines.push(`  student at ${v(`member.${m.id}.school`)}, grade ${v(`member.${m.id}.grade`)}; student ID number ${v(`member.${m.id}.student_id`)} (it is on a school paper you have)`);
    else if (m.relationship === 'child') lines.push('  not in school');
    const ben = benefitsOf(m.id);
    if (ben.includes('foster_care')) lines.push('  a foster child placed with you by the county');
    if (ben.includes('medicaid')) lines.push('  has Medi-Cal');
    if (ben.includes('snap')) lines.push('  is on your CalFresh (food stamps) case');
    if (ben.includes('tanf')) lines.push('  is on your CalWORKs case');
    if (v(`member.${m.id}.migrant`) === true) lines.push('  your family moves for farm work (the school calls this migrant)');
    if (v(`member.${m.id}.homeless`) === true) lines.push('  you do not have a fixed home right now');
  }
  lines.push('');
  const inc = rec.incomeIndexes();
  if (!inc.length) lines.push('Money: right now NOBODY in your home has any income at all (no job, no cash benefits, no child support).');
  else {
    lines.push('Money coming in (this is ALL of it; nobody has any other income):');
    for (const n of inc) {
      const kind = String(v(`income.${n}.kind`));
      const freq = String(v(`income.${n}.frequency`));
      lines.push(`- ${name(String(v(`income.${n}.owner`)))}: $${Number(v(`income.${n}.amount`)).toLocaleString('en-US')} ${FREQ_LABEL[freq] ?? freq}, ${KIND_LABEL[kind] ?? kind}`);
    }
    const earners = new Set(inc.map((n) => String(v(`income.${n}.owner`))));
    const none = ms.filter((m) => !earners.has(m.id) && m.relationship !== 'child').map((m) => m.first);
    if (none.length) lines.push(`- ${none.join(', ')}: no income`);
    lines.push('- The children have no income.');
  }
  const prog = v('household.case_program');
  if (prog) lines.push('', `Benefits: your household has ${prog === 'calfresh' ? 'CalFresh (food stamps)' : prog === 'calworks' ? 'CalWORKs' : 'Medi-Cal'}; the case number on your card/letter is ${v('household.case_number')}.`);
  else lines.push('', 'Benefits: nobody in your home gets CalFresh (food stamps), CalWORKs, or FDPIR.');
  if (!ms.some((m) => v(`member.${m.id}.migrant`) === true || v(`member.${m.id}.homeless`) === true || benefitsOf(m.id).includes('foster_care'))) {
    lines.push('No child is a foster child, homeless, a runaway, or migrant.');
  }
  lines.push('', 'Contact:', `- phone ${v('contact.phone')}`, `- email ${v('contact.email')}`, `- address ${v('contact.street')}, ${v('contact.city')}, ${v('contact.state')} ${v('contact.zip')}`);
  lines.push('', `You are the adult filling this out and signing it: ${name(String(v('contact.signer') ?? ms[0]?.id))}.`);
  return lines.join('\n');
}

function parentSystem(fam: HarnessFamily, style: string, lang: HarnessLang): string {
  return [
    'You are role-playing a parent in California, texting a helper from your phone. The helper (a texting service your school district offers) is trying to help you fill out the school meals income form. Stay in character the whole time. You are NOT an AI assistant; never say so, never explain the role-play.',
    '',
    '# Who you are and how you text',
    style,
    '',
    '# Your household: the TRUE facts',
    renderTruth(fam),
    '',
    '# Rules',
    '- Answer the helper the way a real parent texts: short, sometimes vague, sometimes several facts at once, sometimes a question back. Typos are fine. No lists, no markdown, no formal letters.',
    '- NEVER invent a fact that is not in your true facts above. If asked something not covered there, say you do not know (or that it does not apply, if your facts say so). Numbers, names, dates and schools you give must match your facts.',
    '- Never ask the helper to write a name, date or number differently from your facts (for example without its accents or hyphen): your facts are how it is written.',
    '- You do not know what a "field" is or how the form is built. You only know your own life.',
    '- When the helper shows you a summary and asks you to approve it or send it: read it against your true facts. If anything is wrong or missing (a name, a date, an amount, how often, a school, a person left out), say what is wrong and what is right, and do not approve. If everything shown is right, say yes in your own words.',
    '- When the helper asks you to sign, certify, or open a link to sign: you do it yourself on your phone (use action "sign"), then text that you did it, in your own words.',
    '- If the helper says it is done, sent, or that you are already covered and there is nothing left to do, say thanks/bye (use action "done").',
    '- If you have been confused for many messages in a row, or the helper keeps asking the same thing, give up and say so in your own words (use action "give_up").',
    '- You do want the free/reduced meals for your kids.',
    '',
    '# Output',
    'Reply with ONE JSON object and nothing else (no code fence, no prose around it):',
    '{"text": "<your next text message to the helper>", "action": "reply" | "approve" | "sign" | "give_up" | "done"}',
    'action: "approve" when you are saying yes to a summary/proposal to send; "sign" when you are signing/certifying now; "give_up" when you quit; "done" when the conversation is over for you; otherwise "reply".',
    lang === 'es' ? 'Your "text" is in Spanish (or Spanish mixed with English, per your style).' : '',
  ].join('\n');
}

function renderTurns(turns: Array<{ role: 'agent' | 'parent'; text: string }>, tail: string): string {
  const body = turns.map((t) => `[${t.role === 'agent' ? 'Helper' : 'You'}]: ${t.text}`).join('\n\n');
  return `${body ? `The conversation so far (texts on your phone):\n\n${body}\n\n` : ''}${tail}`;
}

/** The default transport: the `claude` CLI (its childEnv strips account variables and HOME). */
export function cliParentComplete(model: string): NonNullable<LlmParentOptions['complete']> {
  let last = 0;
  const { transport } = cliLlmClient({ model, onCost: (usd) => void (last += usd), timeoutMs: 120_000 });
  const tail = 'Write your next text message to the helper, as the JSON object described in your instructions.';
  return async (system, turns) => {
    last = 0;
    const text = await transport.complete(system, renderTurns(turns, tail), false, {} as never);
    return { text: text ?? '', costUsd: last };
  };
}

type Action = 'reply' | 'approve' | 'sign' | 'give_up' | 'done';
type ParentEnvelope = { text: string; action: Action };
const ACTIONS: Action[] = ['reply', 'approve', 'sign', 'give_up', 'done'];

/** Read the model's JSON envelope; a reply with no JSON at all is taken as the text itself. */
export function parseParentEnvelope(raw: string): ParentEnvelope | undefined {
  const s = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = s.indexOf('{');
  if (start >= 0) {
    for (let end = s.lastIndexOf('}'); end > start; end = s.lastIndexOf('}', end - 1)) {
      try {
        const v = JSON.parse(s.slice(start, end + 1).replace(/\r?\n/g, ' ')) as { text?: unknown; action?: unknown };
        if (typeof v.text === 'string') {
          const a = String(v.action ?? 'reply') as Action;
          return { text: v.text.trim(), action: ACTIONS.includes(a) ? a : 'reply' };
        }
      } catch {
        /* try a shorter span */
      }
    }
    return undefined;
  }
  return s ? { text: s, action: 'reply' } : undefined;
}

function styleFor(o: ParentOptions): { style: string; label: string; lang: HarnessLang } {
  const persona = o.persona ?? o.family.persona;
  const lang = o.lang ?? o.family.lang;
  const r = rng(hash(`llm:${o.family.id}:${persona}:${o.seed ?? 0}`));
  const ls = langStyle(lang, r);
  return { style: [STYLES[persona], ls.line, literacy(r)].join('\n'), label: `${persona}:${lang}${ls.mix ? '-mix' : ''}`, lang };
}

const FALLBACK_OPENING: Record<HarnessLang, string> = { en: 'hi can you help with the school lunch form', es: 'hola me ayuda con el formulario de la escuela' };

/** The parent's first message (async, so it is made before the run: opening() is sync). */
export async function llmParentOpening(o: LlmParentOptions): Promise<{ text: string; costUsd: number }> {
  const { style, lang } = styleFor(o);
  const complete = o.complete ?? cliParentComplete(o.model);
  const res = await complete(parentSystem(o.family, style, lang), [
    { role: 'agent', text: '(No texts yet. The school district sent you a paper/text saying you can text this number to get help with the school meals income form. Write your FIRST text to the helper.)' },
  ]);
  return { text: parseParentEnvelope(res.text)?.text || FALLBACK_OPENING[lang], costUsd: res.costUsd };
}

export function llmParent(o: LlmParentOptions): LlmParent {
  const { style, label, lang } = styleFor(o);
  const complete = o.complete ?? cliParentComplete(o.model);
  const system = parentSystem(o.family, style, lang);
  const turns: Array<{ role: 'agent' | 'parent'; text: string }> = [];
  const first = o.opening ?? FALLBACK_OPENING[lang];
  let cost = 0;
  const st: ParentStats = { turns: 0, repeatedQuestions: 0, repeated: [], approvals: 0, corrections: [], unmatched: 0, blindProposals: 0, attested: false, gaveUp: false };
  const seenAgent = new Set<string>();
  return {
    id: `llm:${o.model.replace(/^claude-/, '')}:${label}`,
    lang,
    style: label,
    costUsd: () => cost,
    opening() {
      if (!turns.length) turns.push({ role: 'parent', text: first });
      return first;
    },
    stats: () => ({ ...st, repeated: [...st.repeated], corrections: [...st.corrections] }),
    async reply(agentText: string): Promise<ParentReply> {
      st.turns++;
      // The same agent message twice is a repeated question (the only repeat this parent can see).
      const key = agentText.trim();
      if (seenAgent.has(key)) st.repeatedQuestions++;
      seenAgent.add(key);
      turns.push({ role: 'agent', text: agentText });
      let env: ParentEnvelope | undefined;
      for (let attempt = 0; attempt < 2 && !env; attempt++) {
        const res = await complete(system, turns);
        cost += res.costUsd;
        env = parseParentEnvelope(res.text);
        if (env && !env.text && env.action === 'reply') env = undefined;
      }
      if (!env) {
        // The model failed twice: a real parent would send something confused, not nothing.
        st.unmatched++;
        env = { text: '?', action: 'reply' };
      }
      const text = env.text || (env.action === 'sign' ? (lang === 'es' ? 'listo ya firmé' : 'done i signed') : lang === 'es' ? 'gracias' : 'thanks');
      turns.push({ role: 'parent', text });
      const out: ParentReply = { text, keys: [] };
      if (env.action === 'sign') {
        // The parent's own hands: the harness opens their link / signs their page.
        if (o.attest) await o.attest(['signature']);
        st.attested = true;
        out.attested = true;
      } else if (env.action === 'approve') {
        st.approvals++;
        out.approved = true;
      } else if (env.action === 'give_up') {
        st.gaveUp = true;
        out.gaveUp = true;
        out.done = true;
      } else if (env.action === 'done') {
        out.done = true;
      }
      return out;
    },
  };
}

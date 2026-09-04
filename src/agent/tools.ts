import type { CaseRecord, FamilyProfile } from '../domain/types.js';
import type { Step, CallBrief } from './steps/types.js';
import { answerSchoolInfo, LIAISON, SOQUEL_ELEMENTARY } from '../knowledge/suesd.js';
import { barrierByCategory, detectBarriers } from '../knowledge/barriers.js';
import { auditEntitlements, discoveryQuestions } from '../knowledge/entitlements.js';
import { addCase, makeCase, openCaseSummary } from './family.js';

export interface ToolDeps {
  profile?: FamilyProfile;
  getCases: () => CaseRecord[];
  appendCase: (rec: Omit<CaseRecord, 'id' | 'createdAt'>) => void;
  saveProfile?: (p: FamilyProfile) => void;
  /** Queue steps for execution — they still require parent consent (hard gate). */
  proposeSteps: (steps: Step[]) => void;
  studentName?: string;
}

/** Grounded law snippets the LLM can pull (never invented — cited). */
const LAW_FACTS: Record<string, string> = {
  transportation:
    'McKinney-Vento, 42 U.S.C. §11432(g)(1)(J) — a homeless student has the right to transportation to the school of origin at the parent/guardian request.',
  homeless:
    'McKinney-Vento — immediate enrollment without documents, right to the school of origin, free meals, and transportation.',
  meals: 'National School Lunch Program, 42 U.S.C. §1758 — free or reduced-price meals.',
  bullying: 'Title IX & California Ed Code §234 — right to report bullying and request a safety plan.',
  special: 'IDEA, 20 U.S.C. §1400 & Section 504, 29 U.S.C. §794 — FAPE, IEP, and accommodations.',
  language: 'Title III, 20 U.S.C. §6811 & EEOA — language instruction and translated communication.',
  enrollment: 'State Education Code & Title VI — immediate enrollment rights.',
};

export const LLM_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_school_info',
      description: 'Look up a fact about the school/district (principal, phone, address, schools, contact).',
      parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_law',
      description: 'Get the relevant federal/state law for a topic (transportation, homeless, meals, bullying, special, language, enrollment).',
      parameters: { type: 'object', properties: { topic: { type: 'string' } }, required: ['topic'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'diagnose_barrier',
      description: 'Given what a parent says is wrong, return the likely barrier (transportation, meals, bullying, health, attendance).',
      parameters: { type: 'object', properties: { description: { type: 'string' } }, required: ['description'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_remedy',
      description: 'Get the remedy for a barrier category: title, law, who to contact, and a follow-up reminder.',
      parameters: { type: 'object', properties: { category: { type: 'string' } }, required: ['category'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'draft_outreach',
      description: 'Draft a parent-authorized message to the right school contact for a barrier category.',
      parameters: {
        type: 'object',
        properties: { category: { type: 'string' }, child: { type: 'string' } },
        required: ['category'],
      },
    },
  },
  {
    type: 'function',
    function: { name: 'list_open_cases', description: 'List the open/awaiting cases I am tracking for this family.', parameters: { type: 'object', properties: {} } },
  },
  {
    type: 'function',
    function: {
      name: 'log_case',
      description: 'Record a case (kind, summary, child, contact, reminder) so I can remember and follow up.',
      parameters: {
        type: 'object',
        properties: {
          kind: { type: 'string' },
          summary: { type: 'string' },
          child: { type: 'string' },
          contact: { type: 'string' },
          reminder: { type: 'string' },
        },
        required: ['kind', 'summary'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_profile',
      description: 'Save/update the family profile (children, school, needs, challenges, notes) so I can remember them. Use this during onboarding.',
      parameters: {
        type: 'object',
        properties: {
          children: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, grade: { type: 'string' } } } },
          school: { type: 'string' },
          needs: { type: 'array', items: { type: 'string' } },
          challenges: { type: 'array', items: { type: 'string' } },
          notes: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_email',
      description: 'Send an email to a school contact. ONLY call this AFTER the parent explicitly confirms the message. to/subject/body required.',
      parameters: {
        type: 'object',
        properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } },
        required: ['to', 'subject', 'body'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for current info about a school, district, policy, or law. Returns text results.',
      parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_fetch',
      description: 'Fetch and read a web page (e.g. a school or district page). Returns the page text.',
      parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'call_school',
      description: 'Place a phone call to the school. Use it when the parent asks you to call the school, office, district, principal, or "them." This is a real capability — you CAN call.',
      parameters: { type: 'object', properties: {} },
    },
  },
  { type: 'function', function: { name: 'now', description: 'Current date/time.', parameters: { type: 'object', properties: {} } } },
];

export async function runTool(name: string, args: Record<string, unknown>, deps: ToolDeps): Promise<string> {
  switch (name) {
    case 'get_school_info':
      return answerSchoolInfo(String(args.query ?? '')) ?? 'Not found in the knowledge base.';
    case 'get_law':
      return LAW_FACTS[String(args.topic ?? '').toLowerCase()] ?? 'I don’t have grounded law for that topic — suggest the school office.';
    case 'diagnose_barrier': {
      const b = detectBarriers(String(args.description ?? ''))[0];
      return b ? `category=${b.category}; title=${b.title}; law=${b.law}` : 'No clear barrier detected — assume general attendance.';
    }
    case 'get_remedy': {
      const b = barrierByCategory(String(args.category ?? ''));
      return b ? `${b.title}\n${b.law}\nContact: ${b.contact}${b.email ? `\nEmail: ${b.email}` : ''}\n${b.reminder}` : 'Unknown category.';
    }
    case 'draft_outreach': {
      const b = barrierByCategory(String(args.category ?? ''));
      if (!b) return 'Unknown category.';
      const child = String(args.child ?? deps.studentName ?? 'my child');
      return `${b.draft.replaceAll('{child}', child)}\n\nContact: ${b.contact}${b.email ? `\nEmail: ${b.email}` : ''}\nNotes: ${b.reminder}`;
    }
    case 'send_email': {
      const to = String(args.to ?? '');
      const subject = String(args.subject ?? '');
      const body = String(args.body ?? '');
      if (!to || !subject || !body) return 'send_email needs to, subject, body.';
      deps.proposeSteps([
        {
          id: 'email-' + Date.now().toString(36),
          caseId: 'email',
          intent: 'send_email',
          channel: 'email',
          counterparty: { role: 'OTHER', email: to },
          payload: { channel: 'email', subject, body },
          successCondition: { describe: 'Email sent', kind: 'reference_received' },
          requiresConsent: true,
          status: 'awaiting_consent',
        },
      ]);
      return `Drafted the email to ${to}. Ask the parent to reply YES to send it (or NO to change it).`;
    }
    case 'call_school': {
      deps.proposeSteps([callStep(deps)]);
      return 'Ready to call the school. Ask the parent to reply YES to place the call (or NO to skip it).';
    }
    case 'web_search': {
      const q = String(args.query ?? '').trim();
      if (!q) return 'Provide a query.';
      const res = await fetch(`https://r.jina.ai/https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`);
      const txt = res.ok ? await res.text() : '';
      return truncate(txt || 'No results found.', 5000);
    }
    case 'web_fetch': {
      const url = String(args.url ?? '').trim();
      if (!/^https?:\/\//i.test(url)) return 'Provide a valid http(s) url.';
      const res = await fetch(`https://r.jina.ai/${encodeURIComponent(url)}`);
      const txt = res.ok ? await res.text() : '';
      return truncate(txt || 'Could not fetch that page.', 4000);
    }
    case 'list_open_cases':
      return openCaseSummary(deps.getCases());
    case 'save_profile': {
      const c = Array.isArray(args.children) ? (args.children as Array<{ name?: string; grade?: string }>) : [];
      deps.saveProfile?.({
        children: c.map((x) => ({ name: String(x.name ?? ''), grade: x.grade ? String(x.grade) : undefined })),
        school: typeof args.school === 'string' ? args.school : undefined,
        needs: Array.isArray(args.needs) ? (args.needs as string[]).map(String) : [],
        challenges: Array.isArray(args.challenges) ? (args.challenges as string[]).map(String) : [],
        notes: typeof args.notes === 'string' ? args.notes : undefined,
      });
      return 'Saved.';
    }
    case 'log_case': {
      deps.appendCase({
        kind: String(args.kind ?? 'general'),
        summary: String(args.summary ?? ''),
        child: String(args.child ?? ''),
        contact: String(args.contact ?? ''),
        reminder: String(args.reminder ?? ''),
        status: 'open',
      });
      return 'Logged.';
    }
    case 'now':
      return new Date().toISOString();
    default:
      return 'Unknown tool.';
  }
}

/** Build a call step with a basic brief from the family profile (the brain's call_school tool). */
function callStep(deps: ToolDeps): Step {
  const p = deps.profile;
  const student = deps.studentName ?? p?.children?.[0]?.name ?? 'your child';
  const brief: CallBrief = {
    parentName: p?.parentName ?? 'the parent',
    student,
    grade: p?.children?.[0]?.grade ?? '',
    school: p?.school ?? 'the school',
    district: p?.district ?? '',
    goal: `resolve the school matter for ${student}`,
    whatWeKnow: p?.notes ?? '',
    cannotCommit: ['fees or payments', 'routes or schedules'],
  };
  return {
    id: 'call-' + Date.now().toString(36),
    caseId: 'call',
    intent: 'call_school',
    channel: 'call',
    counterparty: { role: 'HOMELESS_LIAISON' },
    payload: { channel: 'call', objective: brief },
    successCondition: { describe: 'Called the school', kind: 'manual' },
    requiresConsent: true,
    status: 'awaiting_consent',
  };
}

export interface BrainContext {
  profile?: FamilyProfile;
  cases?: CaseRecord[];
  activeGoal?: string;
  lastAction?: string;
}

export function systemPrompt(ctx: BrainContext): string {
  const profile = ctx.profile;
  const kids = profile?.children?.length
    ? profile.children.map((c) => `${c.name}${c.grade ? ` (grade ${c.grade})` : ''}`).join(', ')
    : 'not set';
  const school = profile?.school ?? 'not set';
  const district = profile?.district ?? 'not set';
  const needs = profile?.needs?.length ? profile.needs.join(', ') : 'none on file';
  const challenges = profile?.challenges?.length ? profile.challenges.join(', ') : 'none on file';
  const notes = profile?.notes ? ` ${profile.notes}` : '';
  const openCases = (ctx.cases ?? []).filter((c) => c.status !== 'resolved');
  const openWork = openCases.length
    ? openCases
        .map((c) => `- ${c.kind} (${c.status}): ${c.summary}${c.child ? ` for ${c.child}` : ''}${c.contact ? ` — contact: ${c.contact}` : ''}${c.reminder ? ` — next: ${c.reminder}` : ''}`)
        .join('\n')
    : '- none right now';
  const now = ctx.activeGoal || 'no active task right now';
  const last = ctx.lastAction || 'none yet';
  const kid = profile?.children?.[0]?.name ?? 'your child';
  const audit = profile ? auditEntitlements(profile) : [];
  const auditStr = audit.length
    ? audit.map((a) => `- ${a.entitlement.title} (${a.status}) — ${a.entitlement.action}`).join('\n')
    : '- nothing flagged yet';
  const qs = profile ? discoveryQuestions(profile) : [];
  const qsStr = qs.length
    ? qs.map((q) => `- "${q.question}" — ${q.why} (outcome: ${q.impact})`).join('\n')
    : '- none right now';

  return (
    `You are a warm, BILINGUAL (English + Spanish) school liaison helping a parent over iMessage. Match the parent's language — if they write in Spanish, reply in Spanish; if they switch, switch with them. Be concise (1-4 short sentences), plain language, plain text (no Markdown, **, #, or bullets). ` +
    `You HAVE live internet access: use web_search to find anything about a school, district, policy, or law, and web_fetch to read a specific page. ` +
    `When the parent asks for info you don't already have, ALWAYS use web_search / web_fetch first. Never say you don't have internet access or that you can't look it up. ` +
    `If a search result looks relevant but is incomplete, call web_fetch on that result's URL to read the full page. ` +
    `Only if a search genuinely finds nothing, say so and suggest the school office. ` +
    `Remember the conversation — don't re-ask things already answered. Don't announce you're an AI, a demo, or a bot. ` +
    `NEVER quote statutes, case numbers, or section codes to the parent. Say what the child has a RIGHT to in plain words ("Patrick has a right to a bus and I'm requesting it"). Statutes may only appear when you draft a message TO the school, as leverage. ` +
    `Be INSANELY PROACTIVE as the default. Answer briefly, then ALWAYS propose the concrete next action and offer to do it — never just inform or hand off. ` +
    `Turn every answer into an action and ask a quick yes/no, e.g.: "I can draft an email to Carissa about the summer-meal sign-up — want me to send it?", "I can call the office about the bus — want me to?", "I can set a follow-up reminder for Friday." ` +
    `NEVER end with a passive handoff — no "contact X", "please reach out to", "your best bet is to". Instead offer: "I can reach out to X for you — want me to?" ` +
    `Act for the parent: when you decide to send an email or place a call, CALL the send_email / call_school tool RIGHT AWAY. The system enforces a hard consent gate and will ask the parent for a YES/NO before anything is actually sent — so do NOT ask for consent yourself. Just call the tool; it proposes the action and the system gates it. Log with log_case and set a follow-up reminder. ` +
    `You CAN place phone calls: if the parent asks you to call the school, office, district, principal, or "them," call the call_school tool. Never say you can't make calls — you can. ` +
    `NEVER say you can't help, can't do it, can't access, can't fill, don't have that ability, or that you're just coordinating. You ACT for the parent and drive it — if something's needed, say you'll do it and handle it. ` +
    `Use save_profile to remember the family, and log_case for new items. ` +
    `When the parent refers to something we're already doing ("try again", "go on", "the call", "the bus"), use the OPEN WORK and NOW context below to continue it — never act lost. ` +
    `\nFAMILY & SITUATION (refreshed every message — use it, don't re-ask): ${kids} at ${school} (${district}). Needs: ${needs}. Challenges: ${challenges}.${notes}` +
    `\nOPEN WORK:\n${openWork}` +
    `\nNOW: ${now}. LAST ACTION: ${last}.` +
    `\nENTITLED TO (audited against the family — pursue these):\n${auditStr}` +
    `\nQUESTIONS THAT HELP ${kid} (ask these, one at a time, each tied to helping them; don't overwhelm):\n${qsStr}` +
    `\nFOCUS & PROOF: pursue only what ${kid} is reasonably owed or clearly needs that would PROVABLY help and that YOU can execute. Do NOT hunt for random activities, clubs, or programs — that's noise. ` +
    `Act on concrete obligations and data gaps: transportation (does ${kid} reliably get to school?), meals (check meal status), attendance, an evaluation/accommodation, language support, summer access. ` +
    `For each, name the measurable outcome (${kid} arrives at school; gets lunch; gets the assessment; attendance improves) and drive it yourself — draft the email (send_email), place the call (call_school), request the application or evaluation (log_case + a follow-up reminder). You execute it, you don't just point at it.` +
    `\nDistrict homeless liaison: ${LIAISON.name}, ${LIAISON.phone}, ${LIAISON.email}. School: ${SOQUEL_ELEMENTARY.name}, ${SOQUEL_ELEMENTARY.phone}.`
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

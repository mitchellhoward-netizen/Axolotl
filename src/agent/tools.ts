import type { CaseRecord, FamilyProfile } from '../domain/types.js';
import type { Step, CallBrief } from './steps/types.js';
import { answerSchoolInfo, LIAISON, SOQUEL_ELEMENTARY } from '../knowledge/suesd.js';
import { barrierByCategory, detectBarriers } from '../knowledge/barriers.js';
import { auditEntitlements, discoveryQuestions } from '../knowledge/entitlements.js';
import { addCase, makeCase, openCaseSummary } from './family.js';
import {
  browserOpen,
  browserObserve,
  browserAct,
  browserExtract,
  browserFill,
  browserAssessPage,
  browserVision,
  extractPdf,
} from '../integrations/browser.js';
import { fillPdf, listPdfFields } from '../integrations/pdf.js';
import { getFormRecipe, saveFormRecipe, type FormRecipe } from '../integrations/form-recipes.js';
import { createEvidence } from '../integrations/evidence-store.js';
import type { EvidenceRecord, SourceType } from '../domain/evidence.js';
import { searchSchoolGraph, saveResource, chainSummary } from '../knowledge/resource-graph.js';
import { inferCategory } from '../knowledge/research.js';
import type { ResourceNode, ResourceType } from '../domain/graph.js';
import { saveSkill, listSkills, skillSummary } from './skills.js';
import { makeSkillKey, type Skill } from '../domain/skill.js';

export interface ToolDeps {
  profile?: FamilyProfile;
  getCases: () => CaseRecord[];
  appendCase: (rec: Omit<CaseRecord, 'id' | 'createdAt'>) => void;
  saveProfile?: (p: FamilyProfile) => void;
  /** Queue steps for execution — they still require parent consent (hard gate). */
  proposeSteps: (steps: Step[]) => void;
  /** Retrieve grounded knowledge-graph facts for the school/district. */
  knowledge?: (category?: string, query?: string) => Promise<string>;
  /** Record what the family has secured / focuses the family is working on. */
  memory?: {
    addGetting: (item: string) => Promise<string>;
    startInitiative: (label: string) => Promise<string>;
  };
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
          /** City/state to disambiguate the school, e.g. "Seattle, WA". */
          location: { type: 'string' },
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
      name: 'account_action',
      description: 'Propose a consent-gated account action on an auth-required portal (child-care waitlist, school portal): create an account (signup), log in (login), or finish a one-time code the parent just sent (verify). It PROPOSES the step — the system gates it behind the parent\u2019s YES before anything executes. NEVER auto-submit.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          phase: { type: 'string', enum: ['signup', 'login', 'verify'] },
          identifier: { type: 'string' },
          password: { type: 'string' },
          fields: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'string' } }, required: ['label', 'value'] } },
          code: { type: 'string' },
        },
        required: ['url', 'phase'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'submit_form',
      description: 'Propose the consent-gated SUBMIT of the form you just filled in the browser. ONLY call AFTER the form is filled and you shared the link for the parent to review. It PROPOSES the step — the system gates it behind the parent\u2019s YES. NEVER auto-submit.',
      parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_form_recipe',
      description: 'Get the saved fill recipe for a form URL (learned from a past successful fill). Returns the text-field labels, radio/checkbox labels+types, and select names+options to fill. Call BEFORE filling a known form to fill it perfectly on the first try.',
      parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_form_recipe',
      description: 'Save the fill recipe for a form URL AFTER successfully filling it, so the agent fills that form instantly next time. Pass the STRUCTURE you filled (text-field labels, radio/checkbox labels+types, select names+options) — NOT the values.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          title: { type: 'string' },
          fills: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' } }, required: ['label'] } },
          controls: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, kind: { type: 'string', enum: ['radio', 'checkbox'] } }, required: ['label', 'kind'] } },
          selects: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, option: { type: 'string' } }, required: ['name', 'option'] } },
          notes: { type: 'string' },
        },
        required: ['url'],
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
      name: 'browser_open',
      description: 'Open a URL in a real browser (Stagehand) — for JS-heavy portals, Google/Microsoft forms, and pages static fetch cannot read.',
      parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_observe',
      description: 'List what is actionable on the current browser page (returns element selectors + descriptions).',
      parameters: { type: 'object', properties: { instruction: { type: 'string' } }, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_act',
      description: 'Perform an action in the browser by natural language (click, type, scroll, select).',
      parameters: { type: 'object', properties: { instruction: { type: 'string' } }, required: ['instruction'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_extract',
      description: 'Extract structured data from the current browser page. Provide field names to pull.',
      parameters: {
        type: 'object',
        properties: { instruction: { type: 'string' }, fields: { type: 'array', items: { type: 'string' } } },
        required: ['instruction', 'fields'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_fill',
      description: 'Pre-fill form fields in the browser (label + value). NEVER submits — submission requires the parent\u2019s explicit YES.',
      parameters: {
        type: 'object',
        properties: {
          fields: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'string' } }, required: ['label', 'value'] } },
        },
        required: ['fields'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_vision',
      description: 'Use vision (Astra) to READ the current page from a screenshot. For pages the DOM/accessibility tree can\u2019t read — iframes, shadow DOM, image-rendered slides, or a form you can\u2019t see in the fields. Returns the visual text/description. Use browser_get_text/browser_observe first; only fall back to vision when those fail.',
      parameters: { type: 'object', properties: { instruction: { type: 'string' } }, required: ['instruction'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'extract_pdf',
      description: 'Extract text from a PDF at a URL (policies, administrative regulations, applications).',
      parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pdf_fields',
      description: 'List the fillable fields of a PDF form at a URL (name, type, current value, choices). Use before pdf_fill to see exact field names and radio/dropdown options.',
      parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pdf_fill',
      description: 'Fill a fillable PDF form at a URL and produce a completed PDF. Each field has a value plus either a label (matched to the closest field name) or the exact field name from pdf_fields. NEVER auto-submits — it returns a filled PDF the parent reviews, then emails/upload (still needs the parent\u2019s YES).',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          fields: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                field: { type: 'string' },
                value: { type: 'string' },
              },
              required: ['value'],
            },
          },
        },
        required: ['url', 'fields'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_assess',
      description: 'Evaluate whether a web page is a real, working form for the target school/program BEFORE you fill it. Returns whether the page is blank, has real form fields, and mentions the target. Use this to skip blank, broken, or wrong pages — a top search result is often a dead/empty page while the real form is further down.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string' }, target: { type: 'string', description: 'e.g. "Soquel afterschool" or the school name' } },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_evidence',
      description: 'Persist a verified claim with its source (claim, source_url, source_title, and optional source_type/evidence_span/jurisdiction/official/confidence). Returns the trust status after verification.',
      parameters: {
        type: 'object',
        properties: {
          claim: { type: 'string' },
          source_url: { type: 'string' },
          source_title: { type: 'string' },
          source_type: { type: 'string' },
          evidence_span: { type: 'string' },
          jurisdiction: { type: 'string' },
          official: { type: 'boolean' },
          confidence: { type: 'number' },
        },
        required: ['claim', 'source_url', 'source_title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_school_graph',
      description: 'Search the school resource graph (school→district→department→program→eligibility→policy→application→form→contact→deadline) for a program chain matching a goal or category. Returns forms, contacts, and deadlines when available.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          category: { type: 'string' },
          district_id: { type: 'string' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_resource',
      description: 'Persist a resource-graph node (type: district|school|department|program|eligibility|policy|application|form|contact|deadline) with its canonical URL.',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          title: { type: 'string' },
          summary: { type: 'string' },
          canonical_url: { type: 'string' },
          category: { type: 'string' },
          district_id: { type: 'string' },
          status: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['type', 'title', 'canonical_url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_procedure',
      description: 'Persist a verified, parameterized workflow (skill) keyed by intent+jurisdiction, with its steps and evidence deps. Use {child}/{parent}/{school} placeholders in args.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          intent: { type: 'string' },
          jurisdiction: { type: 'string' },
          description: { type: 'string' },
          when_to_use: { type: 'string' },
          steps: { type: 'array', items: { type: 'object', properties: { tool: { type: 'string' }, args: { type: 'object' }, note: { type: 'string' } }, required: ['tool'] } },
          evidence_deps: { type: 'array', items: { type: 'string' } },
          approved: { type: 'boolean' },
        },
        required: ['name', 'intent'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_skills',
      description: 'List the saved procedures (skills) the agent has learned.',
      parameters: { type: 'object', properties: {}, required: [] },
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
  {
    type: 'function',
    function: {
      name: 'get_knowledge',
      description:
        'Retrieve the grounded facts Axolotl has researched about this school/district. Pass `query` (the parent\u2019s question/topic, for meaning-based search) and optionally a `category` (transportation, meals, basic needs, attendance, learning, behavior, special ed, accommodations, activities, general navigation).',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' }, category: { type: 'string' } },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'record_getting',
      description:
        'Record that the family has now SECURED something (e.g. "free meals", "a 504 plan", "a bus pass") so I stop re-pursuing it and remember they have it.',
      parameters: { type: 'object', properties: { item: { type: 'string' } }, required: ['item'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'start_initiative',
      description:
        'Start (or refresh) a focused item the family is actively working toward, so the memory graph tracks it.',
      parameters: { type: 'object', properties: { label: { type: 'string' } }, required: ['label'] },
    },
  },
  { type: 'function', function: { name: 'now', description: 'Current date/time.', parameters: { type: 'object', properties: {} } } },
];

export async function runTool(name: string, args: Record<string, unknown>, deps: ToolDeps): Promise<string> {
  console.log(`[tool] ${name} ${JSON.stringify(args).slice(0, 300)}`);
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
    case 'account_action': {
      const url = String(args.url ?? '').trim();
      const phase = String(args.phase ?? '').trim();
      if (!/^https?:\/\//i.test(url)) return 'Provide a valid http(s) url.';
      if (phase !== 'signup' && phase !== 'login' && phase !== 'verify') {
        return 'account_action needs phase: signup, login, or verify.';
      }
      const fields = Array.isArray(args.fields)
        ? (args.fields as Array<{ label?: unknown; value?: unknown }>)
            .map((f) => ({ label: String(f.label ?? '').trim(), value: String(f.value ?? '') }))
            .filter((f) => f.label)
        : [];
      const password = typeof args.password === 'string' ? args.password : undefined;
      if (password && password.length > 16) {
        return 'That password is too long — this portal caps passwords at 16 characters. Please give a shorter one.';
      }
      const payload: Extract<Step['payload'], { channel: 'account' }> = {
        channel: 'account',
        url,
        phase,
        identifier: typeof args.identifier === 'string' ? args.identifier : undefined,
        password,
        fields: fields.length ? fields : undefined,
        code: typeof args.code === 'string' ? args.code : undefined,
      };
      deps.proposeSteps([
        {
          id: 'account-' + Date.now().toString(36),
          caseId: 'account',
          intent: 'account_' + phase,
          channel: 'account',
          counterparty: { role: 'OTHER' },
          payload,
          successCondition: { describe: 'Account ' + phase, kind: 'manual' },
          requiresConsent: phase !== 'verify',
          status: 'awaiting_consent',
        },
      ]);
      return phase === 'verify'
        ? 'Finishing the login with that code — will confirm once signed in.'
        : `Ready to ${phase === 'signup' ? 'create the account' : 'log in'}. Ask the parent to reply YES to proceed (or NO to change it).`;
    }
    case 'submit_form': {
      const url = String(args.url ?? '').trim();
      if (!/^https?:\/\//i.test(url)) return 'Provide the form url.';
      deps.proposeSteps([
        {
          id: 'submit-' + Date.now().toString(36),
          caseId: 'form',
          intent: 'submit_form',
          channel: 'submit',
          counterparty: { role: 'OTHER' },
          payload: { channel: 'submit', url },
          successCondition: { describe: 'Form submitted', kind: 'reference_received' },
          requiresConsent: true,
          status: 'awaiting_consent',
        },
      ]);
      return 'Ready to submit the form. Ask the parent to reply YES to submit (or NO to change it).';
    }
    case 'get_form_recipe': {
      const url = String(args.url ?? '').trim();
      if (!url) return 'Provide a form url.';
      const r = await getFormRecipe(url);
      if (!r) return 'No saved recipe for that form yet.';
      const parts: string[] = [];
      if (r.fills.length) parts.push(`Fields: ${r.fills.map((f) => f.label).join(', ')}`);
      if (r.controls.length) parts.push(`Controls: ${r.controls.map((c) => `${c.label} (${c.kind})`).join(', ')}`);
      if (r.selects.length) parts.push(`Selects: ${r.selects.map((s) => `${s.name} → ${s.option}`).join(', ')}`);
      return `Recipe for ${r.url}:\n${parts.join('\n')}${r.notes ? `\nNotes: ${r.notes}` : ''}`;
    }
    case 'save_form_recipe': {
      const url = String(args.url ?? '').trim();
      if (!url) return 'Provide a form url.';
      const fills = Array.isArray(args.fills)
        ? (args.fills as Array<{ label?: unknown }>).map((f) => ({ label: String(f.label ?? '').trim() })).filter((f) => f.label)
        : [];
      const controls = Array.isArray(args.controls)
        ? (args.controls as Array<{ label?: unknown; kind?: unknown }>)
            .map((c) => ({ label: String(c.label ?? '').trim(), kind: (String(c.kind ?? '').toLowerCase() === 'checkbox' ? 'checkbox' : 'radio') as 'radio' | 'checkbox' }))
            .filter((c) => c.label)
        : [];
      const selects = Array.isArray(args.selects)
        ? (args.selects as Array<{ name?: unknown; option?: unknown }>)
            .map((s) => ({ name: String(s.name ?? '').trim(), option: String(s.option ?? '').trim() }))
            .filter((s) => s.name)
        : [];
      const recipe: FormRecipe = {
        url,
        title: typeof args.title === 'string' ? args.title : undefined,
        fills,
        controls,
        selects,
        notes: typeof args.notes === 'string' ? args.notes : undefined,
      };
      await saveFormRecipe(recipe);
      return `Saved recipe for ${url} (${fills.length} fields, ${controls.length} controls, ${selects.length} selects). ${fills.length || controls.length || selects.length ? 'Next time I\u2019ll fill this form in one shot.' : ''}`;
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
    case 'browser_open': {
      const url = String(args.url ?? '').trim();
      if (!/^https?:\/\//i.test(url)) return 'Provide a valid http(s) url.';
      const r = await browserOpen(url);
      return r.ok
        ? `Opened ${r.data}. Use browser_observe to see what is actionable on the page.`
        : `browser unavailable (${r.reason}). Fall back to web_fetch.`;
    }
    case 'browser_observe': {
      const r = await browserObserve(String(args.instruction ?? '').trim() || undefined);
      return r.ok ? JSON.stringify(r.data) : `browser unavailable (${r.reason}).`;
    }
    case 'browser_act': {
      const instruction = String(args.instruction ?? '').trim();
      if (!instruction) return 'Provide an instruction.';
      // Submitting a form must go through the gated `submit_form` step — browser_act is the ungated
      // arbitrary-action primitive and is the one consent-bypass path. Block submit-like actions here
      // (the internal gated browserSubmit still works via the executor, so this only stops the LLM
      // tool from directly clicking submit).
      if (/\b(submit|submits|submitting|send (this|the) form|complete (the|this) (form|application|enrollment)|finali[sz]e|submit button|hit submit)\b/i.test(instruction)) {
        return 'Use submit_form (the system gates it behind the parent\u2019s explicit YES) to submit — not browser_act.';
      }
      const r = await browserAct(instruction);
      return r.ok ? `Action done: ${r.data}` : `browser unavailable (${r.reason}).`;
    }
    case 'browser_extract': {
      const instruction = String(args.instruction ?? '').trim();
      const fields = Array.isArray(args.fields) ? (args.fields as unknown[]).map(String) : [];
      if (!instruction || !fields.length) return 'Provide an instruction and a fields array.';
      const r = await browserExtract(instruction, fields);
      return r.ok ? JSON.stringify(r.data) : `browser unavailable (${r.reason}).`;
    }
    case 'browser_vision': {
      const instruction = String(args.instruction ?? '').trim();
      if (!instruction) return 'Provide an instruction for the vision model.';
      const r = await browserVision(instruction);
      return r.ok ? r.data : `vision unavailable (${r.reason}).`;
    }
    case 'browser_fill': {
      const fields = Array.isArray(args.fields)
        ? (args.fields as Array<{ label?: unknown; value?: unknown }>)
        : [];
      const norm = fields
        .map((f) => ({ label: String(f.label ?? '').trim(), value: String(f.value ?? '') }))
        .filter((f) => f.label);
      if (!norm.length) return 'Provide fields: [{label, value}]';
      const r = await browserFill(norm);
      if (!r.ok) return `browser unavailable (${r.reason}).`;
      const verif = r.data.verified === false
        ? ' (not machine-verified)'
        : r.data.mismatches?.length
          ? ` — ${r.data.mismatches.length} field(s) couldn\u2019t be filled: ${r.data.mismatches.map((m) => m.label).join(', ')}`
          : '';
      return `Pre-filled ${r.data.filled} field(s)${verif} on ${r.data.url ?? 'the form'}. NOT submitted — submission needs the parent\u2019s explicit YES.`;
    }
    case 'extract_pdf': {
      const url = String(args.url ?? '').trim();
      if (!/^https?:\/\//i.test(url)) return 'Provide a valid http(s) url.';
      const r = await extractPdf(url);
      return r.ok ? truncate(r.data.text, 4000) : `PDF extraction failed: ${r.reason}`;
    }
    case 'pdf_fields': {
      const url = String(args.url ?? '').trim();
      if (!/^https?:\/\//i.test(url)) return 'Provide a valid http(s) url.';
      const r = await listPdfFields(url);
      if (!r.ok || !r.data) return `PDF unavailable (${r.reason}).`;
      const fields = r.data.fields;
      if (!fields.length) return 'That PDF has no fillable form fields (flat or scanned PDF).';
      return (
        `${fields.length} field(s):\n` +
        fields
          .map(
            (f) =>
              `- ${f.label && f.label !== f.name ? `${f.label} → ` : ''}${f.name} (${f.type})${
                f.value ? ` = "${f.value}"` : ''
              }${f.options?.length ? ` [${f.options.join(' | ')}]` : ''}`,
          )
          .join('\n')
      );
    }
    case 'pdf_fill': {
      const url = String(args.url ?? '').trim();
      if (!/^https?:\/\//i.test(url)) return 'Provide a valid http(s) url.';
      const raw = Array.isArray(args.fields)
        ? (args.fields as Array<{ label?: unknown; field?: unknown; value?: unknown }>)
        : [];
      const fields = raw
        .map((f) => ({
          label: f.label ? String(f.label).trim() : undefined,
          field: f.field ? String(f.field).trim() : undefined,
          value: String(f.value ?? ''),
        }))
        .filter((f) => f.label || f.field);
      if (!fields.length) return 'Provide fields: [{label?, field?, value}]';
      const r = await fillPdf(url, fields);
      if (!r.ok || !r.data) return `PDF fill failed (${r.reason}).`;
      const d = r.data;
      const parts = [`Filled ${d.filled}/${d.total} field(s) in a ${d.fieldCount}-field PDF.`];
      if (d.unmatched.length)
        parts.push(
          `Unmatched (no field name matched — use pdf_fields for exact names, then pass "field"): ${d.unmatched.join(', ')}.`,
        );
      if (d.failed.length)
        parts.push(`Failed: ${d.failed.map((x) => `${x.field} (${x.error})`).join(', ')}.`);
      if (d.filePath) parts.push(`Filled PDF saved to ${d.filePath}.`);
      parts.push(
        `NOT auto-submitted — share the filled PDF with the parent to review, then propose emailing/uploading it (needs the parent's YES).`,
      );
      return parts.join(' ');
    }
    case 'browser_assess': {
      const url = String(args.url ?? '').trim();
      if (!/^https?:\/\//i.test(url)) return 'Provide a valid http(s) url.';
      const target = args.target ? String(args.target).trim() : undefined;
      const r = await browserAssessPage(url, target);
      if (!r.ok) return `browser unavailable (${r.reason}).`;
      const a = r.data;
      return `${a.ok ? 'VERIFIED' : 'POOR'} page (${a.url}): title="${a.title.slice(0, 60)}"; ${a.hasForm ? `${a.fieldCount} form field(s)` : 'NO form fields'}; ${a.blank ? 'BLANK page' : `${a.contentLength} chars`}; ${a.problem ? `problem: ${a.problem}` : 'matches target'}. If POOR, try the next search result.`;
    }
    case 'save_evidence': {
      const claim = String(args.claim ?? '').trim();
      const sourceUrl = String(args.source_url ?? '').trim();
      const sourceTitle = String(args.source_title ?? '').trim();
      if (!claim || !sourceUrl || !sourceTitle) return 'save_evidence needs claim, source_url, source_title.';
      const res = await createEvidence({
        claim,
        sourceUrl,
        sourceTitle,
        sourceType: typeof args.source_type === 'string' ? (args.source_type as SourceType) : undefined,
        evidenceSpan: typeof args.evidence_span === 'string' ? args.evidence_span : undefined,
        jurisdiction: typeof args.jurisdiction === 'string' ? (args.jurisdiction as EvidenceRecord['jurisdiction']) : undefined,
        official: typeof args.official === 'boolean' ? args.official : undefined,
        confidence: typeof args.confidence === 'number' ? args.confidence : undefined,
      });
      return `Saved evidence [${res.status}] "${claim}".${res.reasons.length ? ` Caveats: ${res.reasons.join('; ')}` : ' Verified.'}`;
    }
    case 'search_school_graph': {
      const query = String(args.query ?? '').trim();
      const districtId = String(args.district_id ?? '').trim() || 'district-suesd';
      let category = String(args.category ?? '').trim().toUpperCase();
      if (!category && query) category = inferCategory(query) ?? '';
      const chain = await searchSchoolGraph(districtId, category || undefined);
      return chain && chain.nodes.length ? chainSummary(chain) : 'No resource-graph chain found for that yet.';
    }
    case 'save_resource': {
      const type = String(args.type ?? '').trim();
      const title = String(args.title ?? '').trim();
      const url = String(args.canonical_url ?? '').trim();
      if (!type || !title || !url) return 'save_resource needs type, title, canonical_url.';
      const node: ResourceNode = {
        id: 'res-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
        type: type as ResourceType,
        districtId: typeof args.district_id === 'string' ? args.district_id : undefined,
        category: typeof args.category === 'string' ? args.category.toUpperCase() : undefined,
        title,
        summary: String(args.summary ?? '').trim(),
        canonicalUrl: url,
        sources: [{ title, url }],
        status: (typeof args.status === 'string' ? args.status : 'draft') as ResourceNode['status'],
        confidence: typeof args.confidence === 'number' ? args.confidence : 0.6,
        discoveredAt: new Date().toISOString(),
      };
      await saveResource(node);
      return `Saved ${type} "${title}" to the resource graph.`;
    }
    case 'save_procedure': {
      const name = String(args.name ?? '').trim();
      const intent = String(args.intent ?? '').trim();
      const jurisdiction = String(args.jurisdiction ?? '').trim() || 'district-suesd';
      if (!name || !intent) return 'save_procedure needs name and intent.';
      const steps = Array.isArray(args.steps)
        ? (args.steps as Array<{ tool?: unknown; args?: unknown; note?: unknown }>)
        : [];
      const normSteps = steps.map((s, i) => ({
        order: i + 1,
        tool: String(s.tool ?? ''),
        args:
          typeof s.args === 'object' && s.args
            ? Object.fromEntries(Object.entries(s.args as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
            : {},
        note: typeof s.note === 'string' ? s.note : undefined,
      }));
      const now = new Date().toISOString();
      const skill: Skill = {
        id: 'skill-' + makeSkillKey(intent, jurisdiction),
        name,
        key: makeSkillKey(intent, jurisdiction),
        description: String(args.description ?? '').trim(),
        whenToUse: String(args.when_to_use ?? '').trim(),
        steps: normSteps,
        evidenceDeps: Array.isArray(args.evidence_deps) ? (args.evidence_deps as string[]).map(String) : [],
        status: 'active',
        approved: Boolean(args.approved),
        version: 1,
        createdAt: now,
        updatedAt: now,
        lastVerifiedAt: now,
      };
      await saveSkill(skill);
      return `Saved procedure "${name}" [${skill.key}] with ${normSteps.length} step(s).${skill.approved ? '' : ' Pending parent approval before reuse.'}`;
    }
    case 'list_skills': {
      const skills = await listSkills();
      return skills.length ? skills.map(skillSummary).join('\n\n') : 'No saved procedures yet.';
    }
    case 'list_open_cases':
      return openCaseSummary(deps.getCases());
    case 'get_knowledge':
      return (
        (await deps.knowledge?.(String(args.category ?? ''), String(args.query ?? ''))) ??
        'No researched knowledge for that yet.'
      );
    case 'record_getting':
      return (await deps.memory?.addGetting(String(args.item ?? '').trim())) ?? 'Recorded.';
    case 'start_initiative':
      return (await deps.memory?.startInitiative(String(args.label ?? '').trim())) ?? 'Started.';
    case 'save_profile': {
      const c = Array.isArray(args.children) ? (args.children as Array<{ name?: string; grade?: string }>) : [];
      deps.saveProfile?.({
        children: c.map((x) => ({ name: String(x.name ?? ''), grade: x.grade ? String(x.grade) : undefined })),
        school: typeof args.school === 'string' ? args.school : undefined,
        location: typeof args.location === 'string' ? args.location : undefined,
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
  /** Proposed actions still awaiting the parent's YES/NO (so the brain reminds, not re-proposes). */
  pendingActions?: string;
}

/** Human-readable summary of steps awaiting consent, for the brain's context. */
export function pendingActionsSummary(steps: Step[] | undefined): string {
  if (!steps?.length) return '';
  return steps
    .map((s) => {
      if (s.channel === 'email') {
        const p = s.payload as { channel: 'email'; subject: string };
        return `email to ${s.counterparty.name ?? s.counterparty.email ?? 'the school'} ("${p.subject}")`;
      }
      if (s.channel === 'call') {
        const p = s.payload as { channel: 'call'; objective: CallBrief };
        return `call ${s.counterparty.name ?? 'the school'} (${p.objective.goal})`;
      }
      if (s.channel === 'account') {
        const p = s.payload as { channel: 'account'; phase: string };
        const label =
          p.phase === 'signup' ? 'create the account' : p.phase === 'login' ? 'log into the account' : 'finish the login code';
        return `${label} (${s.intent})`;
      }
      if (s.channel === 'submit') return `submit the form (${s.intent})`;
      return `${s.channel}: ${s.intent}`;
    })
    .join('; ');
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
    `For JS-heavy portals, Google/Microsoft forms, or pages web_fetch cannot read, use browser_open then browser_observe/browser_act/browser_extract. For PDFs: use extract_pdf for policies/regulations; for FILLABLE PDF application forms use pdf_fields to list its fields, then pdf_fill to fill them (returns a completed PDF to review — never auto-submit; emailing/uploading it still needs the parent's YES). For pages the DOM/accessibility tree can't read (iframes, shadow DOM, image-rendered slides like a resources guide, or a form you can't see in the fields), use browser_vision to read them from a screenshot. ` +
    `VERIFY A PAGE BEFORE YOU FILL IT: a top web-search result is often a blank/dead/duplicate page while the real form is further down. Before filling a form, call browser_assess on the URL to confirm it's a real form for the right school/program. If it returns POOR, blank, no form fields, or doesn't match the school, do NOT fill it — search again and try the next result until you find one that VERIFIES. ` +
    `SIGN-UP FLOW (follow this to sign a student up for a school program): If the parent GAVE you the exact form URL, do NOT research or re-search — just browser_open that URL and fill it (skip browser_assess). Only research/search when the parent asked for a program but gave NO URL. Trust a parent-provided URL as-is and treat the form by its OWN title from the page — NEVER assume it's for the profile's default school or invent a school name for it (only name the school when the parent's request actually says it). If the parent sends a URL or repeats a form you ALREADY have open, do NOT re-open or re-assess it — continue from where you left off. To fill: text fields via browser_fill; checkboxes/radios/dropdowns via browser_act. Then share the form link for the parent to review, call submit_form (the system gates it behind the parent's YES), and after it submits SHARE the response link. ` +
    `FORM RECIPE (how you get better at forms over time — use it): before filling a form, call get_form_recipe with its URL. If a recipe exists, fill using the listed fields/controls/selects (with the parent's actual values) — no trial-and-error. After you successfully fill a NEW form, call save_form_recipe with the URL and the structure you filled (the field labels, radio/checkbox labels+types, select names+options). This way every form you work once, you fill perfectly forever after. ` +
    `Never submit a form without the parent's explicit consent, and never claim you submitted unless the step actually succeeded. ` +
    `ACCOUNT FLOW (for auth-gated portals/waitlists, e.g. a child-care waitlist that requires an account): to create or access the account, call account_action with phase "signup" (new) or "login" (returning) and the account details the parent gave you — it PROPOSES the step and the system gates it behind the parent's YES. If the result says a verification code was sent, tell the parent to check their email/phone and text you the code; when they send it, call account_action with phase "verify" and that exact code. KEEP THE PARENT IN THE LOOP THE WHOLE TIME: get their YES before creating/logging into an account, have them relay the verification code (it arrives in THEIR inbox/phone — that's proof it's really them), and never fill in or submit application details they didn't confirm. NEVER invent account details, and never claim you're signed in unless the step actually succeeded. ` +
    `LIMITS & HANDOFF (very important): if a page says "sign in to continue", "must be signed in", or shows a CAPTCHA / "I'm not a robot", you have hit a hard limit that automation cannot pass. DO NOT try to bypass it and do NOT claim you did. Instead, tell the parent plainly: "I've filled in everything I can, but this form requires you to sign in yourself / pass a security check — here's the link, you'll need to finish that last step." Hand them the exact URL. This keeps you honest and keeps the parent moving. ` +
    `When the parent asks for info you don't already have, ALWAYS use web_search / web_fetch first. Never say you don't have internet access or that you can't look it up. ` +
    `DISAMBIGUATE SCHOOLS: if the school isn't one you have on file, or it's a common name (Lakeside, Lincoln, Washington, etc.), ALWAYS ask which city and state it's in, then include the city/state in every web search (e.g. "Lakeside School Seattle WA", "Lakeside School Seattle WA afterschool math") AND save it on the profile (save_profile with school + location). Never research or assume a different school with the same name. ` +
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
    `If the parent says something UNRELATED while a PENDING ACTION is waiting for their YES/NO, answer what they said normally, then at the END briefly remind them the action is still waiting (e.g. "Still want me to call the school? Reply yes or no."). Do NOT re-propose the same action or ask a fresh yes/no for it — just remind. ` +
    `\nFAMILY & SITUATION (refreshed every message — use it, don't re-ask): ${kids} at ${school} (${district}). Needs: ${needs}. Challenges: ${challenges}.${notes}` +
    `\nOPEN WORK:\n${openWork}` +
    (ctx.pendingActions ? `\nPENDING ACTIONS (proposed, waiting for the parent's YES/NO): ${ctx.pendingActions}` : '') +
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

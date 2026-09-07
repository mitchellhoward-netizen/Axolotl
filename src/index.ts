// Load .env (PROJECT_ID / PROJECT_SECRET) into process.env before anything
// else runs — tsx does not auto-load it.
import "dotenv/config";

import { Spectrum } from "spectrum-ts";
import { imessage } from "@spectrum-ts/imessage";

import { Agent } from "./agent/agent";
import { LlmIntentEngine } from "./agent/intent/llm";
import { LlmClient } from "./agent/llm";
import { smallModel } from "./agent/model-policy";
import { RulesIntentEngine } from "./agent/intent/rules";
import { MockCalendarProvider } from "./integrations/calendar";
import { MockMealsProvider } from "./integrations/meals";
import { MockSis } from "./integrations/sis";
import { createSeedDb, provisionalParent } from "./seed";
import { loadIdentityIntoSeed } from "./integrations/identity";
import { createEmailProvider } from "./integrations/email";
import { createRetellClient } from "./integrations/phones";
import { startWebServer } from "./integrations/web";
import { setDeferHandler, answerDeferredQuestion } from "./voice/defer";
import { setVoiceActionHandler } from "./voice/actions";
import { buildPreCallBrief } from "./knowledge/precall";
import { researchQuestion } from "./knowledge/research";
import { AXOLOTL_EMOJI, hasAxolotlImage, axolotlImagePath } from "./integrations/axolotl";
import { takePendingGreeting } from "./integrations/pending-greeting.js";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
import { toPlainText } from "./lib/plain";

// ── Single-instance guard ──────────────────────────────────────────────────────
// Running two identical bot instances against the same Spectrum line makes BOTH
// respond to each message (duplicate/conflicting replies, e.g. an OTP code being
// treated as a normal message by the second instance because verification status is
// shared via Supabase). Refuse to start if another live instance is already running.
// Lock lives at the process cwd (the project root when run via `npm run start`).
const LOCK_FILE = pathResolve(process.cwd(), ".agent.lock");
try {
  const pid = Number(readFileSync(LOCK_FILE, "utf8").trim());
  if (pid && Number.isInteger(pid)) {
    try {
      process.kill(pid, 0); // throws if the pid is not alive
      console.error(`Another Axolotl instance is already running (pid ${pid}). Stop it before starting a second one.`);
      process.exit(1);
    } catch {
      /* stale pidfile from a crashed run — take over */
    }
  }
} catch {
  /* no/invalid lock file */
}
writeFileSync(LOCK_FILE, String(process.pid));
process.on("exit", () => {
  try {
    if (readFileSync(LOCK_FILE, "utf8").trim() === String(process.pid)) unlinkSync(LOCK_FILE);
  } catch {
    /* ignore */
  }
});

// ── Identity ───────────────────────────────────────────────────────────────────
// Phone = parent ID. There is NO pre-seeded family: an unknown number gets a
// provisional parent created on first contact, and the agent onboards them.
// Self-onboarded families are persisted to Supabase and rehydrated here, so we
// don't need the school SIS and the data survives restarts.
const db = createSeedDb();
await loadIdentityIntoSeed(db);

// LLM brain — OpenAI-compatible; DeepSeek by default. Without a key it's off.
const LLM_API_KEY = process.env.DEEPSEEK_API_KEY ?? process.env.OPENAI_API_KEY;
const LLM_BASE_URL = process.env.LLM_BASE_URL ?? process.env.OPENAI_BASE_URL ?? "https://api.deepseek.com";
const LLM_MODEL = process.env.LLM_MODEL ?? process.env.OPENAI_MODEL ?? "deepseek-chat";

const llm = new LlmClient({ apiKey: LLM_API_KEY, baseUrl: LLM_BASE_URL, model: LLM_MODEL });

// A small/specialized model for the researcher (query reformulation, extraction,
// classification) — never the frontier brain. Falls back to the frontier client.
const small = smallModel();
const researchLlm = small.apiKey
  ? new LlmClient({ apiKey: small.apiKey, baseUrl: small.baseUrl, model: small.model })
  : llm;

const agent = new Agent({
  intentEngine: LLM_API_KEY
    ? new LlmIntentEngine({ apiKey: LLM_API_KEY, baseUrl: LLM_BASE_URL, model: LLM_MODEL })
    : new RulesIntentEngine(),
  sis: new MockSis(db),
  calendar: new MockCalendarProvider(),
  meals: new MockMealsProvider(Object.fromEntries(db.students.map((s) => [s.id, s.mealStatus]))),
  db,
  defaultParentId: undefined,
  llm,
  researchLlm,
  email: createEmailProvider(),
});
const retell = createRetellClient();

// Voice→text handoff: when a voice question needs research, answer it async and
// text the parent the result over iMessage (rather than making them wait on the call).
setDeferHandler(async (q) => {
  const answer = await answerDeferredQuestion(q, llm);
  const sent = await agent.sendToConversation(q.conversationId, answer);
  if (!sent) console.warn('[defer] could not deliver answer to', q.conversationId);
});

// Voice→action: parent approved an action on the call → run it + text the result.
setVoiceActionHandler(async (conversationId, steps) => {
  const summary = await agent.executeVoiceSteps(conversationId, steps);
  const sent = await agent.sendToConversation(conversationId, summary);
  if (!sent) console.warn('[voice-action] could not deliver summary to', conversationId);
  return summary;
});

// Resolve the parent from the inbound sender's canonical handle (E.164 phone or
// email). Unknown phone → create a provisional parent so the agent can onboard.
function resolveParentId(senderId?: string): string | undefined {
  if (!senderId) return undefined;
  const p = db.parents.find(
    (parent) => parent.phone === senderId || parent.email.toLowerCase() === senderId.toLowerCase(),
  );
  if (p) return p.id;
  const phone = senderPhone(senderId);
  return phone ? provisionalParent(db, phone)?.id : undefined;
}

/** The sender's phone number, if they texted from a phone number (not an Apple ID email). */
function senderPhone(senderId?: string): string | undefined {
  return senderId && /^\+\d{6,}$/.test(senderId) ? senderId : undefined;
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

// Whimsical ocean/reef-themed reaction emoji — reacts to the vibe of the message
// with cute sea creatures, coral, and bubbles, with a varied fallback.
const REACTIONS: Array<[RegExp, string]> = [
  [/\b(hello|hi|hey|yo|sup|morning|evening)\b/i, '🐬'], // dolphin surfacing
  [/\b(bus|transport|ride|pickup|dropoff)\b/i, '🐢'], // turtle crossing
  [/\b(meeting|conference|appointment|schedule|parent-teacher)\b/i, '🧜‍♀️'], // mermaid plans
  [/\b(absence|absent|sick|missed|fever|doctor)\b/i, '🐳'], // whale of a day
  [/\b(meal|lunch|food|voucher|breakfast|hungry)\b/i, '🐟'], // fish snack
  [/\b(school|office|district|counselor|principal|teacher|class)\b/i, '🐙'], // octo-school
  [/\b(homework|grade|assignment|test|progress)\b/i, '🐡'], // puffy study time
  [/\b(call|phone|dial|ring)\b/i, '🐚'], // conch call
  [/\b(email|send|message|letter)\b/i, '🏝️'], // island message
  [/\b(thank|thanks|great|awesome|perfect|got it)\b/i, '🌟'], // starfish thanks
];
const FALLBACK_REACTIONS = ['🪸', '🐠', '🐬', '🐡', '🐳', '🐢', '🐚', '🌊', '🐟', '🦀', '🍥', '🪼', '🫧', '🏝️', '🌺', '🦑', '🐞', '🐙', '🧜‍♀️', '🐬', '🦎'];

function pickReaction(text: string): string {
  for (const [re, emoji] of REACTIONS) if (re.test(text)) return emoji;
  return FALLBACK_REACTIONS[Math.floor(Math.random() * FALLBACK_REACTIONS.length)] ?? '\u{1F44D}';
}

/**
 * The axolotl "reaction". Real path = iMessage sticker tapback via the SDK's
 * `placeSticker` (see docs/AXOLOTL.md); until the SDK exposes it, fall back to 🦎.
 */
async function reactWithAxolotl(space: { placeSticker?: unknown }, message: { id: string; react: (e: string) => unknown }): Promise<void> {
  // Always give the reliable visible reaction (🦎), then attempt the sticker on top.
  await message.react(AXOLOTL_EMOJI);
  if (hasAxolotlImage()) {
    try {
      if (typeof (space as { placeSticker?: (i: unknown) => unknown }).placeSticker === 'function') {
        const bytes = readFileSync(axolotlImagePath());
        await (space as { placeSticker: (i: unknown) => unknown }).placeSticker({
          data: bytes, fileName: 'axolotl.png', targetId: message.id,
        });
      }
    } catch (e) {
      console.error('[axolotl] sticker path failed — keeping 🦎:', (e as Error)?.message ?? e);
    }
  }
}

// ── Website + waitlist + voice LLM (Retell WebSocket) ─────────────────────────
// Always up on the long-lived host. The landing page is served here in dev but
// skipped when RUN_AGENT_ONLY=true (Vercel serves it); /api/waitlist and
// /voice-llm always run.
startWebServer({
  placeCall: async (phone, info) => {
    if (!retell) return { ok: false, error: 'Voice is not configured.' };
    const school = info?.school?.trim() ?? '';
    const student = info?.student?.trim() ?? '';

    // Tiny pre-call research so the agent already knows about the school. For an
    // un-researched school, do a quick, bounded web lookup if we have the time.
    let research = '';
    if (school) {
      try {
        research = await buildPreCallBrief(school, school);
        if (!research) {
          const pages = await withTimeout(researchQuestion(`${school} school`, school, undefined, 1), 6000, '');
          research = pages ? `(from the web) ${pages.slice(0, 1200)}` : '';
        }
        if (research) console.log('[call-me] researched school:', school, '-', research.slice(0, 60));
      } catch (e) {
        console.error('[call-me] research failed:', (e as Error)?.message ?? e);
      }
    }

    try {
      await retell.createCall(phone, 'website-demo', {
        parent_name: 'there',
        student: student || 'your child',
        school: school || 'your child\u2019s school',
        district: school || '',
        issue: student ? `you called from the website to learn what Axolotl can do for ${student}` : 'you called from the website to learn what Axolotl can do',
        what_we_know:
          'This is an ENGLISH demo call from the website. Speak in ENGLISH. Greet warmly, introduce yourself as Axolotl, and explain you help families navigate the school system — programs, eligibility, forms, the right contacts, follow-ups. Offer to walk through a real example (transportation, special-education evaluation, meals) and ask what they\u2019d like to hear about. Offer Spanish only if the caller asks for it.' +
          `${school ? ` The family\u2019s school is ${school}.` : ''}` +
          `${research ? `\n\nResearched about this school before the call:\n${research}` : ''}`,
        call_kind: 'parent',
      });
      return { ok: true };
    } catch (e) {
      console.error('[call-me] failed:', e);
      return { ok: false, error: (e as Error)?.message ?? 'Could not place the call.' };
    }
  },
});

// ── Spectrum: one agent loop, delivered over iMessage (non-fatal) ─────────────
let app: Awaited<ReturnType<typeof Spectrum>> | null = null;
try {
  app = await Spectrum({
    projectId: process.env.PROJECT_ID!,
    projectSecret: process.env.PROJECT_SECRET!,
    providers: [imessage.config()],
  });
} catch (err) {
  console.error('⚠️ iMessage connection failed — the website is still up:', (err as Error)?.message ?? err);
}

console.log(`🏫 Axolotl is listening for iMessages…`);
console.log(
  LLM_API_KEY
    ? `🧠 Brain: LLM (${LLM_MODEL} @ ${LLM_BASE_URL})`
    : `🧠 Brain: offline rules (set DEEPSEEK_API_KEY in .env to enable the LLM)`,
);

if (app) {
  // Always-on advocate: proactively follow up on the family's behalf, but never
  // nag — relevance + throttle (quiet hours, cooldown, daily cap) live in the
  // FollowUpEngine. Fires on a timer AND when a parent texts so we never miss.
  const proactiveEveryMs = Number(process.env.PROACTIVE_INTERVAL_MS) || 5 * 60 * 1000;
  setInterval(() => {
    agent.runProactive().catch((e) => console.error('[proactive] tick error:', e));
  }, proactiveEveryMs);

const seenMessages = new Set<string>(); // dedupe duplicate deliveries by message id
for await (const [space, message] of app.messages) {
  // Never answer our own outbound echoes.
  if (message.direction === "outbound") continue;

  // The iMessage SDK can deliver the same message twice (read/typing re-emit or a
  // retried webhook). Dedupe by message id so a single text never gets TWO replies.
  const messageId = (message as { id?: string }).id;
  if (messageId) {
    if (seenMessages.has(messageId)) {
      console.log(`[imessage] dup message ${messageId} (${space.id}) — skipping`);
      continue;
    }
    seenMessages.add(messageId);
    if (seenMessages.size > 2000) seenMessages.clear();
  }

  // Register this family's messenger + mark the inbound so cooldown applies,
  // then fire any due, relevant follow-ups (best-effort, never blocks the reply).
  agent.registerConversation(space.id, async (text) => { await space.send(text).catch(() => {}); });
  agent.noteInbound(space.id);
  await agent.runProactive().catch(() => {});

  if (message.content.type !== "text") continue;

  const text = message.content.text;
  // iMessage fallback: if the waitlist confirmation couldn't be sent as SMS, we
  // held it keyed by the phone. The moment this parent texts us (creating a real
  // iMessage chat), send it — this is the reliable iMessage-via-Photon path.
  const greetingPhone = senderPhone(message.sender?.id);
  if (greetingPhone) {
    const greeting = await takePendingGreeting(greetingPhone).catch((e) => {
      console.error('[greeting] take failed:', e);
      return undefined;
    });
    if (greeting) {
      await space.send(greeting).catch(() => {});
    }
  }

  // Bind this conversation to a parent when we can identify the sender.
  const parentId = resolveParentId(message.sender?.id);
  if (parentId) agent.bindParent(space.id, parentId);

  // Best-effort niceties — these must NEVER prevent the reply from going out.
  // Read receipt first: show the parent we read their message.
  await (message as unknown as { read?: () => Promise<void> }).read?.().catch(() => {});
  await space.startTyping().catch(() => {});

  let reply: string;
  let resolved = false;
  try {
    const turn = await agent.handle(space.id, text);
    reply = toPlainText(turn.text);
    resolved = turn.resolved === true;
    // If the parent asked us to call, dial them or the school with the voice agent.
    if (turn.callMe || turn.callSchool) {
      // Both dial the SENDER's own number for now, so the tester can hear the
      // voice. `callSchool` still routes through the SCHOOL brain (advocate), and
      // can later ring a real school by setting SCHOOL_CALL_NUMBER.
      const sender = senderPhone(message.sender?.id) ?? senderPhone((space as unknown as { phone?: string }).phone) ?? undefined;
      const phone = turn.callSchool ? (process.env.SCHOOL_CALL_NUMBER ?? sender) : sender;
      if (phone && retell) {
        const vars = turn.callContext
          ? { ...turn.callContext, call_kind: turn.callSchool ? 'school' : 'parent' }
          : {
              parent_name: 'a parent',
              student: 'your child',
              school: 'your child\u2019s school',
              issue: 'the thing you asked about',
              what_we_know:
                'This is a demonstration call so you can hear how the assistant would talk to the school.',
              call_kind: 'parent',
            };
        retell
          .createCall(phone, space.id, vars)
          .catch((e) => console.error('[retell] create-call error:', e));
      } else if (!retell) {
        reply += "\n\nI can't call yet — add RETELL_API_KEY, RETELL_AGENT_ID and RETELL_FROM_NUMBER to your .env and restart.";
      } else {
        reply += "\n\nI don't have a phone number for you to call. Text me from a phone number (not an Apple ID email), or send me the number you'd like me to call.";
      }
    }
    // Persist the family profile + cases to Supabase (best-effort, never blocks the reply).
    void agent.persist(space.id).catch((e) => console.error('[persist] error:', e));
  } catch (err) {
    console.error("[imessage] agent error:", err);
    reply = "Sorry — something went wrong on my end. Please call the school office and a person can help right away.";
  }

  await space.stopTyping().catch(() => {});

  // React with the axolotl (🦎 / sticker) when we RESOLVED something for the
  // parent — a "win" marker — not on every message.
  if (resolved) {
    await reactWithAxolotl(space as unknown as { placeSticker?: unknown }, message as unknown as { id: string; react: (e: string) => unknown }).catch(() => {});
  }

  // Send reliably: threaded reply if the platform supports it, else a plain message.
  // Send reliably as ONE message. `message.reply(...)` double-sends on this platform
  // (a threaded reply + a copy); `space.send` emits a single message.
  await space.send(reply).catch(() => {});
}
}

// Graceful shutdown.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void app?.stop().finally(() => process.exit(0));
  });
}

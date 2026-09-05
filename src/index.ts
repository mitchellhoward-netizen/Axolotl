// Load .env (PROJECT_ID / PROJECT_SECRET) into process.env before anything
// else runs — tsx does not auto-load it.
import "dotenv/config";

import { Spectrum } from "spectrum-ts";
import { imessage } from "@spectrum-ts/imessage";

import { Agent } from "./agent/agent";
import { LlmIntentEngine } from "./agent/intent/llm";
import { LlmClient } from "./agent/llm";
import { RulesIntentEngine } from "./agent/intent/rules";
import { MockCalendarProvider } from "./integrations/calendar";
import { MockMealsProvider } from "./integrations/meals";
import { MockSis } from "./integrations/sis";
import { createSeedDb, provisionalParent } from "./seed";
import { loadIdentityIntoSeed } from "./integrations/identity";
import { createEmailProvider } from "./integrations/email";
import { createRetellClient } from "./integrations/phones";
import { startWebServer } from "./integrations/web";
import { AXOLOTL_EMOJI, hasAxolotlImage, axolotlImagePath } from "./integrations/axolotl";
import { takePendingGreeting } from "./integrations/pending-greeting.js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { toPlainText } from "./lib/plain";

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
  email: createEmailProvider(),
});
const retell = createRetellClient();

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

// ── Website + waitlist: always up, independent of the iMessage connection ─────
// When running the agent on a long-lived host (Railway/Fly) we only want the
// agent + worker, not a duplicate landing page (that's served by Vercel).
if (process.env.RUN_AGENT_ONLY !== 'true') startWebServer();

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

for await (const [space, message] of app.messages) {
  // Never answer our own outbound echoes.
  if (message.direction === "outbound") continue;

  // Register this family's messenger + mark the inbound so cooldown applies,
  // then fire any due, relevant follow-ups (best-effort, never blocks the reply).
  agent.registerConversation(space.id, async (text) => { await space.send(text).catch(() => {}); });
  agent.noteInbound(space.id);
  await agent.runProactive().catch(() => {});

  if (message.content.type !== "text") continue;

  const text = message.content.text;
  console.log(`[imessage] ${space.id} < ${text}`);

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
      console.log(`[greeting] sending waitlist confirmation to ${greetingPhone}`);
      await space.send(greeting).catch(() => {});
    }
  }

  // TEMP diagnostic: dump the live space/message shape once to locate the low-level client.
  if (!(globalThis as { __axolotlDump?: boolean }).__axolotlDump) {
    (globalThis as { __axolotlDump?: boolean }).__axolotlDump = true;
    try {
      const syms = (o: object) => Object.getOwnPropertySymbols(o).map((s) => String(s));
      const protoNames = (o: object) => {
        const out: string[] = []; let p = Object.getPrototypeOf(o);
        while (p && p !== Object.prototype) { out.push(...Object.getOwnPropertyNames(p)); p = Object.getPrototypeOf(p); }
        return out;
      };
      const dump = {
        spaceOwnKeys: Object.getOwnPropertyNames(space),
        spaceProto: protoNames(space),
        spaceSymbols: syms(space),
        spacePropTypes: Object.fromEntries(Object.getOwnPropertyNames(space).map((k) => [k, typeof (space as unknown as Record<string, unknown>)[k]])),
        messageOwnKeys: Object.getOwnPropertyNames(message),
        messageProto: protoNames(message),
        messageSymbols: syms(message),
        messagePropTypes: Object.fromEntries(Object.getOwnPropertyNames(message).map((k) => [k, typeof (message as unknown as Record<string, unknown>)[k]])),
        clientLike: [...Object.getOwnPropertyNames(space), ...protoNames(space), ...Object.getOwnPropertyNames(message), ...protoNames(message)].filter((k) => /client|platform|raw|ctx|remote|grpc|transport|phone|guid/i.test(k)),
      };
      mkdirSync('debug', { recursive: true });
      writeFileSync('debug/space-dump.json', JSON.stringify(dump, null, 2));
      console.log('[axolotl] dumped space/message shape -> debug/space-dump.json');
    } catch (e) {
      console.error('[axolotl] dump failed:', e);
    }
  }

  // Bind this conversation to a parent when we can identify the sender.
  const parentId = resolveParentId(message.sender?.id);
  if (parentId) agent.bindParent(space.id, parentId);

  // Best-effort niceties — these must NEVER prevent the reply from going out.
  console.log('[axolotl] image:', hasAxolotlImage(), '| space.placeSticker:', typeof (space as unknown as { placeSticker?: unknown }).placeSticker);
  await reactWithAxolotl(space as unknown as { placeSticker?: unknown }, message as unknown as { id: string; react: (e: string) => unknown }).catch(() => {});
  await space.startTyping().catch(() => {});

  let reply: string;
  try {
    const turn = await agent.handle(space.id, text);
    reply = toPlainText(turn.text);
    // If the parent asked us to call, dial them (demo) or the school with the voice agent.
    if (turn.callMe || turn.callSchool) {
      const phone = turn.callSchool
        ? (process.env.SCHOOL_CALL_NUMBER ?? process.env.CALL_ME_NUMBER)
        : (senderPhone(message.sender?.id) ?? process.env.CALL_ME_NUMBER);
      if (phone && retell) {
        const vars = turn.callContext ?? {
          parent_name: 'a parent',
          student: 'your child',
          school: 'your child\u2019s school',
          issue: 'the thing you asked about',
          what_we_know:
            'This is a demonstration call so you can hear how the assistant would talk to the school.',
        };
        retell
          .createCall(phone, space.id, vars)
          .catch((e) => console.error('[retell] create-call error:', e));
      } else if (!retell) {
        reply += "\n\nI can't call yet — add RETELL_API_KEY, RETELL_AGENT_ID and RETELL_FROM_NUMBER to your .env and restart.";
      } else {
        reply += "\n\nI don't have a number to dial. Add CALL_ME_NUMBER=+1XXXXXXXXXX to your .env (your phone), or text me from your phone number instead.";
      }
    }
    // Persist the family profile + cases to Supabase (best-effort, never blocks the reply).
    void agent.persist(space.id).catch((e) => console.error('[persist] error:', e));
  } catch (err) {
    console.error("[imessage] agent error:", err);
    reply = "Sorry — something went wrong on my end. Please call the school office and a person can help right away.";
  }

  await space.stopTyping().catch(() => {});

  // Send reliably: threaded reply if the platform supports it, else a plain message.
  try {
    await message.reply(reply);
  } catch {
    await space.send(reply).catch(() => {});
  }
}
}

// Graceful shutdown.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void app?.stop().finally(() => process.exit(0));
  });
}

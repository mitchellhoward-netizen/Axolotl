# Voice architecture

The voice layer is **three interfaces sharing one memory** — not "the text chatbot
with a voice bolted on." They all read the same knowledge graph / resource graph /
family memory, but each has its own persona, model, and tool policy.

| Interface | Model | Tools in hot path | Persona | Defer behavior |
|-----------|-------|-------------------|---------|----------------|
| Text brain (`src/agent`) | reasoning (`LLM_MODEL`) | full tool loop + web/browser | research, verify, explain | n/a (it *is* the researcher) |
| Parent voice (`src/voice/brain.ts`) | fast (`VOICE_MODEL ?? deepseek-chat`) | **none** | warm, plain-spoken | "let me look it up and text you" |
| School voice (`src/voice/school-brain.ts`) | fast (`deepseek-chat`) | **none** | professional advocate | "I'll confirm with the parent and follow up" |

## The latency fix

The old voice agent reused the text brain's reasoning model + tool loop, so every
turn could take 3–50s. The fix is two-fold:

1. **Fast model, no tools.** Voice answers from context only (one fast call).
2. **Research before the call, not during it.** `buildPreCallBrief` (in
   `src/knowledge/precall.ts`) deterministically pulls the district's rights +
   forms + contacts from the knowledge/resource graphs and injects them as the
   call context. The parent voice answers from that, grounded; anything deeper
   DEFERs to async research + text.

## Pre-call research (the "research before you dial" step)

When a `call_me` / `call_school` intent fires, `Agent.enrichCallContext` runs
`buildPreCallBrief(district, school)` and folds the result into the call's
`what_we_know`. The voice brain re-uses this; if it's missing (e.g. a direct
Retell dashboard call), the brain fetches it itself (cached, ~ms).

Plain language throughout — statute numbers are never passed to the voice layer.

## Routing parent vs school

One Retell WebSocket serves both. The caller sets a `call_kind` dynamic variable
(`"parent"` vs `"school"`); `src/voice/server.ts` reads it and dispatches to the
right brain + the right opening line (warm greeting vs. advocate disclosure).

## Voice → text handoff (Phase 4, shipped)

When the parent voice can't answer from context, it says "let me look it up and
text you" and fires `deferQuestion` (`src/voice/defer.ts`). The handler (wired in
`index.ts`) researches the question asynchronously — a focused web search + fetch
(`researchQuestion` in `src/knowledge/research.ts`) — synthesizes a plain-language
answer, and texts it via `agent.sendToConversation` (the Retell `metadata.
conversationId` tells it which iMessage space to reach).

## Live research + proactive action (Phase 3, shipped)

The parent voice now runs a small tool loop on the FAST model: instant lookups
(get_knowledge / search_school_graph) first, then live `web_search` / `web_fetch`
with clear narration ("give me about thirty seconds… still on it"). It only DEFERs
to text when even research can't answer.

Proactivity: when the parent asks to DO something (sign up, enroll, request), a
focused action-proposal step (`proposeAction` in `brain.ts`) returns a concrete
email/call; the agent speaks the offer, and on the parent's spoken "yes" the
server runs it via `agent.executeVoiceSteps` and texts the confirmation. Consent
is a spoken yes/no, held per-call in `server.ts` (`pendingSteps`).

## Third-party contact resolution (shipped)

When a proposed action targets a third-party program (e.g. an afterschool provider
like Campus Kids Connection), `resolveContact` in `brain.ts` does a focused web
search for the provider's email/phone and puts it on the step's counterparty — so
the email/call reaches the provider directly, not the school office. If no contact
is found, it falls back to the school office. The offer is always approved by the
parent ("want me to send it / do that?") before anything executes.



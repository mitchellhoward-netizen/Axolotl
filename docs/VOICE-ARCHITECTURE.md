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

## Not yet built (planned)

- **Phase 3 — opt-in live tool use.** When the parent says they'll wait on the
  call, the voice agent researches live with explicit narration ("going silent
  ~30s… still working… found it"). Today it always defers to text.
- **Phase 4 — the actual text handoff.** The brain already *detects* the defer
  (`looksLikeDefer` in `brain.ts`); the async research → iMessage send is not
  wired yet. Hook point is marked in the code.

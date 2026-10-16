# Jev-first vs LLM agent loop: the same Path, the same families

One Path (a parent's Medi-Cal renewal letter, then an IHSS offer), ten simulated family
members (`personas.json`), two architectures, scored on the same outcomes.

```sh
python3 scripts/compare-ux/jevflow.py 5                      # Jev-first: code owns the flow, Jev decides, replies are pre-written
python3 scripts/compare-ux/llmflow_cli.py claude-opus-5 3      # LLM agent loop via the claude CLI (no API key needed)
npx tsx scripts/compare-ux/llmflow.ts claude-opus-5 3        # same loop via the SDK (needs ANTHROPIC_API_KEY)
npx tsx scripts/compare-ux/llmflow.ts claude-haiku-4-5 3
```

Scored per family: outcome (sent / not sent / crisis / handoff), sent without a clear yes,
per-turn latency, cost, and whether repeated runs agree. Standalone experiment: not wired
into the agent.

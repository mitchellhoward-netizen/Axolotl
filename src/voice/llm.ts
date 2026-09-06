import 'dotenv/config';
import { LlmClient } from '../agent/llm.js';

/**
 * Shared voice LLM. Both voice brains (parent-facing and school-facing) use the
 * FAST model and never the reasoning model — latency is the whole point of the
 * voice layer. Override with VOICE_MODEL if you need a different fast model.
 */

let llm: LlmClient | null | undefined;

export function getVoiceLlm(): LlmClient | null {
  if (llm !== undefined) return llm;
  const key = process.env.VOICE_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? process.env.OPENAI_API_KEY;
  llm = key
    ? new LlmClient({
        apiKey: key,
        baseUrl: process.env.VOICE_BASE_URL ?? process.env.LLM_BASE_URL ?? process.env.OPENAI_BASE_URL ?? 'https://api.deepseek.com',
        model: process.env.VOICE_MODEL ?? 'deepseek-chat',
        maxTokens: process.env.VOICE_MAX_TOKENS ? Number(process.env.VOICE_MAX_TOKENS) : undefined,
      })
    : null;
  return llm;
}

import 'dotenv/config';
import { LlmClient } from '../agent/llm.js';

/**
 * Shared voice LLM. Both voice brains (parent-facing and school-facing) use a FAST,
 * strong model — GPT-4o-mini by default (great conversational quality + low latency)
 * when an OpenAI key is available; DeepSeek only as the fallback. Override with
 * VOICE_MODEL (e.g. gpt-4o for more capability), VOICE_API_KEY, VOICE_BASE_URL.
 */

let llm: LlmClient | null | undefined;

export function getVoiceLlm(): LlmClient | null {
  if (llm !== undefined) return llm;
  const openaiKey = process.env.VOICE_API_KEY ?? process.env.OPENAI_API_KEY;
  const key = openaiKey ?? process.env.DEEPSEEK_API_KEY;
  const isOpenAI = Boolean(openaiKey);
  llm = key
    ? new LlmClient({
        apiKey: key,
        baseUrl: isOpenAI
          ? (process.env.VOICE_BASE_URL ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1')
          : (process.env.VOICE_BASE_URL ?? process.env.LLM_BASE_URL ?? 'https://api.deepseek.com'),
        model: process.env.VOICE_MODEL ?? (isOpenAI ? 'gpt-4o-mini' : 'deepseek-chat'),
        maxTokens: process.env.VOICE_MAX_TOKENS ? Number(process.env.VOICE_MAX_TOKENS) : undefined,
      })
    : null;
  return llm;
}

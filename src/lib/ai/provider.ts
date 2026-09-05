import type { AiProvider } from "./types";
import { GeminiProvider } from "./gemini-provider";

/**
 * The one place that knows which concrete provider is active. Everything
 * else in the app (question-generator.ts, the server action, the UI)
 * only ever sees the AiProvider interface — swapping Gemini for another
 * provider later means adding a new file that implements AiProvider and
 * changing the single line below, not touching any calling code.
 */
export function getAiProvider(): AiProvider {
  return new GeminiProvider();
}

export function isAiGenerationConfigured(): boolean {
  return getAiProvider().isConfigured();
}

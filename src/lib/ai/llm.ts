import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import type { ContextPackage } from "./context-builder";
import type { ChatMessage, ConceptChatContext } from "./prompts";
import * as gemini from "./providers/gemini";
import * as openrouter from "./providers/openrouter";

export type LlmProviderName = "gemini" | "openrouter";

export interface LlmConfig {
  provider: LlmProviderName;
  model: string;
}

export const PROVIDER_DEFAULT_MODEL: Record<LlmProviderName, string> = {
  gemini: gemini.DEFAULT_MODEL,
  openrouter: openrouter.DEFAULT_MODEL,
};

function resolve(provider: LlmProviderName) {
  return provider === "openrouter" ? openrouter : gemini;
}

// The one place the rest of the app talks to "an LLM" — pipeline.ts and the
// chat route never import a specific provider directly, only this. Adding a
// third provider means adding one more file under providers/ and one more
// branch here, not touching any caller.
export async function generateExperience(context: ContextPackage, llm: LlmConfig): Promise<string> {
  return resolve(llm.provider).generateExperience(context, llm.model);
}

export async function regenerateWithFeedback(
  context: ContextPackage,
  previousOutput: string,
  failureReasons: string[],
  llm: LlmConfig
): Promise<string> {
  return resolve(llm.provider).regenerateWithFeedback(context, previousOutput, failureReasons, llm.model);
}

export async function chatAboutConcept(
  concept: ConceptChatContext,
  history: ChatMessage[],
  message: string,
  llm: LlmConfig
): Promise<string> {
  return resolve(llm.provider).chatAboutConcept(concept, history, message, llm.model);
}

export function defaultLlmConfig(): LlmConfig {
  return { provider: "gemini", model: gemini.DEFAULT_MODEL };
}

// Reads the learner's own model choice — every generation/chat call is
// scoped to what THIS user picked in settings, not a single app-wide model.
export async function getUserLlmConfig(userId: string): Promise<LlmConfig> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  const provider: LlmProviderName = user?.llmProvider === "openrouter" ? "openrouter" : "gemini";
  const model = user?.llmModel || PROVIDER_DEFAULT_MODEL[provider];
  return { provider, model };
}

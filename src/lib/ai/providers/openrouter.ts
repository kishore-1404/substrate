import type { ContextPackage } from "../context-builder";
import { GENERIC_SYSTEM_INSTRUCTION, chatSystemInstruction, type ChatMessage, type ConceptChatContext } from "../prompts";

const BASE_URL = "https://openrouter.ai/api/v1";

// A large-context, generally-capable free model that was working at the
// time this was wired up — free-tier OpenRouter models share a contended
// upstream pool, so "default" here just means "reasonable fallback," not
// "reliably available." The model picker (models.ts) always shows what's
// actually responding right now, not this.
export const DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set.");
  return key;
}

async function chatCompletion(
  model: string,
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  opts: { json?: boolean; temperature?: number } = {}
): Promise<string> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      // OpenRouter asks for these to attribute usage; harmless if ignored.
      "HTTP-Referer": "https://substrate.app",
      "X-Title": "Substrate",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.4,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error(`OpenRouter returned no content: ${JSON.stringify(json).slice(0, 300)}`);
  return content;
}

export async function generateExperience(context: ContextPackage, model: string): Promise<string> {
  return chatCompletion(
    model,
    [
      { role: "system", content: GENERIC_SYSTEM_INSTRUCTION },
      { role: "user", content: JSON.stringify(context, null, 2) },
    ],
    { json: true, temperature: 0.4 }
  );
}

export async function regenerateWithFeedback(
  context: ContextPackage,
  previousOutput: string,
  failureReasons: string[],
  model: string
): Promise<string> {
  return chatCompletion(
    model,
    [
      { role: "system", content: GENERIC_SYSTEM_INSTRUCTION },
      { role: "user", content: JSON.stringify(context, null, 2) },
      { role: "assistant", content: previousOutput },
      {
        role: "user",
        content: `Your previous output failed validation for these reasons:\n${failureReasons
          .map((r) => `- ${r}`)
          .join("\n")}\n\nRegenerate the full JSON object, fixing every issue above. Output ONLY the corrected JSON.`,
      },
    ],
    { json: true, temperature: 0.2 }
  );
}

export async function chatAboutConcept(
  concept: ConceptChatContext,
  history: ChatMessage[],
  message: string,
  model: string
): Promise<string> {
  return chatCompletion(model, [
    { role: "system", content: chatSystemInstruction(concept) },
    ...history.map((m) => ({ role: m.role, content: m.content }) as const),
    { role: "user", content: message },
  ]);
}

// Live catalog — filtered to $0-priced ("free tier") models, matching what
// this key's account is actually restricted to (see /auth/key's
// is_free_tier). A model appearing in the catalog does not mean it's
// currently reachable — free models share a contended upstream pool that
// rate-limits independently of this app; probeModel is what actually tells
// the caller whether a given one is usable right now.
export async function listModelIds(): Promise<string[]> {
  const res = await fetch(`${BASE_URL}/models`);
  if (!res.ok) return [];
  const json = await res.json();
  return (json.data ?? [])
    .filter((m: { pricing?: { prompt: string; completion: string } }) => {
      const p = m.pricing;
      return p && Number(p.prompt) === 0 && Number(p.completion) === 0;
    })
    .map((m: { id: string }) => m.id)
    .filter((id: string) => id.endsWith(":free"));
}

export async function probeModel(model: string): Promise<boolean> {
  try {
    const text = await chatCompletion(model, [{ role: "user", content: "Reply with just: ok" }], { temperature: 0 });
    return !!text;
  } catch {
    return false;
  }
}

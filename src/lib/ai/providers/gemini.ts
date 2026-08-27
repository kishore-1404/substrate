import { GoogleGenAI } from "@google/genai";
import type { ContextPackage } from "../context-builder";
import { GEMINI_SYSTEM_INSTRUCTION, RESPONSE_JSON_SCHEMA, chatSystemInstruction, type ChatMessage, type ConceptChatContext } from "../prompts";

// Pro-tier models (gemini-3.1-pro-preview, gemini-2.5-pro, ...) had a
// free-tier quota of exactly 0 on the key this was verified against — flash
// models are the safe default without billing enabled. This is only the
// fallback when a user hasn't picked a model (see models.ts for the live
// list actually shown in the UI).
export const DEFAULT_MODEL = "gemini-flash-lite-latest";

let client: GoogleGenAI | null = null;
function getClient() {
  if (!client) {
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set.");
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return client;
}

export async function generateExperience(context: ContextPackage, model: string): Promise<string> {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: JSON.stringify(context, null, 2) }] }],
    config: {
      systemInstruction: GEMINI_SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseJsonSchema: RESPONSE_JSON_SCHEMA,
      temperature: 0.4,
    },
  });
  const text = response.text;
  if (!text) throw new Error("Gemini returned an empty response.");
  return text;
}

export async function regenerateWithFeedback(
  context: ContextPackage,
  previousOutput: string,
  failureReasons: string[],
  model: string
): Promise<string> {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model,
    contents: [
      { role: "user", parts: [{ text: JSON.stringify(context, null, 2) }] },
      { role: "model", parts: [{ text: previousOutput }] },
      {
        role: "user",
        parts: [
          {
            text: `Your previous output failed validation for these reasons:\n${failureReasons
              .map((r) => `- ${r}`)
              .join("\n")}\n\nRegenerate the full JSON object, fixing every issue above. Output ONLY the corrected JSON.`,
          },
        ],
      },
    ],
    config: {
      systemInstruction: GEMINI_SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseJsonSchema: RESPONSE_JSON_SCHEMA,
      temperature: 0.2,
    },
  });
  const text = response.text;
  if (!text) throw new Error("Gemini returned an empty response on retry.");
  return text;
}

export async function chatAboutConcept(
  concept: ConceptChatContext,
  history: ChatMessage[],
  message: string,
  model: string
): Promise<string> {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model,
    contents: [
      ...history.map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.content }] })),
      { role: "user", parts: [{ text: message }] },
    ],
    config: { systemInstruction: chatSystemInstruction(concept), temperature: 0.4 },
  });
  const text = response.text;
  if (!text) throw new Error("Gemini returned an empty chat response.");
  return text;
}

// Live availability check for the model-picker UI — see models.ts. Filters
// Gemini's full catalog down to generateContent-capable models, then
// (since listing capability != usable quota) the caller probes each with a
// trivial real request.
export async function listModelIds(): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return [];
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  if (!res.ok) return [];
  const json = await res.json();
  return (json.models ?? [])
    .filter((m: { supportedGenerationMethods?: string[]; name: string }) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m: { name: string }) => m.name.replace(/^models\//, ""))
    .filter((id: string) => /^gemini-/.test(id) && !/embedding|tts|image|vision-only|robotics|computer-use/.test(id));
}

export async function probeModel(model: string): Promise<boolean> {
  try {
    const ai = getClient();
    const res = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: "Reply with just: ok" }] }],
      config: { temperature: 0 },
    });
    return !!res.text;
  } catch {
    return false;
  }
}

import fs from "node:fs";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import type { ContextPackage } from "./context-builder";

// Gemini sits behind this single function — the rest of the app never talks
// to the provider directly (handoff §14: "sit behind an application service
// so the model/provider can be changed later").
// Pro-tier models (gemini-3.1-pro-preview, gemini-2.5-pro, ...) have a
// free-tier quota of exactly 0 on this key — only flash models are usable
// without billing enabled. "-latest" aliases always resolve to Google's
// current model of that class, and flash-lite carries the highest free-tier
// throughput of the flash family — swap to a pro-tier model once billing is
// on, if generation quality is worth the tradeoff.
const MODEL = "gemini-flash-lite-latest";

let client: GoogleGenAI | null = null;
function getClient() {
  if (!client) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set.");
    }
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return client;
}

// The canonical MarkdyScript spec, fetched verbatim from
// https://markdy.com/llms-full.txt (Markdy's own "feed this to an LLM"
// artifact) — not a hand-written paraphrase. Output quality for the
// visualization/simulation stages is entirely a function of what we hand
// Gemini here, so this is the authoritative source, not our summary of it.
// Re-sync this file if `markdy.com/AGENT.md`'s version bumps.
const MARKDY_SPEC = fs.readFileSync(path.join(process.cwd(), "src/lib/ai/markdy-spec.md"), "utf-8");

// The exact envelope shape, enforced server-side via responseJsonSchema
// below — NOT left to prose instructions. A prior run without this drifted
// to `stageType`/`content` instead of `type`/`payload`, so this is load-
// bearing, not decorative. `payload`'s internal shape still varies by stage
// type (JSON Schema unions aren't reliably enforced by the API), so those
// field names are pinned by the worked examples instead.
const RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    stages: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["mental_model", "visualization", "explanation", "example", "simulation", "decision", "assessment"],
          },
          skip: { type: "boolean" },
          payload: { type: "object", additionalProperties: true },
        },
        required: ["type"],
      },
    },
  },
  required: ["title", "stages"],
};

// One worked example per stage `type`, showing the EXACT payload field
// names expected (schemas.ts's stagePayloadSchemas is the source of truth
// this must match). This is what actually pins internal payload shape,
// since responseJsonSchema only enforces the outer envelope.
const STAGE_PAYLOAD_EXAMPLES = `Worked example of the exact payload shape per stage "type" (field names are load-bearing — copy them exactly, do not rename):

{"type": "mental_model", "payload": {"text": "..."}}
{"type": "visualization", "payload": {"markdy": "scene \\"...\\" ...\\n..."}}
{"type": "explanation", "payload": {"text": "..."}}
{"type": "example", "payload": {"scenario": "..."}}
{"type": "simulation", "payload": {"initialReplicaCount": 2, "trafficPattern": "steady", "injectedFault": "none", "minLagSeconds": 0.1, "maxLagSeconds": 4.2}}
{"type": "decision", "payload": {"prompt": "...", "choices": [{"id": "a", "label": "...", "consequence": "What actually happens if the learner picks this option — be concrete, not generic."}, {"id": "b", "label": "...", "consequence": "..."}]}}
{"type": "assessment", "payload": {"questions": [{"id": "q1", "prompt": "...", "options": [{"id": "a", "label": "..."}, {"id": "b", "label": "..."}], "correctOptionId": "a"}]}}`;

const SYSTEM_INSTRUCTION = `You generate structured learning content for an interactive technical-learning platform.

Output rules:
- Output ONLY the JSON object described by the caller's schema. No prose outside JSON.
- Never invent facts that contradict the provided source chunk (source.sourceChunk in the context package) — that text is the real book excerpt for this concept; treat it as ground truth over your own training knowledge.
- For "assessment" stages, every question must have exactly one correct, objectively verifiable option.
- Respect requiredStages/optionalStages and the visualPrimitives limits in the Generation Contract exactly — visualPrimitives.allowedNodeKinds and allowedCues are a hard whitelist, not a suggestion. If the contract's allowedCues doesn't list "annotation", do not use \`annotation\` at all — note that even where it IS documented below, it is a top-level scene declaration, never a cue inside a \`beat\` block.
- For any "visualization" or "simulation" stage, the \`markdy\` field must be valid MarkdyScript. The complete, authoritative MarkdyScript specification follows below — it is the single source of truth for syntax, node kinds, and cues. Do not invent anything not documented in it.
- Scene theme: prefer \`theme=blueprint\` (technical engineering-CAD look) or \`theme=editorial\` for this platform's serious, professional tone. Avoid \`sketchy\`/\`terminal\`/\`nebula\` unless the concept is explicitly about that domain (e.g. a CLI tool).
- Omit \`width\`/\`height\` on the \`scene\` line unless the diagram genuinely has 9+ nodes — the renderer's content-adaptive sizing produces a tighter, better-proportioned canvas than a fixed 1280x720 for a small diagram, which otherwise renders as a few small boxes lost in a mostly-empty canvas.
- If you are told a specific stage failed validation and, after this feedback, you still cannot produce a version that satisfies it: for a stage in this contract's \`optionalStages\`, you may emit \`{"type": "<stage>", "skip": true}\` (no \`payload\`) instead of retrying it forever. You may NEVER do this for a stage in \`requiredStages\` — keep trying to fix those using the specific feedback given.

${STAGE_PAYLOAD_EXAMPLES}

${MARKDY_SPEC}`;

export async function generateExperience(context: ContextPackage): Promise<string> {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [{ text: JSON.stringify(context, null, 2) }],
      },
    ],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseJsonSchema: RESPONSE_JSON_SCHEMA,
      temperature: 0.4,
    },
  });

  const text = response.text;
  if (!text) throw new Error("Gemini returned an empty response.");
  return text;
}

// Used by the pipeline's single retry when deterministic validation fails —
// appends the failure reason to the same context rather than starting over.
export async function regenerateWithFeedback(
  context: ContextPackage,
  previousOutput: string,
  failureReasons: string[]
): Promise<string> {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: MODEL,
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
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseJsonSchema: RESPONSE_JSON_SCHEMA,
      temperature: 0.2,
    },
  });

  const text = response.text;
  if (!text) throw new Error("Gemini returned an empty response on retry.");
  return text;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Grounded Q&A about one concept — scoped to what the learner has actually
// been shown (this experience's mental model/explanation/example) plus the
// real book excerpt, not the model's unscoped general knowledge. Plain-text
// generateContent, not structured output — chat replies are prose.
export async function chatAboutConcept(
  concept: { title: string; sourceChunk: string; mentalModel: string; explanation: string; example: string },
  history: ChatMessage[],
  message: string
): Promise<string> {
  const ai = getClient();
  const systemInstruction = `You are a focused technical tutor answering questions about exactly one concept: "${concept.title}".

Ground every answer in the material below — the real book excerpt and the explanation this learner has already been shown. Do not drift into unrelated concepts unless the learner explicitly asks you to connect this to something else. If a question falls outside what this material covers, say so plainly rather than inventing an answer.

Format your reply in Markdown (the UI renders it as such) — use **bold**, lists, and short paragraphs where they help, but keep replies concise: a few sentences to a short paragraph, not an essay.

--- BOOK EXCERPT ---
${concept.sourceChunk}

--- MENTAL MODEL SHOWN TO THE LEARNER ---
${concept.mentalModel}

--- EXPLANATION SHOWN TO THE LEARNER ---
${concept.explanation}

--- WORKED EXAMPLE SHOWN TO THE LEARNER ---
${concept.example}`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      ...history.map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.content }] })),
      { role: "user", parts: [{ text: message }] },
    ],
    config: { systemInstruction, temperature: 0.4 },
  });

  const text = response.text;
  if (!text) throw new Error("Gemini returned an empty chat response.");
  return text;
}

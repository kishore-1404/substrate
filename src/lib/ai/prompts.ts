import fs from "node:fs";
import path from "node:path";

// The canonical MarkdyScript spec, fetched verbatim from
// https://markdy.com/llms-full.txt (Markdy's own "feed this to an LLM"
// artifact) — not a hand-written paraphrase. Output quality for the
// visualization/simulation stages is entirely a function of what we hand
// the model here, so this is the authoritative source, not our summary of
// it. Re-sync this file if `markdy.com/AGENT.md`'s version bumps.
//
// Shared across every provider (Gemini, OpenRouter, ...) — the prompt
// content is provider-agnostic; only the API call mechanics differ.
export const MARKDY_SPEC = fs.readFileSync(path.join(process.cwd(), "src/lib/ai/markdy-spec.md"), "utf-8");

// The exact envelope shape. Gemini can enforce this server-side via
// responseJsonSchema; other providers get it as a JSON Schema described in
// the prompt instead, since not every OpenRouter-hosted model supports
// structured output the same way. `payload`'s internal shape still varies
// by stage type either way — those field names are pinned by the worked
// examples below, not by any schema.
export const RESPONSE_JSON_SCHEMA = {
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
// this must match).
export const STAGE_PAYLOAD_EXAMPLES = `Worked example of the exact payload shape per stage "type" (field names are load-bearing — copy them exactly, do not rename):

{"type": "mental_model", "payload": {"text": "..."}}
{"type": "visualization", "payload": {"markdy": "scene \\"...\\" ...\\n..."}}
{"type": "explanation", "payload": {"text": "..."}}
{"type": "example", "payload": {"scenario": "..."}}
{"type": "simulation", "payload": {"initialReplicaCount": 2, "trafficPattern": "steady", "injectedFault": "none", "minLagSeconds": 0.1, "maxLagSeconds": 4.2}}
{"type": "decision", "payload": {"prompt": "...", "choices": [{"id": "a", "label": "...", "consequence": "What actually happens if the learner picks this option — be concrete, not generic."}, {"id": "b", "label": "...", "consequence": "..."}]}}
{"type": "assessment", "payload": {"questions": [{"id": "q1", "prompt": "...", "options": [{"id": "a", "label": "..."}, {"id": "b", "label": "..."}], "correctOptionId": "a"}]}}`;

const BASE_RULES = `Output rules:
- Output ONLY the JSON object described by the caller's schema. No prose outside JSON.
- Never invent facts that contradict the provided source chunk (source.sourceChunk in the context package) — that text is the real book excerpt for this concept; treat it as ground truth over your own training knowledge.
- For "assessment" stages, every question must have exactly one correct, objectively verifiable option.
- Respect requiredStages/optionalStages and the visualPrimitives limits in the Generation Contract exactly — visualPrimitives.allowedNodeKinds and allowedCues are a hard whitelist, not a suggestion. If the contract's allowedCues doesn't list "annotation", do not use \`annotation\` at all — note that even where it IS documented below, it is a top-level scene declaration, never a cue inside a \`beat\` block.
- For any "visualization" or "simulation" stage, the \`markdy\` field must be valid MarkdyScript. The complete, authoritative MarkdyScript specification follows below — it is the single source of truth for syntax, node kinds, and cues. Do not invent anything not documented in it.
- Scene theme: prefer \`theme=blueprint\` (technical engineering-CAD look) or \`theme=editorial\` for this platform's serious, professional tone. Avoid \`sketchy\`/\`terminal\`/\`nebula\` unless the concept is explicitly about that domain (e.g. a CLI tool).
- Omit \`width\`/\`height\` on the \`scene\` line unless the diagram genuinely has 9+ nodes — the renderer's content-adaptive sizing produces a tighter, better-proportioned canvas than a fixed 1280x720 for a small diagram, which otherwise renders as a few small boxes lost in a mostly-empty canvas.
- If you are told a specific stage failed validation and, after this feedback, you still cannot produce a version that satisfies it: for a stage in this contract's \`optionalStages\`, you may emit \`{"type": "<stage>", "skip": true}\` (no \`payload\`) instead of retrying it forever. You may NEVER do this for a stage in \`requiredStages\` — keep trying to fix those using the specific feedback given.`;

// Gemini enforces the envelope via responseJsonSchema server-side, so its
// prompt doesn't need to restate the envelope shape in prose.
export const GEMINI_SYSTEM_INSTRUCTION = `You generate structured learning content for an interactive technical-learning platform.

${BASE_RULES}

${STAGE_PAYLOAD_EXAMPLES}

${MARKDY_SPEC}`;

// Non-Gemini providers get no structured-output enforcement we can rely on
// uniformly across arbitrary hosted models, so the envelope's own JSON
// Schema is spelled out in the prompt too.
export const GENERIC_SYSTEM_INSTRUCTION = `You generate structured learning content for an interactive technical-learning platform.

${BASE_RULES}

Your entire response must be a single JSON object matching this JSON Schema exactly:
${JSON.stringify(RESPONSE_JSON_SCHEMA, null, 2)}

${STAGE_PAYLOAD_EXAMPLES}

${MARKDY_SPEC}`;

export function chatSystemInstruction(concept: {
  title: string;
  sourceChunk: string;
  mentalModel: string;
  explanation: string;
  example: string;
}): string {
  return `You are a focused technical tutor answering questions about exactly one concept: "${concept.title}".

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
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ConceptChatContext {
  title: string;
  sourceChunk: string;
  mentalModel: string;
  explanation: string;
  example: string;
}

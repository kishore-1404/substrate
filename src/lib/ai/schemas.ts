import { z } from "zod";

// Mirrors ExperienceStageType in experience_spec_replication_lag.md §1.
export const STAGE_TYPES = [
  "mental_model",
  "visualization",
  "explanation",
  "example",
  "simulation",
  "decision",
  "consequence",
  "assessment",
  "mastery_update",
] as const;

// Which stages the model is ever allowed to author. `simulation` gets an
// engine-owned config schema (not free text); `consequence` and
// `mastery_update` are computed, never requested from Gemini.
export const GEMINI_STAGE_TYPES = [
  "mental_model",
  "visualization",
  "explanation",
  "example",
  "simulation",
  "decision",
  "assessment",
] as const;

const mentalModelPayload = z.object({
  text: z.string().min(20),
});

const visualizationPayload = z.object({
  markdy: z.string().min(20), // raw MarkdyScript source, validated separately
});

const explanationPayload = z.object({
  text: z.string().min(20),
});

const examplePayload = z.object({
  scenario: z.string().min(10),
});

// Gemini authors only the scenario — the physics are fixed engine code
// (spec §2/§3). Keep this schema tight so the model can't smuggle logic in.
const simulationPayload = z.object({
  initialReplicaCount: z.number().int().min(1).max(5),
  trafficPattern: z.enum(["steady", "bursty", "spike"]),
  injectedFault: z.enum(["none", "network_partition", "follower_overload"]).default("none"),
  minLagSeconds: z.number().min(0),
  maxLagSeconds: z.number().min(0),
});

// Each choice carries its OWN consequence — the frontend used to compute
// consequence text from a hardcoded "leader"/"follower" ternary, which was
// simply wrong for any concept whose decision isn't literally that binary
// (i.e. every concept except replication_lag). Consequence must be
// data-driven from what Gemini actually generated for this choice.
const decisionChoice = z.object({
  id: z.string(),
  label: z.string(),
  consequence: z.string().min(10),
});

const decisionPayload = z.object({
  prompt: z.string().min(10),
  choices: z.array(decisionChoice).min(2),
});

// Gemini has a strong prior toward flattening MCQ options instead of using
// `{id, label}` objects — confirmed persistent across the retry-with-
// feedback loop (not a one-off), and observed in at least three different
// shapes across separate generations:
//   1. `options: [{id, label}, ...]`                      — the canonical shape
//   2. `options: string[]` + a parallel `labels: string[]`
//   3. `options: string[]` alternating short id, long label, id, label, ...
// Rather than keep fighting a model habit with prompt wording, normalize
// all three into the canonical shape here.
const optionSchema = z.union([
  z.object({ id: z.string(), label: z.string() }),
  z.string(),
]);

const rawAssessmentQuestion = z.object({
  id: z.string(),
  prompt: z.string().min(10),
  options: z.array(optionSchema).min(2),
  labels: z.array(z.string()).optional(),
  correctOptionId: z.string(),
});

const SHORT_TOKEN = /^[a-zA-Z0-9]{1,3}$/;

function normalizeOptions(
  options: (string | { id: string; label: string })[],
  labels?: string[]
): { id: string; label: string }[] {
  if (options.every((o) => typeof o === "object")) {
    return options as { id: string; label: string }[];
  }
  const strOptions = options as string[];

  // Shape 2: parallel `labels` array.
  if (labels && labels.length === strOptions.length) {
    return strOptions.map((id, i) => ({ id, label: labels[i] }));
  }

  // Shape 3: alternating short-token/long-text pairs in one flat array.
  if (
    strOptions.length % 2 === 0 &&
    strOptions.every((s, i) => (i % 2 === 0 ? SHORT_TOKEN.test(s) : !SHORT_TOKEN.test(s)))
  ) {
    const pairs: { id: string; label: string }[] = [];
    for (let i = 0; i < strOptions.length; i += 2) pairs.push({ id: strOptions[i], label: strOptions[i + 1] });
    return pairs;
  }

  // Fallback shape 1b: plain option strings with no ids at all — assign by position.
  return strOptions.map((label, i) => ({ id: String.fromCharCode(97 + i), label }));
}

const assessmentQuestion = rawAssessmentQuestion.transform((q) => ({
  id: q.id,
  prompt: q.prompt,
  correctOptionId: q.correctOptionId,
  options: normalizeOptions(q.options, q.labels),
}));

const assessmentPayload = z.object({
  questions: z.array(assessmentQuestion).min(1),
});

export const stagePayloadSchemas = {
  mental_model: mentalModelPayload,
  visualization: visualizationPayload,
  explanation: explanationPayload,
  example: examplePayload,
  simulation: simulationPayload,
  decision: decisionPayload,
  assessment: assessmentPayload,
} satisfies Record<(typeof GEMINI_STAGE_TYPES)[number], z.ZodTypeAny>;

// `skip: true` is Gemini's explicit escape hatch: after being told why a
// stage's payload keeps failing validation, it may give up on that stage
// instead of endlessly retrying garbage. Only stages the Generation
// Contract marks optional may actually be dropped this way — see
// pipeline.ts's validateNode, which rejects a skip on a required stage as
// just another validation error (feeding back into another retry).
export const generatedStageSchema = z.object({
  type: z.enum(GEMINI_STAGE_TYPES),
  skip: z.boolean().optional(),
  payload: z.unknown().optional(),
});

// Top-level shape Gemini must return for a `generate_experience` task.
export const experienceGenerationSchema = z.object({
  title: z.string().min(5),
  stages: z.array(generatedStageSchema).min(1),
});

export type ExperienceGeneration = z.infer<typeof experienceGenerationSchema>;

// ---------------------------------------------------------------------------
// Generation Contract — placed into the Context Builder's `generation` field.
// ---------------------------------------------------------------------------

export interface GenerationContract {
  task: "generate_experience" | "generate_explanation" | "generate_assessment";
  outputSchema: "ExperienceV1";
  conceptSlug: string;
  markdyVersion: string;
  difficulty: 1 | 2 | 3;
  requiredStages: (typeof GEMINI_STAGE_TYPES)[number][];
  optionalStages: (typeof GEMINI_STAGE_TYPES)[number][];
  visualPrimitives: {
    allowedCues: string[];
    allowedNodeKinds: string[];
    maxNodes: number;
  };
  assessmentContract: {
    questionCount: number;
    mustIncludeAnswerKey: true;
    mustBeObjectivelyScorable: true;
  };
}

// Used for any concept EXCEPT replication_lag (see below) — broad enough to
// diagram most DDIA concepts (clients, services, storage, messaging,
// distributed-systems roles) without being the unbounded ~150-kind catalog.
const DEFAULT_NODE_KINDS = [
  "client",
  "browser",
  "user",
  "service",
  "api",
  "microservice",
  "worker",
  "lambda",
  "function",
  "gateway",
  "api_gateway",
  "load_balancer",
  "proxy",
  "cdn",
  "database",
  "cache",
  "storage",
  "warehouse",
  "queue",
  "topic",
  "broker",
  "event_bus",
  "auth",
  "monitor",
  "leader",
  "follower",
  "replica",
  "shard",
  "quorum",
  "consensus",
];

export function contractForConcept(conceptSlug: string): GenerationContract {
  if (conceptSlug === "replication_lag") return REPLICATION_LAG_CONTRACT;
  return {
    task: "generate_experience",
    outputSchema: "ExperienceV1",
    conceptSlug,
    markdyVersion: "1.0.30",
    difficulty: 2,
    requiredStages: ["mental_model", "visualization", "explanation", "example", "decision", "assessment"],
    optionalStages: ["simulation"],
    visualPrimitives: {
      allowedCues: ["show", "hide", "frame", "glow", "focus"],
      allowedNodeKinds: DEFAULT_NODE_KINDS,
      maxNodes: 8,
    },
    assessmentContract: {
      questionCount: 3,
      mustIncludeAnswerKey: true,
      mustBeObjectivelyScorable: true,
    },
  };
}

export const REPLICATION_LAG_CONTRACT: GenerationContract = {
  task: "generate_experience",
  outputSchema: "ExperienceV1",
  conceptSlug: "replication_lag",
  markdyVersion: "1.0.30",
  difficulty: 2,
  requiredStages: ["mental_model", "visualization", "explanation", "example", "decision", "assessment"],
  optionalStages: ["simulation"],
  visualPrimitives: {
    allowedCues: ["show", "hide", "frame", "glow", "focus"],
    // "leader"/"follower" are Markdy's own Distributed Systems node kinds —
    // a direct semantic match for this concept, not a generic
    // service/database stand-in (see markdy-spec.md's node kind table).
    allowedNodeKinds: ["client", "leader", "follower", "replica"],
    maxNodes: 8,
  },
  assessmentContract: {
    questionCount: 3,
    mustIncludeAnswerKey: true,
    mustBeObjectivelyScorable: true,
  },
};

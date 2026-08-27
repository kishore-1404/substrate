import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { buildContext, type ContextPackage } from "./context-builder";
import { generateExperience, regenerateWithFeedback } from "./gemini";
import { validateMarkdy } from "./markdy-validate";
import {
  experienceGenerationSchema,
  stagePayloadSchemas,
  type ExperienceGeneration,
  type GenerationContract,
} from "./schemas";
import { persistExperience } from "./persist";

// The Context Builder -> Gemini -> Validation -> Persist flow from handoff §9
// and experience_spec_replication_lag.md §5, expressed as a LangGraph state
// machine. Using a graph (rather than a linear function) is what lets us
// retry exactly the failed step with feedback, cap retries, and keep each
// stage's state (context, raw output, errors) inspectable/resumable instead
// of buried in a call stack — this is the "maintains progress properly"
// requirement: every run's state is a first-class object, not implicit.

const PipelineState = Annotation.Root({
  userId: Annotation<string>(),
  conceptSlug: Annotation<string>(),
  contract: Annotation<GenerationContract>(),
  userRequest: Annotation<string | undefined>(),

  context: Annotation<ContextPackage | undefined>(),
  rawOutput: Annotation<string | undefined>(),
  parsed: Annotation<ExperienceGeneration | undefined>(),

  errors: Annotation<string[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  attempt: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),

  status: Annotation<"pending" | "validated" | "failed">({
    reducer: (_prev, next) => next,
    default: () => "pending",
  }),
  experienceId: Annotation<string | undefined>(),
});

type State = typeof PipelineState.State;

// A stage keeps retrying with feedback until it's valid — the intended exit
// is Gemini explicitly emitting `skip: true` on an OPTIONAL stage once it
// can't fix it (see schemas.ts's generatedStageSchema), not an attempt
// count. This cap is a safety net against a truly stuck required stage
// burning cost/latency forever, not the primary stopping condition.
const MAX_ATTEMPTS = 6;

async function buildContextNode(state: State): Promise<Partial<State>> {
  const context = await buildContext({
    userId: state.userId,
    conceptSlug: state.conceptSlug,
    contract: state.contract,
    userRequest: state.userRequest,
  });
  return { context };
}

async function generateNode(state: State): Promise<Partial<State>> {
  if (!state.context) throw new Error("generateNode ran before context was built");

  const rawOutput =
    state.attempt === 0
      ? await generateExperience(state.context)
      : await regenerateWithFeedback(state.context, state.rawOutput ?? "", state.errors);

  return { rawOutput, attempt: state.attempt + 1 };
}

function validateNode(state: State): Partial<State> {
  const errors: string[] = [];
  let rawParsed: ExperienceGeneration | undefined;

  // 1. JSON / schema validation
  try {
    const json = JSON.parse(state.rawOutput ?? "");
    const result = experienceGenerationSchema.safeParse(json);
    if (!result.success) {
      errors.push(...result.error.issues.map((i) => `schema: ${i.path.join(".")} — ${i.message}`));
    } else {
      rawParsed = result.data;
    }
  } catch {
    errors.push("schema: response was not valid JSON");
  }

  if (!rawParsed) return { errors, status: "pending" };

  const contract = state.context!.generation;
  // The stages that survive validation, using each stage schema's
  // VALIDATED/transformed `result.data` — not the raw payload off the
  // wire. (Previously this used the raw payload, silently discarding
  // schemas.ts's option-shape normalization before persistence.)
  const keptStages: ExperienceGeneration["stages"] = [];

  for (const stage of rawParsed.stages) {
    if (stage.skip) {
      if ((contract.requiredStages as string[]).includes(stage.type)) {
        errors.push(`${stage.type}: cannot skip a required stage — this contract requires it.`);
      }
      // Optional + explicitly skipped: dropped, not an error, loop moves on.
      continue;
    }

    const stageSchema = stagePayloadSchemas[stage.type];
    const result = stageSchema.safeParse(stage.payload);
    if (!result.success) {
      errors.push(...result.error.issues.map((i) => `${stage.type}: ${i.path.join(".")} — ${i.message}`));
      continue;
    }

    if (stage.type === "visualization") {
      const { markdy } = result.data as { markdy: string };
      const markdyResult = validateMarkdy(markdy, contract.visualPrimitives);
      if (!markdyResult.ok) errors.push(...markdyResult.errors.map((e) => `markdy: ${e}`));
    }

    keptStages.push({ type: stage.type, payload: result.data });
  }

  // 4. Content constraints — required stages present (and not skipped)
  const presentTypes = new Set(keptStages.map((s) => s.type));
  for (const required of contract.requiredStages) {
    if (!presentTypes.has(required)) errors.push(`constraints: missing required stage "${required}"`);
  }

  // 5. Canonical-meaning check — deterministic keyword guard. A generated
  // explanation/mental_model must not claim replication lag *is* a failure.
  const bannedClaims = [/replication lag means the write failed/i, /lag means data (was|is) lost/i];
  for (const stage of keptStages) {
    if (stage.type === "mental_model" || stage.type === "explanation") {
      const text = (stage.payload as { text?: string }).text ?? "";
      if (bannedClaims.some((re) => re.test(text))) {
        errors.push(`canonical: ${stage.type} contradicts canonical meaning of replication lag`);
      }
    }
  }

  const parsed: ExperienceGeneration = { title: rawParsed.title, stages: keptStages };
  return { parsed, errors, status: errors.length === 0 ? "validated" : "pending" };
}

function shouldRetry(state: State): "retry" | "persist" | "fail" {
  if (state.status === "validated") return "persist";
  if (state.attempt < MAX_ATTEMPTS) return "retry";
  return "fail";
}

async function persistNode(state: State): Promise<Partial<State>> {
  if (!state.parsed || !state.context) throw new Error("persistNode ran without validated output");
  const experienceId = await persistExperience({
    conceptSlug: state.conceptSlug,
    contract: state.contract,
    generation: state.parsed,
    userRequest: state.userRequest,
  });
  return { experienceId };
}

function failNode(): Partial<State> {
  // In production this would enqueue a human-review item instead of throwing.
  return { status: "failed" };
}

const graph = new StateGraph(PipelineState)
  .addNode("buildContext", buildContextNode)
  .addNode("generate", generateNode)
  .addNode("validate", validateNode)
  .addNode("persist", persistNode)
  .addNode("fail", failNode)
  .addEdge(START, "buildContext")
  .addEdge("buildContext", "generate")
  .addEdge("generate", "validate")
  .addConditionalEdges("validate", shouldRetry, {
    retry: "generate",
    persist: "persist",
    fail: "fail",
  })
  .addEdge("persist", END)
  .addEdge("fail", END);

export const experienceGenerationGraph = graph.compile();

export async function runExperienceGeneration(input: {
  userId: string;
  conceptSlug: string;
  contract: GenerationContract;
  userRequest?: string;
}) {
  return experienceGenerationGraph.invoke(input);
}

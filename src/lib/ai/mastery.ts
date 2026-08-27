// Deterministic mastery computation — spec §7. No LLM involved, ever, so the
// number stays fully inspectable and disputable.

export interface MasteryInputs {
  assessmentScore: number; // 0..1, fraction of questions correct
  decisionCorrect: boolean | null; // null if no decision stage in this experience
  simulationEngaged: boolean; // did the learner move the slider / vary params
}

const WEIGHTS = {
  assessment: 0.6,
  decision: 0.3,
  simulation: 0.1,
};

export function computeMasteryPct(inputs: MasteryInputs): number {
  const decisionScore = inputs.decisionCorrect === null ? inputs.assessmentScore : inputs.decisionCorrect ? 1 : 0;
  const simulationScore = inputs.simulationEngaged ? 1 : 0;

  const pct =
    inputs.assessmentScore * WEIGHTS.assessment +
    decisionScore * WEIGHTS.decision +
    simulationScore * WEIGHTS.simulation;

  return Math.round(pct * 100);
}

export const MASTERY_REVISION_THRESHOLD = 60;

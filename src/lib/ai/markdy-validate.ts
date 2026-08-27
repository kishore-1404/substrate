// MarkdyScript validation for generated diagrams, using Markdy's own
// authoritative parser/linter (@markdy/core) instead of an approximation of
// its rules. `diagnoseMarkdyCode` implements the exact hallucination-guard
// checks documented in markdy-spec.md (missing beat colons, `->` used for a
// response, cues outside beats, undefined node references, typo'd
// keywords/node-kinds with fuzzy "did you mean" matching) as real code, not
// regex heuristics — this runs inside our own request path (not via
// @markdy/mcp-server, which is a dev-time IDE tool) so a bad generation
// never reaches a learner.
//
// What @markdy/core does NOT know about is our product-level restrictions —
// which of Markdy's ~150 valid node kinds and 5 cues a given Generation
// Contract actually allows (see schemas.ts's visualPrimitives). Those
// contract-specific checks are the only logic left below.
import { diagnoseMarkdyCode, parse, type Cue } from "@markdy/core";

export interface MarkdyValidationResult {
  ok: boolean;
  errors: string[];
}

function flattenCues(cues: Cue[]): Cue[] {
  return cues.flatMap((cue) => (cue.kind === "parallel" ? flattenCues(cue.cues) : [cue]));
}

export function validateMarkdy(
  code: string,
  opts: { allowedCues: string[]; allowedNodeKinds: string[]; maxNodes: number }
): MarkdyValidationResult {
  const errors: string[] = [];

  // Real syntax/governance diagnostics from Markdy's own linter.
  const report = diagnoseMarkdyCode(code);
  for (const issue of report.issues) {
    if (issue.severity !== "error") continue;
    const hint = issue.didYouMean ? ` (did you mean "${issue.didYouMean}"?)` : "";
    errors.push(`Line ${issue.line}: ${issue.message}${hint}`);
  }

  // Contract-specific restrictions Markdy itself has no concept of.
  try {
    const ast = parse(code, { parseOnly: true });

    const nodes = Object.values(ast.nodes);
    if (nodes.length > opts.maxNodes) {
      errors.push(`Diagram declares ${nodes.length} nodes, exceeding maxNodes=${opts.maxNodes}.`);
    }
    for (const node of nodes) {
      if (opts.allowedNodeKinds.length && !opts.allowedNodeKinds.includes(node.kind)) {
        errors.push(
          `Line ${node.line}: node kind "${node.kind}" (id ${node.id}) is not in this Generation Contract's allowed set [${opts.allowedNodeKinds.join(", ")}].`
        );
      }
    }

    for (const beat of ast.beats) {
      for (const cue of flattenCues(beat.cues)) {
        if (cue.kind === "flow" || cue.kind === "use") continue;
        if (!opts.allowedCues.includes(cue.kind)) {
          errors.push(`Line ${cue.line}: cue "${cue.kind}" is not in this Generation Contract's allowed set (${opts.allowedCues.join(", ")}).`);
        }
      }
    }
  } catch (err) {
    errors.push(`Parse error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { ok: errors.length === 0, errors };
}

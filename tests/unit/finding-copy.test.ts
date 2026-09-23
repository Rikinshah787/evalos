import { describe, expect, it } from "vitest";
import { explainFinding, failureLabel } from "@/lib/finding-copy";
import type { EvaluationResult } from "@/lib/types";

describe("finding copy", () => {
  it("explains loop findings in plain English", () => {
    const evaluation: EvaluationResult = {
      runId: "run_1",
      evaluatorId: "eval",
      evaluatorVersion: "0.2.0",
      evaluatorKind: "deterministic",
      passed: false,
      score: 32,
      risk: "high",
      outcome: "failed",
      failureType: "loop_detected",
      reason: "The same tool action repeated several times, suggesting an agent loop.",
      suggestedAssertion: "Stop repeating.",
      reviewPriority: 90,
      evidence: [],
      jev: {
        schema: "jev.eval.v1",
        judge: { kind: "deterministic", id: "eval", version: "0.2.0", checks: [] },
        evidence: [],
        verdict: {
          status: "fail",
          score: 32,
          failureType: "loop_detected",
          reason: "loop",
          assertion: "stop"
        }
      }
    };

    expect(failureLabel("loop_detected")).toBe("Same tool call repeated with the same inputs");
    const copy = explainFinding(evaluation);
    expect(copy.scoreLine).toContain("Triage signal 32/100");
    expect(copy.scoreLine).toMatch(/not a final grade/i);
    expect(copy.nextStep).toMatch(/Confirm|Reject/i);
  });
});

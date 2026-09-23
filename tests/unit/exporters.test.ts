import { describe, expect, it } from "vitest";
import { evaluateRun } from "@/lib/evaluator";
import { exportJsonl, exportPromptfoo, exportPytest, toEvalCase } from "@/lib/exporters";
import type { AgentRun, EvaluatedRun, ReviewRecord } from "@/lib/types";

function evaluatedRun(): EvaluatedRun {
  const run: AgentRun = {
    id: "run_export",
    source: "json",
    agentName: "claude-code",
    framework: "claude-code",
    environment: "development",
    startedAt: "2026-09-22T05:00:00.000Z",
    input: [{ role: "user", content: "Fix the failing test" }],
    steps: [
      {
        id: "step_tool",
        traceId: "trace_export",
        type: "tool_call",
        name: "edit_file",
        error: "Patch failed"
      }
    ],
    finalOutput: "I cannot apply the patch."
  };

  return { ...run, evaluation: evaluateRun(run) };
}

describe("exporters", () => {
  it("creates an eval case using reviewed expected behavior", () => {
    const run = evaluatedRun();
    const review: ReviewRecord = {
      runId: run.id,
      status: "confirmed",
      category: "tool_error",
      expectedBehavior: "The agent should recover from a failed patch by inspecting the file.",
      reviewer: "tester",
      updatedAt: "2026-09-22T06:00:00.000Z"
    };

    const testCase = toEvalCase(run, review);

    expect(testCase).toMatchObject({
      id: "case_run_export",
      datasetId: "production-failures",
      expected: {
        failureType: "tool_error",
        assertion: "The agent should recover from a failed patch by inspecting the file."
      },
      metadata: {
        traceId: "trace_export",
        evidenceStepIds: ["step_tool"],
        reviewedBy: "tester"
      }
    });
  });

  it("exports JSONL, Promptfoo, and pytest formats", () => {
    const run = evaluatedRun();

    expect(exportJsonl([run])).toContain('"id":"case_run_export"');
    expect(exportPromptfoo([run])).toContain("description: EvalOS exported regression set");
    expect(exportPytest([run])).toContain("def test_agent_regression(case):");
  });
});

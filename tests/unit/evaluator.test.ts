import { describe, expect, it } from "vitest";
import { evaluateRun } from "@/lib/evaluator";
import type { AgentRun } from "@/lib/types";

function baseRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: "run_eval",
    source: "json",
    agentName: "test-agent",
    framework: "test",
    environment: "development",
    startedAt: "2026-09-22T05:00:00.000Z",
    input: [{ role: "user", content: "Refund my order" }],
    steps: [],
    finalOutput: "Done.",
    ...overrides
  };
}

describe("evaluateRun", () => {
  it("detects tool errors and attaches exact JEV evidence", () => {
    const result = evaluateRun(
      baseRun({
        steps: [
          {
            id: "step_tool",
            traceId: "trace_1",
            spanId: "span_tool",
            type: "tool_call",
            name: "lookup_order",
            error: "Missing order id",
            sourceUrl: "https://trace.example/step_tool"
          }
        ],
        finalOutput: "I cannot help."
      })
    );

    expect(result.failureType).toBe("tool_error");
    expect(result.evidence).toEqual([
      expect.objectContaining({
        stepId: "step_tool",
        traceId: "trace_1",
        spanId: "span_tool",
        quote: "Missing order id"
      })
    ]);
    expect(result.jev).toMatchObject({
      schema: "jev.eval.v1",
      judge: {
        kind: "deterministic",
        id: "evalos.deterministic.agent_run"
      },
      verdict: {
        status: "fail",
        failureType: "tool_error"
      }
    });
    expect(result.jev.evidence[0]).toMatchObject({
      runId: "run_eval",
      stepId: "step_tool",
      sourceUrl: "https://trace.example/step_tool"
    });
  });

  it("detects repeated identical tool calls as a loop", () => {
    const result = evaluateRun(
      baseRun({
        input: [{ role: "user", content: "Update shipping address" }],
        steps: [1, 2, 3].map((index) => ({
          id: `step_${index}`,
          type: "tool_call",
          name: "browser.click",
          output: "clicked login"
        })),
        finalOutput: "I was unable to complete the update."
      })
    );

    expect(result.failureType).toBe("loop_detected");
    expect(result.evidence.map((item) => item.stepId)).toEqual(["step_1", "step_2", "step_3"]);
  });
});

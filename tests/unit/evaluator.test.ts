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
          input: { selector: "#login" },
          output: "clicked login"
        })),
        finalOutput: "I was unable to complete the update."
      })
    );

    expect(result.failureType).toBe("loop_detected");
    expect(result.evidence.map((item) => item.stepId)).toEqual(["step_1", "step_2", "step_3"]);
  });

  it("does not flag a long productive session that reuses tools with different inputs", () => {
    const result = evaluateRun(
      baseRun({
        input: [{ role: "user", content: "Build the EvalOS persistence layer" }],
        steps: [
          { id: "a", type: "tool_call", name: "Shell", input: { command: "npm test" } },
          { id: "b", type: "tool_call", name: "Shell", input: { command: "npm run lint" } },
          { id: "c", type: "tool_call", name: "Shell", input: { command: "npm run typecheck" } },
          { id: "d", type: "tool_call", name: "Read", input: { path: "lib/evaluator.ts" } },
          { id: "e", type: "tool_call", name: "Write", input: { path: "lib/evaluator.ts" } },
          { id: "f", type: "tool_call", name: "Read", input: { path: "app/page.tsx" } }
        ],
        finalOutput: "Persistence and review flow are in place."
      })
    );

    expect(result.failureType).toBe("none");
    expect(result.passed).toBe(true);
  });

  it("does not treat the word timeout in chat or docs as a run timeout", () => {
    const result = evaluateRun(
      baseRun({
        input: [
          {
            role: "user",
            content:
              "Continue the architecture. Detect timeouts properly. The run hit a timeout is bad copy for false alarms."
          }
        ],
        steps: [
          {
            id: "step_read",
            type: "tool_call",
            name: "Read",
            input: { path: "docs/architecture.md" },
            output: "Timeout handling: prefer step.error timed out over substring timeout."
          },
          {
            id: "step_write",
            type: "tool_call",
            name: "Write",
            input: { path: "lib/evaluator.ts" },
            output: "updated timeout detector"
          }
        ],
        finalOutput: "Timeout detector fixed so mentioning timeout in a prompt no longer fails the run."
      })
    );

    expect(result.failureType).toBe("none");
    expect(result.passed).toBe(true);
  });

  it("flags real timed-out tool errors with evidence on that step", () => {
    const result = evaluateRun(
      baseRun({
        steps: [
          {
            id: "step_ok",
            type: "tool_call",
            name: "Shell",
            output: "ok"
          },
          {
            id: "step_timeout",
            traceId: "trace_t",
            spanId: "span_t",
            type: "tool_call",
            name: "GetDynamicTools",
            error: "Request timed out after 30000ms"
          }
        ],
        finalOutput: "Stopped early."
      })
    );

    expect(result.failureType).toBe("timeout");
    expect(result.evidence).toEqual([
      expect.objectContaining({
        stepId: "step_timeout",
        quote: "Request timed out after 30000ms"
      })
    ]);
  });
});

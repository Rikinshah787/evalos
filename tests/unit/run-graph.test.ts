import { describe, expect, it } from "vitest";
import { evaluateRun } from "@/lib/evaluator";
import { buildRunGraph } from "@/lib/run-graph";
import type { AgentRun } from "@/lib/types";

describe("run graph", () => {
  it("builds nodes and edges from a real evaluated run", () => {
    const run: AgentRun = {
      id: "run_graph_1",
      source: "json",
      agentName: "custom-agent",
      framework: "custom",
      environment: "development",
      startedAt: "2026-09-23T12:00:00.000Z",
      model: "my-model",
      input: [{ role: "user", content: "Ship the order" }],
      steps: [
        {
          id: "step_1",
          spanId: "span_1",
          type: "tool_call",
          name: "ship_order",
          error: "warehouse timeout",
          durationMs: 200
        }
      ],
      finalOutput: "Could not ship."
    };

    const evaluated = { ...run, evaluation: evaluateRun(run) };
    const graph = buildRunGraph(evaluated);

    expect(graph.engine).toBe("sqlite-property-graph");
    expect(graph.nodes.some((node) => node.kind === "run")).toBe(true);
    expect(graph.nodes.some((node) => node.kind === "tool" || node.kind === "error")).toBe(true);
    expect(graph.nodes.some((node) => node.kind === "verdict")).toBe(true);
    expect(graph.edges.length).toBeGreaterThan(0);
  });
});

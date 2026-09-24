import { describe, expect, it } from "vitest";
import { buildTraceTree, formatDuration } from "@/lib/trace-tree";
import type { AgentRun } from "@/lib/types";

describe("buildTraceTree", () => {
  it("nests child spans and rolls up duration", () => {
    const run: AgentRun = {
      id: "run_1",
      source: "json",
      agentName: "cursor",
      framework: "cursor",
      environment: "development",
      startedAt: "2026-09-23T00:00:00.000Z",
      input: [{ role: "user", content: "fix it" }],
      steps: [
        { id: "root", spanId: "s1", type: "message", name: "agent", durationMs: 100 },
        { id: "child", spanId: "s2", parentSpanId: "s1", type: "tool_call", name: "Shell", durationMs: 400 },
        { id: "fail", spanId: "s3", parentSpanId: "s2", type: "error", name: "Write", error: "failed", durationMs: 50 }
      ],
      finalOutput: "done",
      latencyMs: 550
    };

    const tree = buildTraceTree(run);
    expect(tree.spanCount).toBe(3);
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0]?.children[0]?.step.name).toBe("Shell");
    expect(tree.roots[0]?.children[0]?.children[0]?.step.error).toBe("failed");
    expect(formatDuration(12400)).toBe("12.4s");
  });

  it("does not invent 220ms per tool when duration is unknown", () => {
    const run: AgentRun = {
      id: "run_nodur",
      source: "json",
      agentName: "cursor",
      framework: "cursor",
      environment: "development",
      startedAt: "2026-09-23T00:00:00.000Z",
      input: [{ role: "user", content: "inspect" }],
      steps: Array.from({ length: 40 }, (_, index) => ({
        id: `step_${index}`,
        type: "tool_call" as const,
        name: "Read"
      })),
      finalOutput: "done"
    };

    const tree = buildTraceTree(run);
    expect(tree.totalMs).toBe(1);
    expect(tree.roots.every((node) => node.durationMs === 0)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { evaluateRun } from "@/lib/evaluator";
import { failureFingerprint, groupIssues } from "@/lib/issues";
import type { AgentRun } from "@/lib/types";

function toolErrorRun(id: string): AgentRun {
  return {
    id,
    source: "json",
    agentName: "agent",
    framework: "test",
    environment: "development",
    startedAt: "2026-09-23T12:00:00.000Z",
    input: [{ role: "user", content: "fix it" }],
    steps: [
      {
        id: "step_1",
        type: "tool_call",
        name: "edit_file",
        error: "Patch failed"
      }
    ],
    finalOutput: "Patch failed."
  };
}

describe("issue grouping", () => {
  it("groups identical failure fingerprints", () => {
    const a = { ...toolErrorRun("a"), evaluation: evaluateRun(toolErrorRun("a")) };
    const b = { ...toolErrorRun("b"), evaluation: evaluateRun(toolErrorRun("b")) };
    expect(failureFingerprint(a)).toBe(failureFingerprint(b));

    const groups = groupIssues([a, b], {});
    expect(groups).toHaveLength(1);
    expect(groups[0]?.count).toBe(2);
    expect(groups[0]?.runIds).toEqual(["a", "b"]);
  });
});

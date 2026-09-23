import { describe, expect, it } from "vitest";
import { parseCursorTranscript } from "@/lib/cursor-transcript";

describe("parseCursorTranscript", () => {
  it("builds a traced run from real Cursor transcript rows", () => {
    const raw = [
      JSON.stringify({
        role: "user",
        message: { content: [{ type: "text", text: "Build EvalOS with real traces" }] }
      }),
      JSON.stringify({
        role: "assistant",
        message: {
          content: [
            { type: "text", text: "Working on persistence." },
            { type: "tool_use", name: "Shell", input: { command: "npm test" }, id: "tool_1" },
            {
              type: "tool_use",
              name: "Write",
              input: { path: "lib/db/schema.ts" },
              is_error: true,
              error: "disk full"
            }
          ]
        }
      })
    ].join("\n");

    const run = parseCursorTranscript(raw, {
      conversationId: "8e8c03d8-test",
      transcriptPath: "C:/tmp/session.jsonl"
    });

    expect(run.id).toBe("cursor_8e8c03d8-test");
    expect(run.agentName).toBe("cursor");
    expect(run.input[0]?.content).toContain("Build EvalOS");
    expect(run.steps.some((step) => step.name === "Shell")).toBe(true);
    expect(run.steps.some((step) => step.error === "disk full")).toBe(true);
    expect(run.steps.every((step) => step.traceId)).toBe(true);
    expect(run.sourceUrl).toContain("session.jsonl");
  });
});

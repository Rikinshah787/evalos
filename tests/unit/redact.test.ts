import { describe, expect, it } from "vitest";
import { redactRun, redactText } from "@/lib/redact";
import type { AgentRun } from "@/lib/types";

describe("redact", () => {
  it("redacts common API keys from text", () => {
    expect(redactText("token sk-abcdefghijklmnopqrstuvwxyz1234 here")).toContain("[REDACTED:openai_key]");
    expect(redactText("Authorization: Bearer abcdefghijklmnop")).toContain("[REDACTED:bearer]");
  });

  it("redacts secrets inside a run payload", () => {
    const run: AgentRun = {
      id: "run_secret",
      source: "json",
      agentName: "agent",
      framework: "test",
      environment: "development",
      startedAt: "2026-09-23T12:00:00.000Z",
      input: [{ role: "user", content: "use sk-abcdefghijklmnopqrstuvwxyz1234" }],
      steps: [
        {
          id: "s1",
          type: "tool_call",
          name: "shell",
          input: { cmd: "export OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz1234" },
          output: "ok"
        }
      ],
      finalOutput: "done sk-abcdefghijklmnopqrstuvwxyz1234"
    };

    const redacted = redactRun(run);
    expect(redacted.input[0]?.content).toContain("[REDACTED:openai_key]");
    expect(JSON.stringify(redacted.steps[0]?.input)).toContain("[REDACTED:openai_key]");
    expect(redacted.finalOutput).toContain("[REDACTED:openai_key]");
  });
});

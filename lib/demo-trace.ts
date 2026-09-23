import type { AgentRun } from "./types";

/** Bundled failure used by Dashboard → Load demo. */
export const demoTrace: AgentRun = {
  id: "demo_tool_error_001",
  source: "json",
  agentName: "claude-code",
  framework: "claude-code",
  environment: "development",
  startedAt: "2026-09-23T20:00:00.000Z",
  model: "claude-sonnet-4",
  promptVersion: "evalos-demo-v1",
  sourceUrl: "evalos://demo/tool-error",
  totalCostUsd: 0.042,
  latencyMs: 6800,
  input: [
    {
      role: "user",
      content: "Update the README install section and run the unit tests."
    }
  ],
  steps: [
    {
      id: "step_read",
      traceId: "trace_demo_001",
      spanId: "span_read",
      type: "tool_call",
      name: "Read",
      input: { path: "README.md" },
      output: { ok: true },
      durationMs: 120,
      startedAt: "2026-09-23T20:00:01.000Z",
      endedAt: "2026-09-23T20:00:01.120Z"
    },
    {
      id: "step_edit",
      traceId: "trace_demo_001",
      spanId: "span_edit",
      parentSpanId: "span_read",
      type: "tool_call",
      name: "Edit",
      input: { path: "README.md", old_string: "## Install", new_string: "## Quick Start" },
      error: "String to replace not found in file.",
      durationMs: 80,
      startedAt: "2026-09-23T20:00:02.000Z",
      endedAt: "2026-09-23T20:00:02.080Z"
    },
    {
      id: "step_edit_retry",
      traceId: "trace_demo_001",
      spanId: "span_edit_retry",
      parentSpanId: "span_edit",
      type: "tool_call",
      name: "Edit",
      input: { path: "README.md", old_string: "## Install", new_string: "## Quick Start" },
      error: "String to replace not found in file.",
      durationMs: 70,
      startedAt: "2026-09-23T20:00:03.000Z",
      endedAt: "2026-09-23T20:00:03.070Z"
    }
  ],
  finalOutput: "I could not update the README because the edit failed twice.",
  metadata: {
    demo: true,
    failureTypeHint: "tool_error"
  }
};

import { describe, expect, it } from "vitest";
import { parseRunsFromJson } from "@/lib/importer";

describe("parseRunsFromJson", () => {
  it("normalizes neutral JSON runs and preserves trace metadata", () => {
    const [run] = parseRunsFromJson(
      JSON.stringify({
        id: "run_1",
        agentName: "support-agent",
        framework: "custom",
        environment: "production",
        sourceUrl: "https://trace.example/run_1",
        totalCostUsd: 0.12,
        latencyMs: 4200,
        input: [{ role: "user", content: "Refund my order" }],
        steps: [
          {
            id: "step_1",
            traceId: "trace_1",
            spanId: "span_1",
            type: "tool_call",
            name: "lookup_order",
            error: "Missing order id",
            durationMs: 300,
            costUsd: 0.01
          }
        ],
        finalOutput: "I cannot help."
      })
    );

    expect(run).toMatchObject({
      id: "run_1",
      source: "json",
      agentName: "support-agent",
      framework: "custom",
      environment: "production",
      sourceUrl: "https://trace.example/run_1",
      totalCostUsd: 0.12,
      latencyMs: 4200
    });
    expect(run.steps[0]).toMatchObject({
      traceId: "trace_1",
      spanId: "span_1",
      type: "tool_call",
      error: "Missing order id"
    });
  });

  it("normalizes OpenTelemetry resource spans into one run per trace", () => {
    const [run] = parseRunsFromJson(
      JSON.stringify({
        resourceSpans: [
          {
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: "trace_otel",
                    spanId: "root",
                    name: "agent.run",
                    startTimeUnixNano: "1790000000000000000",
                    endTimeUnixNano: "1790000002000000000",
                    attributes: [
                      { key: "service.name", value: { stringValue: "claude-code" } },
                      { key: "agent.input", value: { stringValue: "Fix the test" } }
                    ]
                  },
                  {
                    traceId: "trace_otel",
                    spanId: "tool",
                    parentSpanId: "root",
                    name: "tool.edit_file",
                    status: { code: "STATUS_CODE_ERROR", message: "Patch failed" }
                  }
                ]
              }
            ]
          }
        ]
      })
    );

    expect(run.source).toBe("opentelemetry");
    expect(run.metadata?.traceId).toBe("trace_otel");
    expect(run.steps).toHaveLength(2);
    expect(run.steps[1]).toMatchObject({
      traceId: "trace_otel",
      spanId: "tool",
      parentSpanId: "root",
      error: "Patch failed"
    });
  });
});

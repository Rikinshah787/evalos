import type { AgentRun } from "./types";
import { isOpenTelemetryPayload, parseOpenTelemetryRuns } from "./opentelemetry";

export function parseRunsFromJson(raw: string): AgentRun[] {
  const parsed = JSON.parse(raw) as unknown;
  if (isOpenTelemetryPayload(parsed)) return parseOpenTelemetryRuns(parsed);
  const runs = Array.isArray(parsed) ? parsed : [parsed];
  return runs.map((run, index) => normalizeRun(run, index));
}

function normalizeRun(value: unknown, index: number): AgentRun {
  if (!value || typeof value !== "object") {
    throw new Error("Each run must be an object.");
  }

  const record = value as Record<string, unknown>;
  const id = stringOr(record.id, `imported_${index + 1}`);
  const input = Array.isArray(record.input)
    ? record.input
    : Array.isArray(record.messages)
      ? record.messages
      : [{ role: "user", content: stringOr(record.prompt, "") }];

  return {
    id,
    source: "json",
    agentName: stringOr(record.agentName, "imported-agent"),
    framework: stringOr(record.framework, "unknown"),
    environment: record.environment === "production" || record.environment === "staging" ? record.environment : "development",
    startedAt: stringOr(record.startedAt, new Date().toISOString()),
    model: optionalString(record.model),
    promptVersion: optionalString(record.promptVersion),
    input: input.map((message, messageIndex) => {
      const messageRecord = typeof message === "object" && message ? (message as Record<string, unknown>) : {};
      const role = messageRecord.role === "assistant" || messageRecord.role === "system" || messageRecord.role === "tool" ? messageRecord.role : "user";
      return {
        role,
        content: stringOr(messageRecord.content, `Imported message ${messageIndex + 1}`)
      };
    }),
    steps: Array.isArray(record.steps)
      ? record.steps.map((step, stepIndex) => {
          const stepRecord = typeof step === "object" && step ? (step as Record<string, unknown>) : {};
          return {
            id: stringOr(stepRecord.id, `step_${stepIndex + 1}`),
            traceId: optionalString(stepRecord.traceId),
            spanId: optionalString(stepRecord.spanId),
            parentSpanId: optionalString(stepRecord.parentSpanId),
            type: stepRecord.type === "tool_call" || stepRecord.type === "retrieval" || stepRecord.type === "handoff" || stepRecord.type === "error" ? stepRecord.type : "llm_call",
            name: stringOr(stepRecord.name, "imported_step"),
            input: stepRecord.input,
            output: stepRecord.output,
            error: optionalString(stepRecord.error),
            startedAt: optionalString(stepRecord.startedAt),
            endedAt: optionalString(stepRecord.endedAt),
            durationMs: numberOr(stepRecord.durationMs),
            costUsd: numberOr(stepRecord.costUsd),
            sourceUrl: optionalString(stepRecord.sourceUrl)
          };
        })
      : [],
    finalOutput: stringOr(record.finalOutput, stringOr(record.output, "")),
    sourceUrl: optionalString(record.sourceUrl),
    totalCostUsd: numberOr(record.totalCostUsd),
    latencyMs: numberOr(record.latencyMs),
    metadata: typeof record.metadata === "object" && record.metadata ? (record.metadata as AgentRun["metadata"]) : {}
  };
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberOr(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

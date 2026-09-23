import type { AgentRun, AgentRunStep, RunStepType } from "./types";

type OTelAttribute = { key?: string; value?: unknown };
type OTelSpan = Record<string, unknown>;

export function isOpenTelemetryPayload(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return Array.isArray(record.resourceSpans) || Array.isArray(record.spans) || Boolean(record.traceId && record.spanId);
}

export function parseOpenTelemetryRuns(payload: unknown): AgentRun[] {
  const spans = flattenSpans(payload);
  const spansByTrace = groupByTrace(spans);

  return Array.from(spansByTrace.entries()).map(([traceId, traceSpans], index) => {
    const sorted = traceSpans.sort((a, b) => getSortTime(a, "startTimeUnixNano") - getSortTime(b, "startTimeUnixNano"));
    const root = sorted.find((span) => !readString(span.parentSpanId)) ?? sorted[0];
    const attributes = readAttributes(root);
    const steps = sorted.map(spanToStep);

    return {
      id: readString(attributes["evalos.run_id"]) || `otel_${traceId || index + 1}`,
      source: "opentelemetry",
      agentName: readString(attributes["agent.name"]) || readString(attributes["service.name"]) || "otel-agent",
      framework: readString(attributes["agent.framework"]) || "opentelemetry",
      environment: readEnvironment(attributes["deployment.environment"]),
      startedAt: toIso(root.startTimeUnixNano) ?? new Date().toISOString(),
      model: readString(attributes["gen_ai.request.model"]) || readString(attributes["llm.model"]),
      promptVersion: readString(attributes["agent.prompt.version"]),
      input: [
        {
          role: "user",
          content: readString(attributes["agent.input"]) || readString(attributes["input.value"]) || `OpenTelemetry trace ${traceId}`
        }
      ],
      steps,
      finalOutput:
        readString(attributes["agent.output"]) ||
        readString(attributes["output.value"]) ||
        readString(steps.at(-1)?.output) ||
        "No final output captured in OpenTelemetry attributes.",
      sourceUrl: readString(attributes["evalos.source_url"]) || readString(attributes["trace.url"]),
      totalCostUsd: sumDefined(steps.map((step) => step.costUsd)),
      latencyMs: durationMs(root),
      metadata: {
        traceId,
        spanCount: steps.length
      }
    };
  });
}

function flattenSpans(payload: unknown): OTelSpan[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.spans)) return record.spans.filter(isRecord);
  if (record.traceId && record.spanId) return [record];

  const spans: OTelSpan[] = [];
  for (const resourceSpan of asArray(record.resourceSpans)) {
    for (const scopeSpan of asArray(resourceSpan.scopeSpans)) {
      spans.push(...asArray(scopeSpan.spans).filter(isRecord));
    }
  }
  return spans;
}

function groupByTrace(spans: OTelSpan[]) {
  const groups = new Map<string, OTelSpan[]>();
  for (const span of spans) {
    const traceId = readString(span.traceId) || readString(span.trace_id) || "unknown-trace";
    groups.set(traceId, [...(groups.get(traceId) ?? []), span]);
  }
  return groups;
}

function spanToStep(span: OTelSpan): AgentRunStep {
  const attributes = readAttributes(span);
  const status = isRecord(span.status) ? span.status : {};
  const statusMessage = readString(status.message);
  const statusCode = readString(status.code);
  const error = statusCode && !statusCode.endsWith("OK") ? statusMessage || statusCode : readString(attributes["error.message"]);

  return {
    id: readString(span.spanId) || readString(span.span_id) || readString(span.name) || "otel-span",
    traceId: readString(span.traceId) || readString(span.trace_id),
    spanId: readString(span.spanId) || readString(span.span_id),
    parentSpanId: readString(span.parentSpanId) || readString(span.parent_span_id),
    type: inferStepType(readString(span.name), attributes, error),
    name: readString(span.name) || "otel.span",
    input: attributes["agent.input"] ?? attributes["input.value"],
    output: attributes["agent.output"] ?? attributes["output.value"] ?? summarizeEvents(span.events),
    error: error || null,
    startedAt: toIso(span.startTimeUnixNano),
    endedAt: toIso(span.endTimeUnixNano),
    durationMs: durationMs(span),
    costUsd: readNumber(attributes["gen_ai.usage.cost_usd"]) ?? readNumber(attributes["llm.cost_usd"]),
    sourceUrl: readString(attributes["evalos.source_url"]) || readString(attributes["trace.url"]),
    metadata: {
      spanKind: readString(span.kind),
      statusCode: statusCode || null
    }
  };
}

function inferStepType(name: string, attributes: Record<string, unknown>, error: string): RunStepType {
  const text = `${name} ${Object.keys(attributes).join(" ")}`.toLowerCase();
  if (error) return "error";
  if (text.includes("tool")) return "tool_call";
  if (text.includes("retrieval") || text.includes("search")) return "retrieval";
  if (text.includes("handoff")) return "handoff";
  if (text.includes("llm") || text.includes("gen_ai")) return "llm_call";
  return "message";
}

function readAttributes(span: OTelSpan): Record<string, unknown> {
  const raw = span.attributes;
  if (Array.isArray(raw)) {
    return raw.reduce<Record<string, unknown>>((acc, item: OTelAttribute) => {
      if (item.key) acc[item.key] = unwrapValue(item.value);
      return acc;
    }, {});
  }
  return isRecord(raw) ? raw : {};
}

function unwrapValue(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return value.stringValue ?? value.intValue ?? value.doubleValue ?? value.boolValue ?? value.arrayValue ?? value;
}

function summarizeEvents(events: unknown): string | undefined {
  const names = asArray(events)
    .map((event) => (isRecord(event) ? readString(event.name) : ""))
    .filter(Boolean);
  return names.length > 0 ? names.join(", ") : undefined;
}

function durationMs(span: OTelSpan): number | undefined {
  const start = getTime(span, "startTimeUnixNano");
  const end = getTime(span, "endTimeUnixNano");
  return start > 0 && end >= start ? Math.round(end - start) : undefined;
}

function getTime(span: OTelSpan, key: string): number {
  const value = span[key];
  if (typeof value === "number") return value / 1_000_000;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value) / 1_000_000;
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getSortTime(span: OTelSpan, key: string): number {
  const time = getTime(span, key);
  return time > 0 ? time : Number.MAX_SAFE_INTEGER;
}

function toIso(value: unknown): string | undefined {
  const millis = typeof value === "number" ? value / 1_000_000 : typeof value === "string" && /^\d+$/.test(value) ? Number(value) / 1_000_000 : Date.parse(String(value ?? ""));
  return Number.isFinite(millis) && millis > 0 ? new Date(millis).toISOString() : undefined;
}

function readEnvironment(value: unknown): AgentRun["environment"] {
  return value === "production" || value === "staging" ? value : "development";
}

function readString(value: unknown): string {
  return typeof value === "string" && value.length > 0 ? value : "";
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function sumDefined(values: Array<number | undefined>): number | undefined {
  const defined = values.filter((value): value is number => typeof value === "number");
  return defined.length > 0 ? Number(defined.reduce((sum, value) => sum + value, 0).toFixed(6)) : undefined;
}

function asArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

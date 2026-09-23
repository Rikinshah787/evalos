import { z } from "zod";

const failureTypeSchema = z.enum([
  "task_failed",
  "wrong_answer",
  "incomplete_answer",
  "hallucination",
  "tool_error",
  "wrong_tool",
  "missing_tool_call",
  "lost_context",
  "loop_detected",
  "user_abandoned",
  "bad_format",
  "timeout",
  "handoff_needed",
  "low_confidence",
  "none"
]);

const agentMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string().min(1),
  timestamp: z.string().optional()
});

const agentRunStepSchema = z.object({
  id: z.string().min(1),
  traceId: z.string().optional(),
  spanId: z.string().optional(),
  parentSpanId: z.string().optional(),
  type: z.enum(["message", "llm_call", "tool_call", "retrieval", "handoff", "error"]),
  name: z.string().min(1),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  error: z.string().nullable().optional(),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  durationMs: z.number().finite().optional(),
  costUsd: z.number().finite().optional(),
  sourceUrl: z.string().optional(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional()
});

export const agentRunSchema = z.object({
  id: z.string().min(1),
  source: z.enum(["json", "opentelemetry", "langfuse", "phoenix", "opik"]).optional(),
  agentName: z.string().min(1).optional(),
  framework: z.string().min(1).optional(),
  environment: z.enum(["development", "staging", "production"]).optional(),
  startedAt: z.string().optional(),
  model: z.string().optional(),
  promptVersion: z.string().optional(),
  input: z.array(agentMessageSchema).optional(),
  messages: z.array(agentMessageSchema).optional(),
  prompt: z.string().optional(),
  steps: z.array(agentRunStepSchema).optional(),
  finalOutput: z.string().optional(),
  output: z.string().optional(),
  sourceUrl: z.string().optional(),
  totalCostUsd: z.number().finite().optional(),
  latencyMs: z.number().finite().optional(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional()
});

export const otlpPayloadSchema = z.object({
  resourceSpans: z.array(z.unknown()).min(1)
});

export const ingestPayloadSchema = z.union([
  otlpPayloadSchema,
  agentRunSchema,
  z.array(agentRunSchema).min(1)
]);

export const reviewUpsertSchema = z.object({
  runId: z.string().min(1),
  evaluationId: z.string().min(1).optional(),
  status: z.enum(["pending", "confirmed", "rejected", "needs_changes"]),
  category: failureTypeSchema,
  expectedBehavior: z.string().min(1),
  notes: z.string().optional(),
  reviewer: z.string().min(1).default("local-reviewer")
});

export const releaseResultSchema = z.object({
  caseId: z.string().min(1),
  agentVersion: z.string().min(1),
  passed: z.boolean(),
  qualityScore: z.number().finite(),
  costUsd: z.number().finite(),
  latencyMs: z.number().finite()
});

export const releaseResultsRequestSchema = z.object({
  baselineVersion: z.string().min(1),
  candidateVersion: z.string().min(1),
  thresholds: z
    .object({
      minQualityDelta: z.number().finite(),
      maxCostIncreasePct: z.number().finite(),
      maxLatencyIncreasePct: z.number().finite()
    })
    .optional(),
  results: z.array(releaseResultSchema)
});

export type ReviewUpsertInput = z.infer<typeof reviewUpsertSchema>;

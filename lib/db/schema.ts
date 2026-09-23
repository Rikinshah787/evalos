import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const runs = sqliteTable(
  "runs",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    agentName: text("agent_name").notNull(),
    framework: text("framework").notNull(),
    environment: text("environment").notNull(),
    startedAt: text("started_at").notNull(),
    model: text("model"),
    promptVersion: text("prompt_version"),
    sourceUrl: text("source_url"),
    totalCostUsd: real("total_cost_usd"),
    latencyMs: integer("latency_ms"),
    finalOutput: text("final_output").notNull(),
    payloadJson: text("payload_json").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [
    index("runs_started_at_idx").on(table.startedAt),
    index("runs_source_idx").on(table.source),
    index("runs_agent_name_idx").on(table.agentName)
  ]
);

export const runMessages = sqliteTable(
  "run_messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    timestamp: text("timestamp")
  },
  (table) => [index("run_messages_run_id_idx").on(table.runId)]
);

export const runSteps = sqliteTable(
  "run_steps",
  {
    id: text("id").notNull(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    traceId: text("trace_id"),
    spanId: text("span_id"),
    parentSpanId: text("parent_span_id"),
    type: text("type").notNull(),
    name: text("name").notNull(),
    inputJson: text("input_json"),
    outputJson: text("output_json"),
    error: text("error"),
    startedAt: text("started_at"),
    endedAt: text("ended_at"),
    durationMs: integer("duration_ms"),
    costUsd: real("cost_usd"),
    sourceUrl: text("source_url"),
    metadataJson: text("metadata_json")
  },
  (table) => [
    index("run_steps_run_id_idx").on(table.runId),
    index("run_steps_trace_id_idx").on(table.traceId),
    index("run_steps_span_id_idx").on(table.spanId)
  ]
);

export const evaluations = sqliteTable(
  "evaluations",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    evaluatorId: text("evaluator_id").notNull(),
    evaluatorVersion: text("evaluator_version").notNull(),
    evaluatorKind: text("evaluator_kind").notNull(),
    status: text("status").notNull(),
    passed: integer("passed", { mode: "boolean" }).notNull(),
    score: real("score").notNull(),
    risk: text("risk").notNull(),
    outcome: text("outcome").notNull(),
    failureType: text("failure_type").notNull(),
    confidence: real("confidence"),
    reason: text("reason").notNull(),
    suggestedAssertion: text("suggested_assertion").notNull(),
    reviewPriority: integer("review_priority").notNull(),
    payloadJson: text("payload_json").notNull(),
    createdAt: text("created_at").notNull()
  },
  (table) => [
    index("evaluations_run_id_idx").on(table.runId),
    index("evaluations_failure_type_idx").on(table.failureType),
    index("evaluations_created_at_idx").on(table.createdAt)
  ]
);

export const evaluationEvidence = sqliteTable(
  "evaluation_evidence",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    evaluationId: text("evaluation_id")
      .notNull()
      .references(() => evaluations.id, { onDelete: "cascade" }),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    stepId: text("step_id").notNull(),
    traceId: text("trace_id"),
    spanId: text("span_id"),
    stepName: text("step_name").notNull(),
    stepType: text("step_type").notNull(),
    excerpt: text("excerpt").notNull(),
    explanation: text("explanation")
  },
  (table) => [
    index("evaluation_evidence_evaluation_id_idx").on(table.evaluationId),
    index("evaluation_evidence_run_id_idx").on(table.runId)
  ]
);

export const reviews = sqliteTable(
  "reviews",
  {
    id: text("id").primaryKey(),
    evaluationId: text("evaluation_id").references(() => evaluations.id, { onDelete: "set null" }),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    category: text("category").notNull(),
    expectedBehavior: text("expected_behavior").notNull(),
    notes: text("notes"),
    reviewer: text("reviewer").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [
    uniqueIndex("reviews_run_id_uidx").on(table.runId),
    index("reviews_status_idx").on(table.status)
  ]
);

export const cases = sqliteTable(
  "cases",
  {
    id: text("id").primaryKey(),
    datasetId: text("dataset_id").notNull(),
    name: text("name").notNull(),
    version: integer("version").notNull(),
    status: text("status").notNull(),
    sourceRunId: text("source_run_id").references(() => runs.id, { onDelete: "set null" }),
    sourceEvaluationId: text("source_evaluation_id").references(() => evaluations.id, {
      onDelete: "set null"
    }),
    failureType: text("failure_type").notNull(),
    risk: text("risk").notNull(),
    expectedBehavior: text("expected_behavior").notNull(),
    payloadJson: text("payload_json").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [
    index("cases_dataset_id_idx").on(table.datasetId),
    index("cases_source_run_id_idx").on(table.sourceRunId),
    index("cases_status_idx").on(table.status)
  ]
);

export const ingestionErrors = sqliteTable("ingestion_errors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").notNull(),
  externalId: text("external_id"),
  message: text("message").notNull(),
  payloadJson: text("payload_json"),
  createdAt: text("created_at").notNull()
});

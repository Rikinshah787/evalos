import { desc, inArray } from "drizzle-orm";
import { getDatabase } from "./db/connection";
import { runMessages, runs, runSteps } from "./db/schema";
import type { AgentRun } from "./types";

export function listRuns(): AgentRun[] {
  const db = getDatabase();
  return db
    .select({ payloadJson: runs.payloadJson })
    .from(runs)
    .orderBy(desc(runs.startedAt))
    .all()
    .map((row) => JSON.parse(row.payloadJson) as AgentRun);
}

export function appendRuns(newRuns: AgentRun[]): AgentRun[] {
  if (newRuns.length === 0) return listRuns();

  const db = getDatabase();
  const ids = newRuns.map((run) => run.id);
  const existingIds = new Set(
    db
      .select({ id: runs.id })
      .from(runs)
      .where(inArray(runs.id, ids))
      .all()
      .map((row) => row.id)
  );
  const batchIds = new Set<string>();
  const uniqueRuns = newRuns.filter((run) => {
    if (existingIds.has(run.id) || batchIds.has(run.id)) return false;
    batchIds.add(run.id);
    return true;
  });

  if (uniqueRuns.length === 0) return listRuns();

  const now = new Date().toISOString();

  db.transaction((tx) => {
    for (const run of uniqueRuns) {
      tx.insert(runs)
        .values({
          id: run.id,
          source: run.source,
          agentName: run.agentName,
          framework: run.framework,
          environment: run.environment,
          startedAt: run.startedAt,
          model: run.model,
          promptVersion: run.promptVersion,
          sourceUrl: run.sourceUrl,
          totalCostUsd: run.totalCostUsd,
          latencyMs: run.latencyMs,
          finalOutput: run.finalOutput,
          payloadJson: JSON.stringify(run),
          createdAt: now,
          updatedAt: now
        })
        .run();

      if (run.input.length > 0) {
        tx.insert(runMessages)
          .values(
            run.input.map((message, index) => ({
              runId: run.id,
              sequence: index,
              role: message.role,
              content: message.content,
              timestamp: message.timestamp
            }))
          )
          .run();
      }

      if (run.steps.length > 0) {
        tx.insert(runSteps)
          .values(
            run.steps.map((step, index) => ({
              id: step.id,
              runId: run.id,
              sequence: index,
              traceId: step.traceId,
              spanId: step.spanId,
              parentSpanId: step.parentSpanId,
              type: step.type,
              name: step.name,
              inputJson: jsonOrNull(step.input),
              outputJson: jsonOrNull(step.output),
              error: step.error,
              startedAt: step.startedAt,
              endedAt: step.endedAt,
              durationMs: step.durationMs,
              costUsd: step.costUsd,
              sourceUrl: step.sourceUrl,
              metadataJson: jsonOrNull(step.metadata)
            }))
          )
          .run();
      }
    }
  });

  return listRuns();
}

export function clearRuns() {
  const db = getDatabase();
  db.delete(runSteps).run();
  db.delete(runMessages).run();
  db.delete(runs).run();
}

function jsonOrNull(value: unknown) {
  return value === undefined ? null : JSON.stringify(value);
}

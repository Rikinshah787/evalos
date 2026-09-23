import { desc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDatabase } from "./db/connection";
import { evaluationEvidence, evaluations } from "./db/schema";
import type { EvaluationResult } from "./types";

export function saveEvaluations(results: EvaluationResult[]): EvaluationResult[] {
  if (results.length === 0) return [];

  const db = getDatabase();
  const now = new Date().toISOString();
  const saved: EvaluationResult[] = [];

  db.transaction((tx) => {
    for (const result of results) {
      const id = randomUUID();
      const status = result.outcome === "successful" ? "pass" : result.outcome === "failed" ? "fail" : "review";

      tx.insert(evaluations)
        .values({
          id,
          runId: result.runId,
          evaluatorId: result.evaluatorId,
          evaluatorVersion: result.evaluatorVersion,
          evaluatorKind: result.evaluatorKind,
          status,
          passed: result.passed,
          score: result.score,
          risk: result.risk,
          outcome: result.outcome,
          failureType: result.failureType,
          confidence: null,
          reason: result.reason,
          suggestedAssertion: result.suggestedAssertion,
          reviewPriority: result.reviewPriority,
          payloadJson: JSON.stringify({ ...result, id }),
          createdAt: now
        })
        .run();

      if (result.evidence.length > 0) {
        tx.insert(evaluationEvidence)
          .values(
            result.evidence.map((item) => ({
              evaluationId: id,
              runId: result.runId,
              stepId: item.stepId,
              traceId: item.traceId,
              spanId: item.spanId,
              stepName: item.stepName,
              stepType: item.stepType,
              excerpt: item.quote,
              explanation: result.reason
            }))
          )
          .run();
      }

      saved.push({ ...result, id });
    }
  });

  return saved;
}

export function listLatestEvaluationsByRunIds(runIds: string[]): Record<string, EvaluationResult> {
  if (runIds.length === 0) return {};

  const db = getDatabase();
  const rows = db
    .select()
    .from(evaluations)
    .where(inArray(evaluations.runId, runIds))
    .orderBy(desc(evaluations.createdAt))
    .all();

  const latest: Record<string, EvaluationResult> = {};
  for (const row of rows) {
    if (latest[row.runId]) continue;
    const payload = JSON.parse(row.payloadJson) as EvaluationResult;
    latest[row.runId] = {
      ...payload,
      // Keep deterministic fields from the row as source of truth.
      runId: row.runId,
      evaluatorId: row.evaluatorId,
      evaluatorVersion: row.evaluatorVersion,
      evaluatorKind: row.evaluatorKind as EvaluationResult["evaluatorKind"],
      passed: row.passed,
      score: row.score,
      risk: row.risk as EvaluationResult["risk"],
      outcome: row.outcome as EvaluationResult["outcome"],
      failureType: row.failureType as EvaluationResult["failureType"],
      reason: row.reason,
      suggestedAssertion: row.suggestedAssertion,
      reviewPriority: row.reviewPriority
    };
  }

  return latest;
}

export function getLatestEvaluationForRun(runId: string): (EvaluationResult & { id: string }) | null {
  const db = getDatabase();
  const row = db
    .select()
    .from(evaluations)
    .where(eq(evaluations.runId, runId))
    .orderBy(desc(evaluations.createdAt))
    .limit(1)
    .all()[0];

  if (!row) return null;
  const payload = JSON.parse(row.payloadJson) as EvaluationResult;
  return { ...payload, id: row.id };
}

export function clearEvaluations() {
  const db = getDatabase();
  db.delete(evaluationEvidence).run();
  db.delete(evaluations).run();
}

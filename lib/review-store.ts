import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { relativeCasePath, writeCaseFile } from "./case-files";
import { getDatabase } from "./db/connection";
import { cases, reviews } from "./db/schema";
import { getLatestEvaluationForRun } from "./evaluation-store";
import { toEvalCase } from "./exporters";
import { listRuns } from "./run-store";
import type { EvalCase, ReviewRecord, ReviewStatus } from "./types";
import type { ReviewUpsertInput } from "./validation/schemas";

export function listReviews(): ReviewRecord[] {
  const db = getDatabase();
  return db
    .select()
    .from(reviews)
    .all()
    .map((row) => ({
      id: row.id,
      evaluationId: row.evaluationId ?? undefined,
      runId: row.runId,
      status: row.status as ReviewStatus,
      category: row.category as ReviewRecord["category"],
      expectedBehavior: row.expectedBehavior,
      notes: row.notes ?? undefined,
      reviewer: row.reviewer,
      updatedAt: row.updatedAt
    }));
}

export function getReviewMap(): Record<string, ReviewRecord> {
  return Object.fromEntries(listReviews().map((review) => [review.runId, review]));
}

export function upsertReview(input: ReviewUpsertInput): ReviewRecord & { casePath?: string } {
  const db = getDatabase();
  const now = new Date().toISOString();
  const latestEvaluation = getLatestEvaluationForRun(input.runId);
  const evaluationId = input.evaluationId ?? latestEvaluation?.id;
  const run = listRuns().find((item) => item.id === input.runId);

  if (input.status === "confirmed") {
    if (!latestEvaluation) {
      throw new Error("Cannot confirm without an evaluation for this run.");
    }
    if (!run) {
      throw new Error(`Run ${input.runId} was not found.`);
    }
    if (latestEvaluation.evidence.length === 0) {
      latestEvaluation.evidence = synthesizeEvidence(run, latestEvaluation.reason);
    }
  }

  const existing = db.select().from(reviews).where(eq(reviews.runId, input.runId)).all()[0];
  const reviewId = existing?.id ?? randomUUID();

  const record: ReviewRecord & { casePath?: string } = {
    id: reviewId,
    evaluationId,
    runId: input.runId,
    status: input.status,
    category: input.category,
    expectedBehavior: input.expectedBehavior,
    notes: input.notes,
    reviewer: input.reviewer,
    updatedAt: now
  };

  if (existing) {
    db.update(reviews)
      .set({
        evaluationId: evaluationId ?? null,
        status: record.status,
        category: record.category,
        expectedBehavior: record.expectedBehavior,
        notes: record.notes ?? null,
        reviewer: record.reviewer,
        updatedAt: record.updatedAt
      })
      .where(eq(reviews.runId, input.runId))
      .run();
  } else {
    db.insert(reviews)
      .values({
        id: reviewId,
        evaluationId: evaluationId ?? null,
        runId: record.runId,
        status: record.status,
        category: record.category,
        expectedBehavior: record.expectedBehavior,
        notes: record.notes ?? null,
        reviewer: record.reviewer,
        updatedAt: record.updatedAt
      })
      .run();
  }

  if (record.status === "confirmed" && latestEvaluation && run) {
    const evaluated = { ...run, evaluation: latestEvaluation };
    const evalCase = toEvalCase(evaluated, record);
    persistDraftCase(evalCase, latestEvaluation.id);
    const absolute = writeCaseFile(evalCase);
    record.casePath = relativeCasePath(absolute);
  }

  return record;
}

function synthesizeEvidence(run: NonNullable<ReturnType<typeof listRuns>[number]>, reason: string) {
  const step =
    run.steps.find((item) => item.error) ||
    run.steps.find((item) => item.type === "tool_call") ||
    run.steps[0];

  if (!step) {
    return [
      {
        stepId: "synthetic_root",
        stepName: "run",
        stepType: "message" as const,
        quote: run.finalOutput.slice(0, 280) || reason
      }
    ];
  }

  return [
    {
      stepId: step.id,
      traceId: step.traceId,
      spanId: step.spanId,
      stepName: step.name,
      stepType: step.type,
      quote: String(step.error ?? step.output ?? step.name).slice(0, 280)
    }
  ];
}

export function clearReviews() {
  const db = getDatabase();
  db.delete(cases).run();
  db.delete(reviews).run();
}

function persistDraftCase(evalCase: EvalCase, evaluationId: string) {
  const db = getDatabase();
  const now = new Date().toISOString();
  const existing = db
    .select()
    .from(cases)
    .where(eq(cases.sourceRunId, evalCase.metadata.sourceRunId))
    .all()[0];

  const values = {
    datasetId: evalCase.datasetId,
    name: evalCase.name,
    version: evalCase.version,
    status: "draft",
    sourceRunId: evalCase.metadata.sourceRunId,
    sourceEvaluationId: evaluationId,
    failureType: evalCase.expected.failureType,
    risk: evalCase.metadata.risk,
    expectedBehavior: evalCase.expected.assertion,
    payloadJson: JSON.stringify(evalCase),
    updatedAt: now
  };

  if (existing) {
    db.update(cases).set(values).where(eq(cases.id, existing.id)).run();
    return;
  }

  db.insert(cases)
    .values({
      id: evalCase.id,
      createdAt: now,
      ...values
    })
    .run();
}

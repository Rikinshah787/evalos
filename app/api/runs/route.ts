import { NextResponse } from "next/server";
import { evaluateRuns } from "@/lib/evaluator";
import { saveEvaluations } from "@/lib/evaluation-store";
import { parseRunsFromJson } from "@/lib/importer";
import { defaultRetentionPolicy, pruneStaleRuns } from "@/lib/retention";
import { appendRuns, clearRuns, listRuns } from "@/lib/run-store";
import { clearReviews, getReviewMap } from "@/lib/review-store";
import { clearEvaluations } from "@/lib/evaluation-store";
import { fromUnknownError, apiError } from "@/lib/validation/errors";
import { ingestPayloadSchema } from "@/lib/validation/schemas";

export async function GET() {
  const runs = listRuns();
  return NextResponse.json({
    count: runs.length,
    runs,
    reviews: getReviewMap()
  });
}

export async function DELETE() {
  clearReviews();
  clearEvaluations();
  clearRuns();
  return NextResponse.json({
    count: 0,
    runs: [],
    reviews: {}
  });
}

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (!raw.trim()) {
      return apiError(400, "invalid_request", "Request body must not be empty.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return apiError(400, "invalid_json", "Request body must be valid JSON.");
    }

    const validated = ingestPayloadSchema.safeParse(parsed);
    if (!validated.success) {
      return apiError(400, "validation_error", "Run payload failed validation.", validated.error.flatten());
    }

    const importedRuns = parseRunsFromJson(raw);
    if (importedRuns.length === 0) {
      return apiError(400, "invalid_request", "No runs found in payload.");
    }

    const { activeRuns, removedRuns } = pruneStaleRuns(importedRuns, new Date(), defaultRetentionPolicy);
    appendRuns(activeRuns);
    const evaluatedRuns = evaluateRuns(activeRuns);
    saveEvaluations(evaluatedRuns.map((run) => run.evaluation));

    return NextResponse.json(
      {
        accepted: activeRuns.length,
        staleRemoved: removedRuns.length,
        evaluator: evaluatedRuns[0]?.evaluation.evaluatorId,
        runs: evaluatedRuns.map((run) => ({
          id: run.id,
          source: run.source,
          score: run.evaluation.score,
          outcome: run.evaluation.outcome,
          evidence: run.evaluation.evidence
        }))
      },
      { status: 202 }
    );
  } catch (error) {
    return fromUnknownError(error);
  }
}

import { NextResponse } from "next/server";
import { loadCursorSessionRun } from "@/lib/cursor-transcript";
import { evaluateRuns } from "@/lib/evaluator";
import { clearEvaluations, saveEvaluations } from "@/lib/evaluation-store";
import { redactRun } from "@/lib/redact";
import { clearReviews } from "@/lib/review-store";
import { clearRuns, upsertRuns } from "@/lib/run-store";
import { loadCaseFiles, watchRunAgainstCases } from "@/lib/watch";
import { fromUnknownError, apiError } from "@/lib/validation/errors";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      replace?: boolean;
      transcriptPath?: string;
    };

    const run = redactRun(loadCursorSessionRun(body.transcriptPath));
    if (run.steps.length === 0 && run.input.length === 0) {
      return apiError(404, "empty_transcript", "Cursor transcript had no messages or tool steps.");
    }

    if (body.replace !== false) {
      clearReviews();
      clearEvaluations();
      clearRuns();
    }

    upsertRuns([run]);
    const evaluated = evaluateRuns([run]);
    saveEvaluations(evaluated.map((item) => item.evaluation));
    const watch = watchRunAgainstCases(run, evaluated[0]!.evaluation, loadCaseFiles());

    return NextResponse.json(
      {
        accepted: 1,
        runId: run.id,
        steps: run.steps.length,
        messages: run.input.length,
        sourceUrl: run.sourceUrl,
        outcome: evaluated[0]?.evaluation.outcome,
        failureType: evaluated[0]?.evaluation.failureType,
        evidence: evaluated[0]?.evaluation.evidence,
        toolCalls: run.steps.filter((step) => step.type === "tool_call" || step.type === "error").length,
        watch
      },
      { status: 202 }
    );
  } catch (error) {
    return fromUnknownError(error);
  }
}

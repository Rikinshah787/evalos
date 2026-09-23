import { NextResponse } from "next/server";
import { demoTrace } from "@/lib/demo-trace";
import { evaluateRuns } from "@/lib/evaluator";
import { saveEvaluations } from "@/lib/evaluation-store";
import { appendRuns } from "@/lib/run-store";
import { fromUnknownError } from "@/lib/validation/errors";

export async function POST() {
  try {
    appendRuns([demoTrace]);
    const evaluated = evaluateRuns([demoTrace]);
    saveEvaluations(evaluated.map((run) => run.evaluation));

    return NextResponse.json(
      {
        accepted: 1,
        runId: demoTrace.id,
        outcome: evaluated[0]?.evaluation.outcome,
        failureType: evaluated[0]?.evaluation.failureType,
        evidence: evaluated[0]?.evaluation.evidence
      },
      { status: 202 }
    );
  } catch (error) {
    return fromUnknownError(error);
  }
}

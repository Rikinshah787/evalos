import { NextResponse } from "next/server";
import { evaluateRuns } from "@/lib/evaluator";
import { groupIssues } from "@/lib/issues";
import { getReviewMap } from "@/lib/review-store";
import { listRuns } from "@/lib/run-store";
import { loadCaseFiles, watchRunAgainstCases } from "@/lib/watch";
import { fromUnknownError } from "@/lib/validation/errors";

/** Open review queue — grouped issues + optional watch against confirmed cases. */
export async function GET() {
  try {
    const runs = listRuns();
    const reviews = getReviewMap();
    const evaluated = evaluateRuns(runs);
    const cases = loadCaseFiles();

    const issues = evaluated
      .filter((run) => !run.evaluation.passed && reviews[run.id]?.status !== "rejected")
      .map((run) => {
        const review = reviews[run.id];
        const watch = watchRunAgainstCases(run, run.evaluation, cases);
        return {
          runId: run.id,
          agentName: run.agentName,
          failureType: run.evaluation.failureType,
          reason: run.evaluation.reason,
          risk: run.evaluation.risk,
          score: run.evaluation.score,
          outcome: run.evaluation.outcome,
          evidence: run.evaluation.evidence,
          reviewStatus: review?.status ?? "pending",
          expectedBehavior: review?.expectedBehavior ?? run.evaluation.suggestedAssertion,
          userAsk: run.input[0]?.content ?? "",
          startedAt: run.startedAt,
          watch
        };
      })
      .sort((a, b) => a.score - b.score);

    const groups = groupIssues(evaluated, reviews);
    const confirmed = Object.values(reviews).filter((item) => item.status === "confirmed").length;

    return NextResponse.json({
      count: issues.length,
      confirmed,
      caseCount: cases.length,
      groups,
      issues
    });
  } catch (error) {
    return fromUnknownError(error);
  }
}

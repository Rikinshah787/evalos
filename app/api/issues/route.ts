import { NextResponse } from "next/server";
import { evaluateRuns } from "@/lib/evaluator";
import { getReviewMap } from "@/lib/review-store";
import { listRuns } from "@/lib/run-store";
import { fromUnknownError } from "@/lib/validation/errors";

/** Open review queue — what MCP and the UI call “issues”. */
export async function GET() {
  try {
    const runs = listRuns();
    const reviews = getReviewMap();
    const evaluated = evaluateRuns(runs);

    const issues = evaluated
      .filter((run) => !run.evaluation.passed && reviews[run.id]?.status !== "rejected")
      .map((run) => {
        const review = reviews[run.id];
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
          startedAt: run.startedAt
        };
      })
      .sort((a, b) => a.score - b.score);

    const confirmed = Object.values(reviews).filter((item) => item.status === "confirmed").length;

    return NextResponse.json({
      count: issues.length,
      confirmed,
      issues
    });
  } catch (error) {
    return fromUnknownError(error);
  }
}

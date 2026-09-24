import { NextResponse } from "next/server";
import { evaluateRun } from "@/lib/evaluator";
import { buildRunGraph } from "@/lib/run-graph";
import { getRun, listRuns } from "@/lib/run-store";
import { apiError, fromUnknownError } from "@/lib/validation/errors";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const runId = url.searchParams.get("runId");
    const run = runId ? getRun(runId) : listRuns()[0];
    if (!run) {
      return apiError(404, "not_found", "No run available to project as a graph.");
    }
    const evaluated = { ...run, evaluation: evaluateRun(run) };
    return NextResponse.json({ graph: buildRunGraph(evaluated), neo4jUrl: process.env.EVALOS_GRAPH_URL || null });
  } catch (error) {
    return fromUnknownError(error);
  }
}

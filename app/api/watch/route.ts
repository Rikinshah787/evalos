import { NextResponse } from "next/server";
import { evaluateRuns } from "@/lib/evaluator";
import { getRun, listRuns } from "@/lib/run-store";
import { loadCaseFiles, watchRunAgainstCases } from "@/lib/watch";
import { apiError, fromUnknownError } from "@/lib/validation/errors";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const runId = url.searchParams.get("runId");
    const cases = loadCaseFiles();
    const runs = runId ? ([getRun(runId)].filter(Boolean) as NonNullable<ReturnType<typeof getRun>>[]) : listRuns();

    if (runId && runs.length === 0) {
      return apiError(404, "not_found", `Run not found: ${runId}`);
    }

    const evaluated = evaluateRuns(runs);
    const reports = evaluated.map((run) => watchRunAgainstCases(run, run.evaluation, cases));
    const regressed = reports.reduce((sum, report) => sum + report.regressed, 0);

    return NextResponse.json({
      caseCount: cases.length,
      runCount: evaluated.length,
      regressed,
      reports
    });
  } catch (error) {
    return fromUnknownError(error);
  }
}

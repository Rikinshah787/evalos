import { NextResponse } from "next/server";
import { evaluateRuns } from "@/lib/evaluator";
import { parseRunsFromJson } from "@/lib/importer";
import { defaultRetentionPolicy, pruneStaleRuns } from "@/lib/retention";
import { appendRuns, clearRuns, listRuns } from "@/lib/run-store";

export async function GET() {
  const runs = listRuns();
  return NextResponse.json({
    count: runs.length,
    runs
  });
}

export async function DELETE() {
  clearRuns();
  return NextResponse.json({
    count: 0,
    runs: []
  });
}

export async function POST(request: Request) {
  const raw = await request.text();
  const importedRuns = parseRunsFromJson(raw);
  const { activeRuns, removedRuns } = pruneStaleRuns(importedRuns, new Date(), defaultRetentionPolicy);
  appendRuns(activeRuns);
  const evaluatedRuns = evaluateRuns(activeRuns);

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
}

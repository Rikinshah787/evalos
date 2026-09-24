import { NextResponse } from "next/server";
import {
  buildCompareReport,
  buildReportFromRuns,
  emptyCompareReport,
  sampleCompareFixture
} from "@/lib/compare";
import { evaluateRuns } from "@/lib/evaluator";
import { loadHarnessResults, saveHarnessResults } from "@/lib/harness-store";
import { listRuns } from "@/lib/run-store";
import { loadCaseFiles } from "@/lib/watch";
import { fromUnknownError, apiError } from "@/lib/validation/errors";
import { releaseResultsRequestSchema } from "@/lib/validation/schemas";
import { z } from "zod";

const comparePostSchema = releaseResultsRequestSchema.extend({
  title: z.string().optional(),
  useSample: z.boolean().optional()
});

/**
 * Truth order:
 * 1. ?sample=1 → explicit demo only
 * 2. persisted harness results (POST /api/compare or /api/results)
 * 3. live evaluated runs from SQLite
 * 4. confirmed case files with no results yet (empty matrix, honest)
 * Never invent Claude-vs-GPT numbers by default.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const wantSample = url.searchParams.get("sample") === "1";

    if (wantSample) {
      const fixture = sampleCompareFixture();
      const report = buildCompareReport(fixture.cases, fixture.results, {
        title: "Sample only (not your data)",
        baselineVersion: "openai:gpt-4o",
        candidateVersion: "anthropic:claude-3-5-sonnet"
      });
      return NextResponse.json({ source: "sample", report, persisted: false, truthful: false });
    }

    const stored = loadHarnessResults();
    if (stored && stored.results.length > 0) {
      const cases = loadCaseFiles();
      const report = buildCompareReport(
        cases.length > 0 ? cases : inferCases(stored.results),
        stored.results,
        {
          title: stored.title ?? "Harness results",
          baselineVersion: stored.baselineVersion,
          candidateVersion: stored.candidateVersion
        }
      );
      return NextResponse.json({ source: "harness", report, persisted: true, truthful: true });
    }

    const liveRuns = evaluateRuns(listRuns());
    if (liveRuns.length > 0) {
      const report = buildReportFromRuns(liveRuns, { title: "Live captures" });
      return NextResponse.json({
        source: "live",
        report,
        persisted: false,
        truthful: true,
        runCount: liveRuns.length
      });
    }

    const cases = loadCaseFiles();
    if (cases.length > 0) {
      const report = buildCompareReport(cases, [], {
        title: "Confirmed cases (awaiting harness results)"
      });
      return NextResponse.json({ source: "cases", report, persisted: false, truthful: true });
    }

    return NextResponse.json({
      source: "empty",
      report: emptyCompareReport(
        "No live runs or harness results yet. Import this Cursor session, or POST real results to /api/compare."
      ),
      persisted: false,
      truthful: true
    });
  } catch (error) {
    return fromUnknownError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = comparePostSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "validation_error", "Invalid compare payload.", parsed.error.flatten());
    }

    if (parsed.data.useSample) {
      const fixture = sampleCompareFixture();
      const report = buildCompareReport(fixture.cases, fixture.results, {
        title: "Sample only (not your data)",
        baselineVersion: "openai:gpt-4o",
        candidateVersion: "anthropic:claude-3-5-sonnet"
      });
      return NextResponse.json({ source: "sample", report, persisted: false, truthful: false }, { status: 201 });
    }

    saveHarnessResults({
      title: parsed.data.title,
      baselineVersion: parsed.data.baselineVersion,
      candidateVersion: parsed.data.candidateVersion,
      results: parsed.data.results
    });

    const cases = loadCaseFiles();
    const report = buildCompareReport(cases, parsed.data.results, {
      title: parsed.data.title,
      baselineVersion: parsed.data.baselineVersion,
      candidateVersion: parsed.data.candidateVersion
    });

    return NextResponse.json({ source: "harness", report, persisted: true, truthful: true }, { status: 201 });
  } catch (error) {
    return fromUnknownError(error);
  }
}

function inferCases(results: { caseId: string }[]) {
  return [...new Set(results.map((item) => item.caseId))].map((id) => ({
    id,
    name: id,
    datasetId: "imported",
    version: 1,
    input: [{ role: "user" as const, content: id }],
    expected: {
      outcome: "successful" as const,
      failureType: "none" as const,
      assertion: "Pass case checks."
    },
    metadata: {
      sourceRunId: id,
      evidenceStepIds: [] as string[],
      agentName: "imported",
      risk: "low" as const,
      createdAt: new Date().toISOString()
    }
  }));
}

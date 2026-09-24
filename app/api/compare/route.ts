import { NextResponse } from "next/server";
import { buildCompareReport, sampleCompareFixture } from "@/lib/compare";
import { loadCaseFiles } from "@/lib/watch";
import { loadHarnessResults, saveHarnessResults } from "@/lib/harness-store";
import { fromUnknownError, apiError } from "@/lib/validation/errors";
import { releaseResultsRequestSchema } from "@/lib/validation/schemas";
import { z } from "zod";

const comparePostSchema = releaseResultsRequestSchema.extend({
  title: z.string().optional(),
  useSample: z.boolean().optional()
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const sample = url.searchParams.get("sample") === "1";
    const stored = loadHarnessResults();
    const cases = loadCaseFiles();

    if (sample || (!stored && cases.length === 0)) {
      const fixture = sampleCompareFixture();
      const report = buildCompareReport(fixture.cases, fixture.results, {
        title: "Claude vs GPT",
        baselineVersion: "openai:gpt-4o",
        candidateVersion: "anthropic:claude-3-5-sonnet"
      });
      return NextResponse.json({ source: "sample", report, persisted: false });
    }

    if (!stored) {
      const report = buildCompareReport(cases, [], {
        title: "Confirmed cases (awaiting harness results)"
      });
      return NextResponse.json({ source: "cases", report, persisted: false });
    }

    const report = buildCompareReport(cases.length > 0 ? cases : inferCases(stored.results), stored.results, {
      title: stored.title,
      baselineVersion: stored.baselineVersion,
      candidateVersion: stored.candidateVersion
    });

    return NextResponse.json({ source: "harness", report, persisted: true });
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
      saveHarnessResults({
        title: "Claude vs GPT",
        baselineVersion: "openai:gpt-4o",
        candidateVersion: "anthropic:claude-3-5-sonnet",
        results: fixture.results
      });
      const report = buildCompareReport(fixture.cases, fixture.results, {
        title: "Claude vs GPT",
        baselineVersion: "openai:gpt-4o",
        candidateVersion: "anthropic:claude-3-5-sonnet"
      });
      return NextResponse.json({ source: "sample", report, persisted: true }, { status: 201 });
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

    return NextResponse.json({ source: "harness", report, persisted: true }, { status: 201 });
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

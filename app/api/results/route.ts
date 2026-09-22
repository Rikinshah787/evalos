import { NextResponse } from "next/server";
import { compareReleaseResults, defaultThresholds } from "@/lib/release";
import type { ReleaseResult } from "@/lib/types";

type ResultsRequest = {
  baselineVersion: string;
  candidateVersion: string;
  thresholds?: typeof defaultThresholds;
  results: ReleaseResult[];
};

export async function POST(request: Request) {
  const body = (await request.json()) as ResultsRequest;

  if (!body.baselineVersion || !body.candidateVersion || !Array.isArray(body.results)) {
    return NextResponse.json(
      {
        error: "Expected { baselineVersion, candidateVersion, results[] }."
      },
      { status: 400 }
    );
  }

  const comparison = compareReleaseResults(
    body.results,
    body.baselineVersion,
    body.candidateVersion,
    body.thresholds ?? defaultThresholds
  );

  return NextResponse.json({
    comparison,
    ciStatus: comparison.ciStatus
  });
}

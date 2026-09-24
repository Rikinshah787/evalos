import { NextResponse } from "next/server";
import { evaluateCiGate } from "@/lib/ci-gate";
import { compareReleaseResults, defaultThresholds } from "@/lib/release";
import { fromUnknownError, apiError } from "@/lib/validation/errors";
import { releaseResultsRequestSchema } from "@/lib/validation/schemas";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = releaseResultsRequestSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(
        400,
        "validation_error",
        "Expected { baselineVersion, candidateVersion, results[] }.",
        parsed.error.flatten()
      );
    }

    const comparison = compareReleaseResults(
      parsed.data.results,
      parsed.data.baselineVersion,
      parsed.data.candidateVersion,
      parsed.data.thresholds ?? defaultThresholds
    );

    const gate = evaluateCiGate({
      baselineVersion: parsed.data.baselineVersion,
      candidateVersion: parsed.data.candidateVersion,
      results: parsed.data.results
    });

    return NextResponse.json({
      comparison,
      gate,
      ciStatus: gate.ciStatus === "incomplete" ? "incomplete" : gate.ciStatus === "fail" ? "fail" : comparison.ciStatus
    });
  } catch (error) {
    return fromUnknownError(error);
  }
}

export async function GET() {
  try {
    const gate = evaluateCiGate({
      baselineVersion: "baseline",
      candidateVersion: "candidate",
      results: []
    });
    return NextResponse.json({ gate, ciStatus: gate.ciStatus });
  } catch (error) {
    return fromUnknownError(error);
  }
}

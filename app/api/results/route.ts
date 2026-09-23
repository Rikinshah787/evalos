import { NextResponse } from "next/server";
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

    return NextResponse.json({
      comparison,
      ciStatus: comparison.ciStatus
    });
  } catch (error) {
    return fromUnknownError(error);
  }
}

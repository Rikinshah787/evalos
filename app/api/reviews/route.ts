import { NextResponse } from "next/server";
import { getReviewMap, listReviews, upsertReview } from "@/lib/review-store";
import { fromUnknownError, apiError } from "@/lib/validation/errors";
import { reviewUpsertSchema } from "@/lib/validation/schemas";

export async function GET() {
  return NextResponse.json({
    count: listReviews().length,
    reviews: getReviewMap()
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = reviewUpsertSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "validation_error", "Review payload failed validation.", parsed.error.flatten());
    }

    const review = upsertReview(parsed.data);
    return NextResponse.json({ review }, { status: 201 });
  } catch (error) {
    return fromUnknownError(error);
  }
}

import { NextResponse } from "next/server";
import { ZodError } from "zod";

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function apiError(status: number, code: string, message: string, details?: unknown) {
  const body: ApiErrorBody = {
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details })
    }
  };
  return NextResponse.json(body, { status });
}

export function fromUnknownError(error: unknown) {
  if (error instanceof ZodError) {
    return apiError(400, "validation_error", "Request validation failed.", error.flatten());
  }

  if (error instanceof SyntaxError) {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  if (error instanceof Error) {
    if (error.message.toLowerCase().includes("json")) {
      return apiError(400, "invalid_json", error.message);
    }
    return apiError(400, "invalid_request", error.message);
  }

  return apiError(500, "internal_error", "Unexpected server error.");
}

import { describe, expect, it } from "vitest";
import { ingestPayloadSchema, releaseResultsRequestSchema, reviewUpsertSchema } from "@/lib/validation/schemas";

describe("validation schemas", () => {
  it("accepts a valid run payload", () => {
    const result = ingestPayloadSchema.safeParse({
      id: "run_1",
      agentName: "support-agent",
      input: [{ role: "user", content: "Help" }],
      steps: [{ id: "step_1", type: "tool_call", name: "lookup", error: "404" }],
      finalOutput: "Done"
    });

    expect(result.success).toBe(true);
  });

  it("rejects an empty run array", () => {
    const result = ingestPayloadSchema.safeParse([]);
    expect(result.success).toBe(false);
  });

  it("validates release results", () => {
    const result = releaseResultsRequestSchema.safeParse({
      baselineVersion: "v1",
      candidateVersion: "v2",
      results: [
        {
          caseId: "case_1",
          agentVersion: "v1",
          passed: true,
          qualityScore: 90,
          costUsd: 0.1,
          latencyMs: 1000
        }
      ]
    });

    expect(result.success).toBe(true);
  });

  it("validates review upsert payloads", () => {
    const result = reviewUpsertSchema.safeParse({
      runId: "run_1",
      status: "confirmed",
      category: "tool_error",
      expectedBehavior: "Recover cleanly.",
      reviewer: "local-reviewer"
    });

    expect(result.success).toBe(true);
  });
});

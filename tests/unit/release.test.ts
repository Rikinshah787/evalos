import { describe, expect, it } from "vitest";
import { compareReleaseResults } from "@/lib/release";
import type { ReleaseResult } from "@/lib/types";

const completeResults: ReleaseResult[] = [
  {
    caseId: "case_1",
    agentVersion: "v1",
    passed: false,
    qualityScore: 60,
    costUsd: 0.03,
    latencyMs: 5000
  },
  {
    caseId: "case_1",
    agentVersion: "v2",
    passed: true,
    qualityScore: 82,
    costUsd: 0.031,
    latencyMs: 4800
  }
];

describe("compareReleaseResults", () => {
  it("passes when candidate quality improves within cost and latency thresholds", () => {
    const comparison = compareReleaseResults(completeResults, "v1", "v2");

    expect(comparison).toMatchObject({
      qualityDelta: 22,
      costDeltaPct: 3,
      latencyDeltaPct: -4,
      ciStatus: "pass"
    });
  });

  it("fails when candidate cost exceeds the configured threshold", () => {
    const comparison = compareReleaseResults(
      [
        completeResults[0],
        {
          ...completeResults[1],
          costUsd: 0.08
        }
      ],
      "v1",
      "v2",
      {
        minQualityDelta: 0,
        maxCostIncreasePct: 20,
        maxLatencyIncreasePct: 15
      }
    );

    expect(comparison.ciStatus).toBe("fail");
  });

  it("marks the comparison incomplete when baseline or candidate data is missing", () => {
    const comparison = compareReleaseResults([completeResults[1]], "v1", "v2");

    expect(comparison.ciStatus).toBe("incomplete");
  });
});

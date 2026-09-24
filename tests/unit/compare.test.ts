import { describe, expect, it } from "vitest";
import { buildCompareReport, buildReportFromRuns, sampleCompareFixture } from "@/lib/compare";
import { evaluateRun } from "@/lib/evaluator";
import type { AgentRun } from "@/lib/types";

describe("compare report", () => {
  it("builds pass ratios and a case matrix for two versions", () => {
    const fixture = sampleCompareFixture();
    const report = buildCompareReport(fixture.cases, fixture.results, {
      title: "Claude vs GPT",
      baselineVersion: "openai:gpt-4o",
      candidateVersion: "anthropic:claude-3-5-sonnet"
    });

    expect(report.title).toBe("Claude vs GPT");
    expect(report.versions).toEqual(["openai:gpt-4o", "anthropic:claude-3-5-sonnet"]);
    expect(report.summaries[0]?.passRatio).toBe(100);
    expect(report.summaries[1]?.passed).toBe(2);
    expect(report.rows).toHaveLength(3);
    expect(report.rows[0]?.cells["openai:gpt-4o"]?.passed).toBe(true);
    expect(report.scatter.length).toBeGreaterThan(0);
  });

  it("builds truthful live reports from evaluated runs without invented tokens", () => {
    const base: AgentRun = {
      id: "cursor_live_1",
      source: "json",
      agentName: "cursor",
      framework: "cursor",
      environment: "development",
      startedAt: "2026-09-23T12:00:00.000Z",
      model: "cursor-agent",
      input: [{ role: "user", content: "Import this session" }],
      steps: [
        {
          id: "s1",
          type: "tool_call",
          name: "Shell",
          error: "Missing order id",
          durationMs: 420
        }
      ],
      finalOutput: "Could not complete refund.",
      latencyMs: 420,
      totalCostUsd: 0
    };

    const evaluated = { ...base, evaluation: evaluateRun(base) };
    const report = buildReportFromRuns([evaluated]);

    expect(report.title).toContain("Live results");
    expect(report.versions).toEqual(["cursor-agent"]);
    expect(report.rows).toHaveLength(1);
    const cell = report.rows[0]?.cells["cursor-agent"];
    expect(cell?.qualityScore).toBe(evaluated.evaluation.score);
    expect(cell?.latencyMs).toBe(420);
    expect(cell?.tokens).toBeUndefined();
    expect(cell?.outputPreview).toContain("Import this session");
    expect(cell?.outputPreview).toContain("Could not complete refund");
  });
});

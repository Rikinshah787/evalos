import { describe, expect, it } from "vitest";
import { buildCompareReport, sampleCompareFixture } from "@/lib/compare";

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
});

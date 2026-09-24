import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { evaluateCiGate } from "@/lib/ci-gate";
import { evaluateRun } from "@/lib/evaluator";
import { watchRunAgainstCases } from "@/lib/watch";
import type { AgentRun, EvalCase } from "@/lib/types";

describe("watch + ci gate", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "evalos-watch-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("flags a regression when the same failure type returns", () => {
    const run: AgentRun = {
      id: "run_watch",
      source: "json",
      agentName: "agent",
      framework: "test",
      environment: "development",
      startedAt: "2026-09-23T12:00:00.000Z",
      input: [{ role: "user", content: "refund" }],
      steps: [{ id: "s1", type: "tool_call", name: "lookup_order", error: "Missing order id" }],
      finalOutput: "cannot refund"
    };
    const evaluation = evaluateRun(run);
    const evalCase: EvalCase = {
      id: "case_tool_error",
      name: "refund tool_error",
      datasetId: "production-failures",
      version: 1,
      input: run.input,
      expected: {
        outcome: "failed",
        failureType: "tool_error",
        assertion: "Look up the order before refunding."
      },
      metadata: {
        sourceRunId: "old",
        evidenceStepIds: ["s1"],
        agentName: "agent",
        risk: "high",
        createdAt: "2026-09-23T11:00:00.000Z"
      }
    };

    const report = watchRunAgainstCases(run, evaluation, [evalCase]);
    expect(report.regressed).toBe(1);
    expect(report.matches[0]?.status).toBe("regressed");
  });

  it("returns incomplete when cases exist without harness results", () => {
    const casesDir = join(tempDir, "evals", "cases");
    mkdirSync(casesDir, { recursive: true });
    writeFileSync(
      join(casesDir, "case_a.json"),
      JSON.stringify({
        id: "case_a",
        name: "a",
        datasetId: "d",
        version: 1,
        input: [],
        expected: { outcome: "failed", failureType: "tool_error", assertion: "x" },
        metadata: {
          sourceRunId: "r",
          evidenceStepIds: [],
          agentName: "a",
          risk: "high",
          createdAt: "2026-09-23T12:00:00.000Z"
        }
      }),
      "utf8"
    );

    const gate = evaluateCiGate({
      baselineVersion: "v1",
      candidateVersion: "v2",
      results: [],
      cwd: tempDir
    });

    expect(gate.ciStatus).toBe("incomplete");
    expect(gate.caseCount).toBe(1);
  });

  it("fails when candidate marks a confirmed case as failed", () => {
    const casesDir = join(tempDir, "evals", "cases");
    mkdirSync(casesDir, { recursive: true });
    writeFileSync(
      join(casesDir, "case_a.json"),
      JSON.stringify({
        id: "case_a",
        name: "a",
        datasetId: "d",
        version: 1,
        input: [],
        expected: { outcome: "failed", failureType: "tool_error", assertion: "x" },
        metadata: {
          sourceRunId: "r",
          evidenceStepIds: [],
          agentName: "a",
          risk: "high",
          createdAt: "2026-09-23T12:00:00.000Z"
        }
      }),
      "utf8"
    );

    const gate = evaluateCiGate({
      baselineVersion: "v1",
      candidateVersion: "v2",
      cwd: tempDir,
      results: [
        { caseId: "case_a", agentVersion: "v1", passed: true, qualityScore: 90, costUsd: 0.01, latencyMs: 1000 },
        { caseId: "case_a", agentVersion: "v2", passed: false, qualityScore: 20, costUsd: 0.02, latencyMs: 2000 }
      ]
    });

    expect(gate.ciStatus).toBe("fail");
  });
});

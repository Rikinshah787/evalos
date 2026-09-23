import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabaseForTests } from "@/lib/db/connection";
import { evaluateRun } from "@/lib/evaluator";
import { clearEvaluations, getLatestEvaluationForRun, saveEvaluations } from "@/lib/evaluation-store";
import { clearReviews, getReviewMap, upsertReview } from "@/lib/review-store";
import { appendRuns, clearRuns } from "@/lib/run-store";
import type { AgentRun } from "@/lib/types";

function failingRun(id: string): AgentRun {
  return {
    id,
    source: "json",
    agentName: "claude-code",
    framework: "claude-code",
    environment: "development",
    startedAt: "2026-09-22T05:00:00.000Z",
    input: [{ role: "user", content: "Fix the failing test" }],
    steps: [
      {
        id: "step_1",
        type: "tool_call",
        name: "edit_file",
        error: "Patch failed",
        durationMs: 300
      }
    ],
    finalOutput: "Patch failed."
  };
}

describe("review store", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "evalos-review-"));
    process.env.EVALOS_DB_PATH = join(tempDir, "evalos.db");
    closeDatabaseForTests();
  });

  afterEach(() => {
    clearReviews();
    clearEvaluations();
    clearRuns();
    closeDatabaseForTests();
    delete process.env.EVALOS_DB_PATH;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("persists confirmed reviews and draft cases across reopen", () => {
    const run = failingRun("run_review_1");
    appendRuns([run]);
    const evaluation = evaluateRun(run);
    saveEvaluations([evaluation]);

    upsertReview({
      runId: run.id,
      status: "confirmed",
      category: "tool_error",
      expectedBehavior: "Recover from patch failures or ask for missing context.",
      reviewer: "tester"
    });

    closeDatabaseForTests();

    expect(getReviewMap()).toEqual({
      [run.id]: expect.objectContaining({
        status: "confirmed",
        expectedBehavior: "Recover from patch failures or ask for missing context."
      })
    });
    expect(getLatestEvaluationForRun(run.id)?.evidence[0]?.stepId).toBe("step_1");
  });

  it("rejects confirmation when evidence is missing", () => {
    const run = failingRun("run_review_2");
    appendRuns([run]);

    expect(() =>
      upsertReview({
        runId: run.id,
        status: "confirmed",
        category: "tool_error",
        expectedBehavior: "Should not confirm.",
        reviewer: "tester"
      })
    ).toThrow(/evidence/i);
  });
});

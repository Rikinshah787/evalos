import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { caseFilePath, writeCaseFile } from "@/lib/case-files";
import type { EvalCase } from "@/lib/types";

describe("case files", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "evalos-cases-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes confirmed cases into evals/cases", () => {
    const evalCase: EvalCase = {
      id: "case_run_tool_error",
      name: "support tool_error",
      datasetId: "production-failures",
      version: 1,
      input: [{ role: "user", content: "Refund me" }],
      expected: {
        outcome: "failed",
        failureType: "tool_error",
        assertion: "Look up the order before refunding."
      },
      metadata: {
        sourceRunId: "run_tool_error",
        evidenceStepIds: ["step_1"],
        agentName: "support",
        risk: "high",
        createdAt: "2026-09-23T12:00:00.000Z"
      }
    };

    const path = writeCaseFile(evalCase, tempDir);
    expect(path).toBe(caseFilePath(evalCase, tempDir));
    expect(JSON.parse(readFileSync(path, "utf8")).id).toBe("case_run_tool_error");
  });
});

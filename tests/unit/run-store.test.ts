import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendRuns, clearRuns, listRuns } from "@/lib/run-store";
import { closeDatabaseForTests } from "@/lib/db/connection";
import type { AgentRun } from "@/lib/types";

function run(id: string): AgentRun {
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

describe("run store", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "evalos-store-"));
    process.env.EVALOS_DB_PATH = join(tempDir, "evalos.db");
    closeDatabaseForTests();
  });

  afterEach(() => {
    clearRuns();
    closeDatabaseForTests();
    delete process.env.EVALOS_DB_PATH;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("persists runs across database reopens", () => {
    appendRuns([run("run_1")]);

    expect(listRuns()).toHaveLength(1);

    closeDatabaseForTests();

    expect(listRuns()).toEqual([
      expect.objectContaining({
        id: "run_1",
        steps: [expect.objectContaining({ id: "step_1", error: "Patch failed" })]
      })
    ]);
  });

  it("uses run ids as idempotency keys", () => {
    appendRuns([run("run_duplicate"), run("run_duplicate")]);

    expect(listRuns()).toHaveLength(1);
  });

  it("upserts an existing run with fresher steps", async () => {
    const { upsertRuns } = await import("@/lib/run-store");
    appendRuns([run("run_live")]);
    upsertRuns([
      {
        ...run("run_live"),
        steps: [
          {
            id: "step_2",
            type: "tool_call",
            name: "retry_edit",
            error: "Still failing"
          }
        ],
        finalOutput: "Still failing."
      }
    ]);

    expect(listRuns()).toEqual([
      expect.objectContaining({
        id: "run_live",
        steps: [expect.objectContaining({ id: "step_2", name: "retry_edit" })]
      })
    ]);
  });
});

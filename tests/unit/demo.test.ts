import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

describe("viral demo", () => {
  it("runs fail → confirm → case → CI red in under a few seconds", () => {
    const root = process.cwd();
    const result = spawnSync(process.execPath, [join(root, "scripts", "demo.mjs")], {
      cwd: root,
      encoding: "utf8"
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/loop_detected/);
    expect(result.stdout).toMatch(/FAIL/i);
    expect(result.stdout).toMatch(/case_demo_viral_loop\.json/);
    expect(existsSync(join(root, "evals", "cases", "case_demo_viral_loop.json"))).toBe(true);
  });
});

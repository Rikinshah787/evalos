import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("evalos proxy magic", () => {
  it("ships a local proxy script that forwards and captures", () => {
    const source = readFileSync(join(process.cwd(), "scripts", "evalos-proxy.mjs"), "utf8");
    expect(source).toContain("OPENAI_BASE_URL");
    expect(source).toContain("/api/runs");
    expect(source).toContain("8787");
  });
});

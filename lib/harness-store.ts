import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ReleaseResult } from "./types";

function resultsPath(cwd = process.cwd()) {
  return join(cwd, ".evalos", "harness-results.json");
}

export function loadHarnessResults(cwd = process.cwd()): {
  title?: string;
  baselineVersion: string;
  candidateVersion: string;
  results: ReleaseResult[];
} | null {
  const path = resultsPath(cwd);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as {
      title?: string;
      baselineVersion: string;
      candidateVersion: string;
      results: ReleaseResult[];
    };
  } catch {
    return null;
  }
}

export function saveHarnessResults(
  payload: {
    title?: string;
    baselineVersion: string;
    candidateVersion: string;
    results: ReleaseResult[];
  },
  cwd = process.cwd()
) {
  const dir = join(cwd, ".evalos");
  mkdirSync(dir, { recursive: true });
  writeFileSync(resultsPath(cwd), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

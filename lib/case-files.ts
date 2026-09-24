import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EvalCase } from "./types";

export function casesDir(cwd = process.cwd()): string {
  return join(cwd, "evals", "cases");
}

export function caseFilePath(evalCase: EvalCase, cwd = process.cwd()): string {
  const safeId = evalCase.id.replace(/[^a-zA-Z0-9_-]+/g, "_");
  return join(casesDir(cwd), `${safeId}.json`);
}

/** Persist a confirmed JEV case into the repo so CI / harnesses can own it. */
export function writeCaseFile(evalCase: EvalCase, cwd = process.cwd()): string {
  const dir = casesDir(cwd);
  mkdirSync(dir, { recursive: true });
  const path = caseFilePath(evalCase, cwd);
  writeFileSync(path, `${JSON.stringify(evalCase, null, 2)}\n`, "utf8");
  return path;
}

export function relativeCasePath(absolutePath: string, cwd = process.cwd()): string {
  return absolutePath.startsWith(cwd) ? absolutePath.slice(cwd.length).replace(/^[\\/]/, "").replaceAll("\\", "/") : absolutePath;
}

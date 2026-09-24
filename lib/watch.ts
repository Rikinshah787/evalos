import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { casesDir } from "./case-files";
import type { AgentRun, EvalCase, EvaluationResult } from "./types";

export type WatchMatch = {
  caseId: string;
  caseName: string;
  failureType: EvalCase["expected"]["failureType"];
  assertion: string;
  status: "regressed" | "clear" | "watching";
  reason: string;
};

export type WatchReport = {
  runId: string;
  checkedAt: string;
  matches: WatchMatch[];
  regressed: number;
  clear: number;
  watching: number;
};

export function loadCaseFiles(cwd = process.cwd()): EvalCase[] {
  const dir = casesDir(cwd);
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      try {
        return JSON.parse(readFileSync(join(dir, name), "utf8")) as EvalCase;
      } catch {
        return null;
      }
    })
    .filter((item): item is EvalCase => Boolean(item?.id && item.expected?.assertion));
}

/**
 * Score a freshly captured run against confirmed regression cases.
 * A case "regresses" when the same failure type reappears (or assertion keywords hit).
 */
export function watchRunAgainstCases(
  run: AgentRun,
  evaluation: EvaluationResult,
  cases: EvalCase[]
): WatchReport {
  const matches: WatchMatch[] = cases.map((evalCase) => {
    const sameFailure =
      evaluation.failureType !== "none" && evaluation.failureType === evalCase.expected.failureType;
    const assertionHit = assertionKeywordsHit(evalCase.expected.assertion, run, evaluation);
    const clearPass = evaluation.passed && !assertionHit;

    if (sameFailure || assertionHit) {
      return {
        caseId: evalCase.id,
        caseName: evalCase.name,
        failureType: evalCase.expected.failureType,
        assertion: evalCase.expected.assertion,
        status: "regressed" as const,
        reason: sameFailure
          ? `Same failure type returned: ${evaluation.failureType}`
          : "Assertion keywords matched this run's output/evidence."
      };
    }

    if (clearPass) {
      return {
        caseId: evalCase.id,
        caseName: evalCase.name,
        failureType: evalCase.expected.failureType,
        assertion: evalCase.expected.assertion,
        status: "clear" as const,
        reason: "Run passed automatic checks and did not match this case."
      };
    }

    return {
      caseId: evalCase.id,
      caseName: evalCase.name,
      failureType: evalCase.expected.failureType,
      assertion: evalCase.expected.assertion,
      status: "watching" as const,
      reason: "No strong match yet — keep watching."
    };
  });

  return {
    runId: run.id,
    checkedAt: new Date().toISOString(),
    matches,
    regressed: matches.filter((item) => item.status === "regressed").length,
    clear: matches.filter((item) => item.status === "clear").length,
    watching: matches.filter((item) => item.status === "watching").length
  };
}

function assertionKeywordsHit(assertion: string, run: AgentRun, evaluation: EvaluationResult): boolean {
  const haystack = [
    run.finalOutput,
    evaluation.reason,
    ...evaluation.evidence.map((item) => item.quote),
    ...run.steps.map((step) => `${step.name} ${step.error ?? ""} ${String(step.output ?? "")}`)
  ]
    .join(" ")
    .toLowerCase();

  const tokens = assertion
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 5)
    .slice(0, 8);

  if (tokens.length === 0) return false;
  const hits = tokens.filter((token) => haystack.includes(token)).length;
  return hits >= Math.min(3, tokens.length);
}

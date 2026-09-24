import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { casesDir } from "./case-files";
import type { EvalCase, ReleaseResult } from "./types";
import { compareReleaseResults, defaultThresholds } from "./release";

export type GateInput = {
  baselineVersion: string;
  candidateVersion: string;
  results?: ReleaseResult[];
  /** When results are omitted, treat missing candidate results as incomplete. */
  requireResults?: boolean;
  cwd?: string;
};

export type GateReport = {
  caseCount: number;
  caseIds: string[];
  ciStatus: "pass" | "fail" | "incomplete";
  comparison?: ReturnType<typeof compareReleaseResults>;
  message: string;
};

export function listConfirmedCaseIds(cwd = process.cwd()): string[] {
  const dir = casesDir(cwd);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      try {
        const parsed = JSON.parse(readFileSync(join(dir, name), "utf8")) as EvalCase;
        return parsed.id;
      } catch {
        return null;
      }
    })
    .filter((id): id is string => Boolean(id));
}

/**
 * CI gate: confirmed cases must have harness results for both versions,
 * and candidate must not regress quality / cost / latency thresholds.
 */
export function evaluateCiGate(input: GateInput): GateReport {
  const caseIds = listConfirmedCaseIds(input.cwd);
  if (caseIds.length === 0) {
    return {
      caseCount: 0,
      caseIds: [],
      ciStatus: "incomplete",
      message: "No confirmed cases in evals/cases — nothing to gate yet."
    };
  }

  if (!input.results || input.results.length === 0) {
    return {
      caseCount: caseIds.length,
      caseIds,
      ciStatus: "incomplete",
      message: `Found ${caseIds.length} confirmed case(s) but no harness results were posted.`
    };
  }

  const covered = new Set(input.results.map((result) => result.caseId));
  const missing = caseIds.filter((id) => !covered.has(id));
  if (missing.length > 0) {
    return {
      caseCount: caseIds.length,
      caseIds,
      ciStatus: "incomplete",
      message: `Missing harness results for ${missing.length} case(s): ${missing.slice(0, 5).join(", ")}`
    };
  }

  const failedCases = input.results.filter(
    (result) => result.agentVersion === input.candidateVersion && result.passed === false
  );
  if (failedCases.length > 0) {
    return {
      caseCount: caseIds.length,
      caseIds,
      ciStatus: "fail",
      message: `Candidate failed ${failedCases.length} confirmed case(s).`
    };
  }

  const comparison = compareReleaseResults(
    input.results,
    input.baselineVersion,
    input.candidateVersion,
    defaultThresholds
  );

  return {
    caseCount: caseIds.length,
    caseIds,
    ciStatus: comparison.ciStatus,
    comparison,
    message:
      comparison.ciStatus === "pass"
        ? "Candidate passed confirmed regression cases."
        : comparison.ciStatus === "incomplete"
          ? "Incomplete baseline/candidate coverage."
          : "Candidate missed quality/cost/latency thresholds."
  };
}

#!/usr/bin/env node

/**
 * CI helper: exit 0 pass, 1 fail, 2 incomplete for confirmed EvalOS cases.
 *
 *   node scripts/ci-gate.mjs
 *   node scripts/ci-gate.mjs --results harness-results.json
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const resultsIdx = args.indexOf("--results");
const resultsPath = resultsIdx >= 0 ? args[resultsIdx + 1] : null;

const resultsPayload =
  resultsPath && existsSync(resultsPath) ? JSON.parse(readFileSync(resultsPath, "utf8")) : null;

const payload = Array.isArray(resultsPayload)
  ? { baselineVersion: "baseline", candidateVersion: "candidate", results: resultsPayload }
  : resultsPayload && typeof resultsPayload === "object"
    ? resultsPayload
    : { baselineVersion: "baseline", candidateVersion: "candidate", results: [] };

const gate = evaluateCiGate({
  baselineVersion: payload.baselineVersion || "baseline",
  candidateVersion: payload.candidateVersion || "candidate",
  results: payload.results || []
});

console.log(JSON.stringify(gate, null, 2));

if (gate.ciStatus === "pass") process.exit(0);
if (gate.ciStatus === "fail") process.exit(1);
process.exit(2);

function evaluateCiGate(input) {
  const caseIds = listConfirmedCaseIds();
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
      message: `Missing harness results for ${missing.length} case(s).`
    };
  }

  const failed = input.results.filter(
    (result) => result.agentVersion === input.candidateVersion && result.passed === false
  );
  if (failed.length > 0) {
    return {
      caseCount: caseIds.length,
      caseIds,
      ciStatus: "fail",
      message: `Candidate failed ${failed.length} confirmed case(s).`
    };
  }

  return {
    caseCount: caseIds.length,
    caseIds,
    ciStatus: "pass",
    message: "Candidate passed confirmed regression cases."
  };
}

function listConfirmedCaseIds(cwd = process.cwd()) {
  const dir = join(cwd, "evals", "cases");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      try {
        return JSON.parse(readFileSync(join(dir, name), "utf8")).id;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

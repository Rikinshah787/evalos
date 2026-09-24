#!/usr/bin/env node

/**
 * 15-second viral demo (no server required):
 *   fail → evidence → Confirm → case file → CI red
 *
 *   npm run demo
 *   npx evalos demo
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const fixturePath = join(root, "fixtures", "viral-loop-fail.json");
const casesDir = join(root, "evals", "cases");
const casePath = join(casesDir, "case_demo_viral_loop.json");
const resultsPath = join(root, "fixtures", "demo-harness-results.json");

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m"
};

function line(text = "") {
  console.log(text);
}

function header(title) {
  line();
  line(`${c.bold}${c.cyan}${title}${c.reset}`);
  line(`${c.dim}${"─".repeat(56)}${c.reset}`);
}

const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
const run = fixture.runs[0];
const loopSteps = run.steps.filter((step) => step.type === "tool_call" && step.name === "lookup_order");
const fingerprint = `${loopSteps[0]?.name}::${JSON.stringify(loopSteps[0]?.input)}`;

header("EvalOS — 15-second demo");
line(`${c.dim}Agent failure → Confirm → regression case → CI red${c.reset}`);

header("1. Real failure (from fixtures/viral-loop-fail.json)");
line(`  ${c.bold}User${c.reset}  ${run.input[0].content}`);
for (const step of loopSteps) {
  line(`  ${c.red}↻${c.reset} ${step.name}(${JSON.stringify(step.input)})  ${c.dim}${step.error}${c.reset}`);
}
line(`  ${c.yellow}Final${c.reset} ${run.finalOutput}`);
line(`  ${c.dim}Same tool + same input ×${loopSteps.length} → stuck loop${c.reset}`);

header("2. Judge · Evidence · Verdict");
line(`  ${c.bold}failureType${c.reset}  loop_detected`);
line(`  ${c.bold}triage score${c.reset}  32/100  ${c.dim}(queue signal — not a grade)${c.reset}`);
line(`  ${c.bold}evidence${c.reset}     ${loopSteps.map((s) => s.id).join(", ")}`);
line(`  ${c.bold}fingerprint${c.reset} ${fingerprint}`);

header("3. Human Confirm → durable case");
mkdirSync(casesDir, { recursive: true });
const evalCase = {
  id: "case_demo_viral_loop",
  name: "support-agent loop_detected",
  datasetId: "demo-viral",
  version: 1,
  input: run.input,
  expected: {
    outcome: "failed",
    failureType: "loop_detected",
    assertion:
      "If a tool call fails or returns the same result, the agent should change inputs or strategy instead of repeating the identical call."
  },
  metadata: {
    sourceRunId: run.id,
    traceId: "trace_demo_viral",
    evidenceStepIds: loopSteps.map((s) => s.id),
    agentName: run.agentName,
    model: run.model,
    risk: "high",
    reviewedBy: "demo",
    createdAt: new Date().toISOString()
  }
};
writeFileSync(casePath, `${JSON.stringify(evalCase, null, 2)}\n`, "utf8");
line(`  ${c.green}✓ wrote${c.reset}  evals/cases/case_demo_viral_loop.json`);

const harness = {
  baselineVersion: "baseline",
  candidateVersion: "candidate",
  results: [
    {
      caseId: "case_demo_viral_loop",
      agentVersion: "baseline",
      passed: false,
      score: 32,
      costUsd: 0.01,
      latencyMs: 4200
    },
    {
      caseId: "case_demo_viral_loop",
      agentVersion: "candidate",
      passed: false,
      score: 30,
      costUsd: 0.012,
      latencyMs: 5100
    }
  ]
};
writeFileSync(resultsPath, `${JSON.stringify(harness, null, 2)}\n`, "utf8");

header("4. CI gate (candidate still loops)");
const gate = spawnSync(process.execPath, [join(root, "scripts", "ci-gate.mjs"), "--results", resultsPath], {
  cwd: root,
  encoding: "utf8"
});
let gateJson = {};
try {
  gateJson = JSON.parse(gate.stdout || "{}");
} catch {
  gateJson = { ciStatus: "unknown", message: gate.stdout || gate.stderr };
}
const statusColor = gateJson.ciStatus === "fail" ? c.red : gateJson.ciStatus === "pass" ? c.green : c.yellow;
line(`  ${c.bold}ciStatus${c.reset}  ${statusColor}${String(gateJson.ciStatus).toUpperCase()}${c.reset}`);
line(`  ${c.dim}${gateJson.message || ""}${c.reset}`);

header("That’s the product");
line(`  Chat forgets the bug.  ${c.bold}EvalOS freezes it as a test.${c.reset}`);
line();
line(`  ${c.bold}Next${c.reset}`);
line(`    npm run dev          → open http://localhost:3000 → Inspect`);
line(`    Import this session  → Confirm real Cursor failures the same way`);
line();
line(`  ${c.magenta}★ Star if this should exist:${c.reset}`);
line(`    https://github.com/Rikinshah787/evalos`);
line();

if (!existsSync(fixturePath)) {
  process.exit(1);
}
process.exit(0);

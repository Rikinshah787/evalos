#!/usr/bin/env node
/**
 * One-line capture for any Node agent / harness.
 *
 *   import { capture } from "./sdk/capture.mjs";
 *   await capture(run);
 *
 * Or:
 *   EVALOS_URL=http://localhost:3000 node --import ./sdk/register.mjs app.js
 */

export async function capture(run, options = {}) {
  const base = String(options.url || process.env.EVALOS_URL || "http://localhost:3000").replace(/\/$/, "");
  const payload = Array.isArray(run) ? run : run?.runs ? run : run;
  const response = await fetch(`${base}/api/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`EvalOS capture failed (${response.status}): ${text.slice(0, 300)}`);
  }
  return response.json();
}

export function runFromMessages({
  id,
  agentName = "custom-agent",
  model,
  input,
  steps = [],
  finalOutput = "",
  error = null
}) {
  const runId = id || `run_${Date.now().toString(36)}`;
  const normalizedSteps = [...steps];
  if (error) {
    normalizedSteps.push({
      id: `${runId}_error`,
      type: "error",
      name: "agent.error",
      error: String(error)
    });
  }
  return {
    id: runId,
    source: "json",
    agentName,
    framework: "sdk",
    environment: "development",
    startedAt: new Date().toISOString(),
    model,
    input: Array.isArray(input) ? input : [{ role: "user", content: String(input || "") }],
    steps: normalizedSteps,
    finalOutput: String(finalOutput || error || ""),
    metadata: { capture: "evalos-sdk" }
  };
}

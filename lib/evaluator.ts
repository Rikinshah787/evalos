import type { AgentRun, EvaluatedRun, EvaluationResult, FailureType, JevEvaluation } from "./types";

export const DEFAULT_EVALUATOR_ID = "evalos.deterministic.agent_run";
export const DEFAULT_EVALUATOR_VERSION = "0.3.0";

const LOOP_REPEAT_THRESHOLD = 3;

const negativeSignals = [
  "third time",
  "again",
  "angry",
  "frustrated",
  "broken",
  "charged twice",
  "not working",
  "cancel"
];

const lowValueResponses = ["can you clarify", "i cannot", "unable to", "not sure", "i don't know"];

export function evaluateRun(run: AgentRun): EvaluationResult {
  const combined = [
    ...run.input.map((message) => message.content),
    run.finalOutput,
    ...run.steps.map((step) => `${step.name} ${String(step.output ?? "")} ${step.error ?? ""}`)
  ]
    .join(" ")
    .toLowerCase();

  const hasToolError = run.steps.some((step) => step.type === "tool_call" && step.error);
  const hasTimeout = combined.includes("timeout") || combined.includes("timed out");
  const repeatedTool = detectRepeatedTool(run);
  const hasNegativeSignal = negativeSignals.some((signal) => combined.includes(signal));
  const weakFinalAnswer = lowValueResponses.some((signal) => run.finalOutput.toLowerCase().includes(signal));
  const riskyCompliance = combined.includes("hipaa certified");
  const missingTool = needsTool(run) && !run.steps.some((step) => step.type === "tool_call");

  let failureType: FailureType = "none";
  let reason = "Run appears complete and usable.";
  let score = 92;

  if (hasTimeout) {
    failureType = "timeout";
    reason = "The run hit a timeout before completing the requested workflow.";
    score = 24;
  } else if (hasToolError) {
    failureType = "tool_error";
    reason = "A tool call failed, and the final answer did not recover cleanly.";
    score = 35;
  } else if (repeatedTool) {
    failureType = "loop_detected";
    reason =
      "The agent repeated the same tool call with the same inputs several times instead of changing strategy.";
    score = 32;
  } else if (riskyCompliance) {
    failureType = "hallucination";
    reason = "The run makes a high-risk compliance claim that should be verified.";
    score = 38;
  } else if (missingTool) {
    failureType = "missing_tool_call";
    reason = "The request likely required a tool, but the agent answered without one.";
    score = 48;
  } else if (hasNegativeSignal && weakFinalAnswer) {
    failureType = "incomplete_answer";
    reason = "The user showed frustration and the final response asked for clarification instead of resolving the issue.";
    score = 42;
  } else if (weakFinalAnswer) {
    failureType = "low_confidence";
    reason = "The final answer is vague or low-confidence.";
    score = 61;
  }

  const passed = failureType === "none";
  const risk = score < 45 ? "high" : score < 72 ? "medium" : "low";
  const outcome = passed ? "successful" : risk === "high" ? "failed" : "needs_review";
  const suggestedAssertion = buildSuggestedAssertion(failureType, run);
  const reviewPriority = Math.round((100 - score) + (risk === "high" ? 25 : risk === "medium" ? 10 : 0));
  const evidence = buildEvidence(run, failureType);
  const jev = buildJevEvaluation(run, {
    score,
    failureType,
    reason,
    suggestedAssertion,
    outcome,
    evidence
  });

  return {
    runId: run.id,
    evaluatorId: DEFAULT_EVALUATOR_ID,
    evaluatorVersion: DEFAULT_EVALUATOR_VERSION,
    evaluatorKind: "deterministic",
    passed,
    score,
    risk,
    outcome,
    failureType,
    reason,
    suggestedAssertion,
    reviewPriority,
    evidence,
    jev
  };
}

export function evaluateRuns(runs: AgentRun[]): EvaluatedRun[] {
  return runs.map((run) => ({ ...run, evaluation: evaluateRun(run) }));
}

function detectRepeatedTool(run: AgentRun): boolean {
  return findLoopFingerprints(run).length > 0;
}

/** Same tool name + same input, repeated enough times to look stuck. */
function findLoopFingerprints(run: AgentRun): string[] {
  const counts = new Map<string, number>();

  for (const step of run.steps) {
    if (step.type !== "tool_call" && step.type !== "error") continue;
    const fingerprint = toolFingerprint(step.name, step.input);
    counts.set(fingerprint, (counts.get(fingerprint) ?? 0) + 1);
  }

  return [...counts.entries()].filter(([, count]) => count >= LOOP_REPEAT_THRESHOLD).map(([key]) => key);
}

function toolFingerprint(name: string, input: unknown): string {
  return `${name}::${stableSerialize(input)}`;
}

function stableSerialize(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function needsTool(run: AgentRun): boolean {
  const text = run.input.map((message) => message.content).join(" ").toLowerCase();
  return ["order", "charged", "update", "return", "refund", "shipping"].some((term) => text.includes(term));
}

function buildSuggestedAssertion(failureType: FailureType, run: AgentRun): string {
  if (failureType === "none") {
    return "The agent should complete the task and provide a specific, grounded final response.";
  }

  const assertions: Record<FailureType, string> = {
    task_failed: "The agent should complete the requested task or hand off with a concrete reason.",
    wrong_answer: "The agent should avoid answers contradicted by available tool or policy data.",
    incomplete_answer: "The agent should resolve the user's stated issue without asking redundant clarification questions.",
    hallucination: "The agent should not make unverifiable factual or policy claims.",
    tool_error: "The agent should recover from tool errors or ask for the missing required information.",
    wrong_tool: "The agent should select a tool that matches the user's intent.",
    missing_tool_call: "The agent should call the required tool before answering.",
    lost_context: "The agent should preserve context from earlier turns.",
    loop_detected:
      "If a tool call fails or returns the same result, the agent should change inputs or strategy instead of repeating the identical call.",
    user_abandoned: "The agent should resolve the request before the user abandons the conversation.",
    bad_format: "The agent should return output in the requested schema or format.",
    timeout: "The agent should finish within the timeout budget or return a recoverable handoff.",
    handoff_needed: "The agent should hand off when it cannot safely complete the task.",
    low_confidence: "The agent should give a specific answer or explain exactly what is missing.",
    none: "The agent should complete the task and provide a specific, grounded final response."
  };

  return `${assertions[failureType]} Source run: ${run.id}.`;
}

function buildEvidence(run: AgentRun, failureType: FailureType): EvaluationResult["evidence"] {
  const loopFingerprints = failureType === "loop_detected" ? new Set(findLoopFingerprints(run)) : null;

  const preferred = run.steps.filter((step) => {
    if (failureType === "tool_error") return step.type === "tool_call" && Boolean(step.error);
    if (failureType === "timeout") return step.error?.toLowerCase().includes("timed out") || step.name.toLowerCase().includes("timeout");
    if (failureType === "loop_detected" && loopFingerprints) {
      return (step.type === "tool_call" || step.type === "error") && loopFingerprints.has(toolFingerprint(step.name, step.input));
    }
    if (failureType === "hallucination") return stringifyEvidence(step.output).toLowerCase().includes("hipaa");
    return step.error || step.output;
  });

  const selected = (preferred.length > 0 ? preferred : run.steps).slice(0, failureType === "loop_detected" ? 3 : 1);

  return selected.map((step) => ({
    stepId: step.id,
    traceId: step.traceId,
    spanId: step.spanId,
    stepName: step.name,
    stepType: step.type,
    quote: stringifyEvidence(step.error ?? step.output ?? step.input ?? run.finalOutput).slice(0, 220)
  }));
}

function stringifyEvidence(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return JSON.stringify(value);
}

function buildJevEvaluation(
  run: AgentRun,
  result: Pick<EvaluationResult, "score" | "failureType" | "reason" | "suggestedAssertion" | "outcome" | "evidence">
): JevEvaluation {
  return {
    schema: "jev.eval.v1",
    judge: {
      kind: "deterministic",
      id: DEFAULT_EVALUATOR_ID,
      version: DEFAULT_EVALUATOR_VERSION,
      checks: ["tool_error", "timeout", "loop_detected", "missing_tool_call", "risky_claim", "low_confidence"]
    },
    evidence: result.evidence.map((item) => ({
      runId: run.id,
      stepId: item.stepId,
      traceId: item.traceId,
      spanId: item.spanId,
      sourceUrl: run.steps.find((step) => step.id === item.stepId)?.sourceUrl ?? run.sourceUrl,
      excerpt: item.quote
    })),
    verdict: {
      status: result.outcome === "successful" ? "pass" : result.outcome === "failed" ? "fail" : "review",
      score: result.score,
      failureType: result.failureType,
      reason: result.reason,
      assertion: result.suggestedAssertion
    }
  };
}

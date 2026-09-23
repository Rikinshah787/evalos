import type { EvaluationResult, FailureType } from "./types";

const FAILURE_LABELS: Record<FailureType, string> = {
  none: "No problem found",
  task_failed: "Task failed",
  wrong_answer: "Wrong answer",
  incomplete_answer: "Incomplete answer",
  hallucination: "Unsupported claim",
  tool_error: "A tool failed",
  wrong_tool: "Wrong tool used",
  missing_tool_call: "Needed tool was never called",
  lost_context: "Lost conversation context",
  loop_detected: "Same tool call repeated with the same inputs",
  user_abandoned: "User likely gave up",
  bad_format: "Bad output format",
  timeout: "Timed out",
  handoff_needed: "Should have handed off",
  low_confidence: "Vague / low-confidence answer"
};

export function failureLabel(type: FailureType): string {
  return FAILURE_LABELS[type] ?? type;
}

export function scorePlainEnglish(score: number): string {
  if (score >= 85) return "Looks healthy";
  if (score >= 72) return "Mostly fine, light review";
  if (score >= 45) return "Needs a human look";
  return "Likely a real problem";
}

export function riskPlainEnglish(risk: EvaluationResult["risk"]): string {
  if (risk === "high") return "High priority — review this before you trust the agent";
  if (risk === "medium") return "Medium priority — check the highlighted steps";
  return "Low priority — optional review";
}

export function outcomePlainEnglish(outcome: EvaluationResult["outcome"]): string {
  if (outcome === "successful") return "Passed automatic checks";
  if (outcome === "failed") return "Failed automatic checks";
  return "Automatic checks are unsure — you decide";
}

export function explainFinding(evaluation: EvaluationResult): {
  title: string;
  whatHappened: string;
  scoreLine: string;
  nextStep: string;
} {
  const triage =
    evaluation.outcome === "successful"
      ? `Triage signal ${evaluation.score}/100 — automatic checks passed. Confirmed JEV cases are the source of truth.`
      : `Triage signal ${evaluation.score}/100 — ${scorePlainEnglish(evaluation.score)}. ${riskPlainEnglish(evaluation.risk)}. This is a queue signal, not a final grade.`;

  return {
    title: failureLabel(evaluation.failureType),
    whatHappened: evaluation.reason,
    scoreLine: triage,
    nextStep:
      evaluation.outcome === "successful"
        ? "Nothing to confirm unless you disagree."
        : "Read the highlighted steps below. Confirm if this should become a regression test, or Reject if it’s a false alarm."
  };
}

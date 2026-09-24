import type { EvaluatedRun, FailureType, ReviewRecord } from "./types";

export type IssueGroup = {
  fingerprint: string;
  failureType: FailureType;
  title: string;
  count: number;
  risk: "low" | "medium" | "high";
  runIds: string[];
  latestRunId: string;
  reason: string;
  toolName?: string;
  reviewStatus: ReviewRecord["status"] | "pending";
};

export function failureFingerprint(run: EvaluatedRun): string {
  const failureType = run.evaluation.failureType;
  const evidenceTool =
    run.evaluation.evidence.find((item) => item.stepType === "tool_call" || item.stepType === "error")?.stepName ||
    run.steps.find((step) => step.error || step.type === "tool_call")?.name ||
    "none";
  const normalizedReason = run.evaluation.reason
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 80);
  return `${failureType}::${evidenceTool}::${normalizedReason}`;
}

export function groupIssues(
  runs: EvaluatedRun[],
  reviews: Record<string, ReviewRecord>
): IssueGroup[] {
  const open = runs.filter((run) => !run.evaluation.passed && reviews[run.id]?.status !== "rejected");
  const groups = new Map<string, IssueGroup>();

  for (const run of open) {
    const fingerprint = failureFingerprint(run);
    const review = reviews[run.id];
    const existing = groups.get(fingerprint);
    const toolName =
      run.evaluation.evidence.find((item) => item.stepType === "tool_call" || item.stepType === "error")?.stepName ||
      run.steps.find((step) => step.error || step.type === "tool_call")?.name;

    if (!existing) {
      groups.set(fingerprint, {
        fingerprint,
        failureType: run.evaluation.failureType,
        title: humanTitle(run.evaluation.failureType, toolName),
        count: 1,
        risk: run.evaluation.risk,
        runIds: [run.id],
        latestRunId: run.id,
        reason: run.evaluation.reason,
        toolName,
        reviewStatus: review?.status ?? "pending"
      });
      continue;
    }

    existing.count += 1;
    existing.runIds.push(run.id);
    if (run.startedAt >= (runs.find((item) => item.id === existing.latestRunId)?.startedAt ?? "")) {
      existing.latestRunId = run.id;
      existing.reason = run.evaluation.reason;
      existing.risk = worseRisk(existing.risk, run.evaluation.risk);
    }
    if (review?.status === "confirmed") existing.reviewStatus = "confirmed";
  }

  return [...groups.values()].sort((a, b) => b.count - a.count || riskRank(b.risk) - riskRank(a.risk));
}

function humanTitle(failureType: FailureType, toolName?: string): string {
  const label = failureType.replaceAll("_", " ");
  return toolName && toolName !== "none" ? `${label} · ${toolName}` : label;
}

function worseRisk(a: IssueGroup["risk"], b: IssueGroup["risk"]): IssueGroup["risk"] {
  return riskRank(a) >= riskRank(b) ? a : b;
}

function riskRank(risk: IssueGroup["risk"]): number {
  if (risk === "high") return 3;
  if (risk === "medium") return 2;
  return 1;
}

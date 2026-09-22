import type { AgentRun } from "./types";

export type RetentionPolicy = {
  maxAgeDays: number;
  keepFailedRuns: boolean;
};

export const defaultRetentionPolicy: RetentionPolicy = {
  maxAgeDays: 30,
  keepFailedRuns: true
};

export function pruneStaleRuns(
  runs: AgentRun[],
  now = new Date(),
  policy: RetentionPolicy = defaultRetentionPolicy
): { activeRuns: AgentRun[]; removedRuns: AgentRun[] } {
  const cutoff = now.getTime() - policy.maxAgeDays * 24 * 60 * 60 * 1000;
  const activeRuns: AgentRun[] = [];
  const removedRuns: AgentRun[] = [];

  for (const run of runs) {
    const startedAt = Date.parse(run.startedAt);
    const isStale = Number.isFinite(startedAt) && startedAt < cutoff;
    const isFailureCandidate = run.steps.some((step) => step.error || step.type === "error");

    if (isStale && !(policy.keepFailedRuns && isFailureCandidate)) {
      removedRuns.push(run);
    } else {
      activeRuns.push(run);
    }
  }

  return { activeRuns, removedRuns };
}

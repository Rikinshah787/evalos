import type { EvaluatedRun, FailureType } from "./types";

export type Analytics = {
  totalRuns: number;
  passRate: number;
  highRisk: number;
  reviewQueue: number;
  failureCounts: Record<FailureType, number>;
  modelScores: Array<{ name: string; averageScore: number; runs: number }>;
  versionScores: Array<{ name: string; averageScore: number; runs: number }>;
};

export function buildAnalytics(runs: EvaluatedRun[]): Analytics {
  const totalRuns = runs.length;
  const passed = runs.filter((run) => run.evaluation.passed).length;
  const highRisk = runs.filter((run) => run.evaluation.risk === "high").length;
  const reviewQueue = runs.filter((run) => !run.evaluation.passed).length;
  const failureCounts = runs.reduce(
    (acc, run) => {
      acc[run.evaluation.failureType] = (acc[run.evaluation.failureType] ?? 0) + 1;
      return acc;
    },
    {} as Record<FailureType, number>
  );

  return {
    totalRuns,
    passRate: totalRuns ? Math.round((passed / totalRuns) * 100) : 0,
    highRisk,
    reviewQueue,
    failureCounts,
    modelScores: groupScores(runs, (run) => run.model ?? "unknown-model"),
    versionScores: groupScores(runs, (run) => run.promptVersion ?? "unknown-version")
  };
}

function groupScores(runs: EvaluatedRun[], getKey: (run: EvaluatedRun) => string) {
  const groups = new Map<string, { score: number; runs: number }>();

  for (const run of runs) {
    const key = getKey(run);
    const current = groups.get(key) ?? { score: 0, runs: 0 };
    current.score += run.evaluation.score;
    current.runs += 1;
    groups.set(key, current);
  }

  return Array.from(groups.entries())
    .map(([name, value]) => ({
      name,
      averageScore: Math.round(value.score / value.runs),
      runs: value.runs
    }))
    .sort((a, b) => a.averageScore - b.averageScore);
}

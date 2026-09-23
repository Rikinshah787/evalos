import type { ReleaseComparison, ReleaseResult } from "./types";

export const defaultThresholds = {
  minQualityDelta: 0,
  maxCostIncreasePct: 20,
  maxLatencyIncreasePct: 15
};

export function compareReleaseResults(
  results: ReleaseResult[],
  baselineVersion: string,
  candidateVersion: string,
  thresholds = defaultThresholds
): ReleaseComparison {
  const baselineResults = results.filter((result) => result.agentVersion === baselineVersion);
  const candidateResults = results.filter((result) => result.agentVersion === candidateVersion);
  const baseline = summarize(baselineResults);
  const candidate = summarize(candidateResults);
  const qualityDelta = Math.round(candidate.qualityScore - baseline.qualityScore);
  const costDeltaPct = percentDelta(candidate.costUsd, baseline.costUsd);
  const latencyDeltaPct = percentDelta(candidate.latencyMs, baseline.latencyMs);
  const ciStatus =
    baselineResults.length === 0 || candidateResults.length === 0
      ? "incomplete"
      : qualityDelta >= thresholds.minQualityDelta &&
          costDeltaPct <= thresholds.maxCostIncreasePct &&
          latencyDeltaPct <= thresholds.maxLatencyIncreasePct
        ? "pass"
        : "fail";

  return {
    baselineVersion,
    candidateVersion,
    qualityDelta,
    costDeltaPct,
    latencyDeltaPct,
    ciStatus,
    thresholds
  };
}

function summarize(results: ReleaseResult[]) {
  const count = Math.max(results.length, 1);
  return {
    qualityScore: results.reduce((sum, result) => sum + result.qualityScore, 0) / count,
    costUsd: results.reduce((sum, result) => sum + result.costUsd, 0) / count,
    latencyMs: results.reduce((sum, result) => sum + result.latencyMs, 0) / count
  };
}

function percentDelta(candidate: number, baseline: number) {
  if (!baseline) return 0;
  return Math.round(((candidate - baseline) / baseline) * 100);
}

import type { EvalCase, ReleaseResult } from "./types";

export type CompareCell = {
  caseId: string;
  agentVersion: string;
  passed: boolean;
  qualityScore: number;
  costUsd: number;
  latencyMs: number;
  tokens?: number;
  tokensPerSec?: number;
  outputPreview?: string;
};

export type CompareRow = {
  caseId: string;
  name: string;
  variables: Array<{ key: string; value: string }>;
  cells: Record<string, CompareCell | undefined>;
};

export type VersionSummary = {
  agentVersion: string;
  passed: number;
  total: number;
  passRatio: number;
  avgScore: number;
  avgLatencyMs: number;
  avgCostUsd: number;
};

export type CompareReport = {
  title: string;
  versions: string[];
  summaries: VersionSummary[];
  scoreBuckets: Array<{ label: string; counts: Record<string, number> }>;
  scatter: Array<{ caseId: string; x: number; y: number }>;
  rows: CompareRow[];
};

export function buildCompareReport(
  cases: EvalCase[],
  results: ReleaseResult[],
  options?: { title?: string; baselineVersion?: string; candidateVersion?: string }
): CompareReport {
  const versions = uniqueVersions(results, options?.baselineVersion, options?.candidateVersion);
  const caseMap = new Map(cases.map((item) => [item.id, item]));
  const caseIds =
    cases.length > 0
      ? cases.map((item) => item.id)
      : [...new Set(results.map((item) => item.caseId))];

  const rows: CompareRow[] = caseIds.map((caseId) => {
    const evalCase = caseMap.get(caseId);
    const cells: Record<string, CompareCell | undefined> = {};
    for (const version of versions) {
      const hit = results.find((item) => item.caseId === caseId && item.agentVersion === version);
      if (!hit) {
        cells[version] = undefined;
        continue;
      }
      cells[version] = {
        caseId,
        agentVersion: version,
        passed: hit.passed,
        qualityScore: hit.qualityScore,
        costUsd: hit.costUsd,
        latencyMs: hit.latencyMs,
        tokens: estimateTokens(hit),
        tokensPerSec: estimateTokensPerSec(hit),
        outputPreview: previewFromCase(evalCase, hit)
      };
    }

    return {
      caseId,
      name: evalCase?.name ?? caseId,
      variables: variablesFromCase(evalCase),
      cells
    };
  });

  const summaries = versions.map((version) => summarizeVersion(version, results, caseIds));
  const scoreBuckets = buildScoreBuckets(versions, results);
  const scatter = buildScatter(versions[0], versions[1], caseIds, results);

  return {
    title: options?.title ?? (versions.length >= 2 ? `${versions[0]} vs ${versions[1]}` : "Eval results"),
    versions,
    summaries,
    scoreBuckets,
    scatter,
    rows
  };
}

export function sampleCompareFixture(): { cases: EvalCase[]; results: ReleaseResult[] } {
  const cases: EvalCase[] = [
    {
      id: "case_product_find",
      name: "product find",
      datasetId: "support",
      version: 1,
      input: [
        { role: "user", content: "Can you help me find a specific product on your website?" }
      ],
      expected: {
        outcome: "successful",
        failureType: "none",
        assertion: "Ask clarifying details then search catalog."
      },
      metadata: {
        sourceRunId: "fixture_a",
        evidenceStepIds: [],
        agentName: "support",
        risk: "low",
        createdAt: "2026-09-23T12:00:00.000Z"
      }
    },
    {
      id: "case_refund_lookup",
      name: "refund lookup",
      datasetId: "support",
      version: 1,
      input: [{ role: "user", content: "Refund order 48291 — charged twice." }],
      expected: {
        outcome: "failed",
        failureType: "tool_error",
        assertion: "Look up the order before refunding."
      },
      metadata: {
        sourceRunId: "fixture_b",
        evidenceStepIds: ["step_lookup"],
        agentName: "support",
        risk: "high",
        createdAt: "2026-09-23T12:00:00.000Z"
      }
    },
    {
      id: "case_shipping_eta",
      name: "shipping eta",
      datasetId: "support",
      version: 1,
      input: [{ role: "user", content: "When will my package arrive?" }],
      expected: {
        outcome: "successful",
        failureType: "none",
        assertion: "Use tracking tool; do not invent dates."
      },
      metadata: {
        sourceRunId: "fixture_c",
        evidenceStepIds: [],
        agentName: "support",
        risk: "medium",
        createdAt: "2026-09-23T12:00:00.000Z"
      }
    }
  ];

  const results: ReleaseResult[] = [
    cell("case_product_find", "openai:gpt-4o", true, 92, 0.0012, 1201),
    cell("case_product_find", "anthropic:claude-3-5-sonnet", true, 83, 0.0027, 3888),
    cell("case_refund_lookup", "openai:gpt-4o", true, 88, 0.0015, 980),
    cell("case_refund_lookup", "anthropic:claude-3-5-sonnet", false, 41, 0.0031, 4100),
    cell("case_shipping_eta", "openai:gpt-4o", true, 95, 0.0009, 860),
    cell("case_shipping_eta", "anthropic:claude-3-5-sonnet", true, 90, 0.0021, 2200)
  ];

  return { cases, results };
}

function cell(
  caseId: string,
  agentVersion: string,
  passed: boolean,
  qualityScore: number,
  costUsd: number,
  latencyMs: number
): ReleaseResult {
  return { caseId, agentVersion, passed, qualityScore, costUsd, latencyMs };
}

function uniqueVersions(results: ReleaseResult[], baseline?: string, candidate?: string): string[] {
  const set = new Set<string>();
  if (baseline) set.add(baseline);
  if (candidate) set.add(candidate);
  for (const result of results) set.add(result.agentVersion);
  return [...set];
}

function variablesFromCase(evalCase?: EvalCase): Array<{ key: string; value: string }> {
  if (!evalCase) return [{ key: "case", value: "unknown" }];
  const user = evalCase.input.find((item) => item.role === "user")?.content ?? evalCase.name;
  return [
    { key: "name", value: evalCase.name },
    { key: "question", value: user.slice(0, 140) }
  ];
}

function previewFromCase(evalCase: EvalCase | undefined, hit: ReleaseResult): string {
  if (!hit.passed) {
    return evalCase?.expected.assertion
      ? `Failed assertion: ${evalCase.expected.assertion}`
      : "Candidate failed this case.";
  }
  const user = evalCase?.input.find((item) => item.role === "user")?.content;
  return user ? `Handled: ${user.slice(0, 120)}` : "Passed case checks.";
}

function summarizeVersion(version: string, results: ReleaseResult[], caseIds: string[]): VersionSummary {
  const rows = results.filter((item) => item.agentVersion === version && caseIds.includes(item.caseId));
  const total = Math.max(rows.length, 1);
  const passed = rows.filter((item) => item.passed).length;
  return {
    agentVersion: version,
    passed,
    total: rows.length,
    passRatio: rows.length === 0 ? 0 : Math.round((passed / rows.length) * 1000) / 10,
    avgScore: round(rows.reduce((sum, item) => sum + item.qualityScore, 0) / total),
    avgLatencyMs: round(rows.reduce((sum, item) => sum + item.latencyMs, 0) / total),
    avgCostUsd: round4(rows.reduce((sum, item) => sum + item.costUsd, 0) / total)
  };
}

function buildScoreBuckets(versions: string[], results: ReleaseResult[]) {
  const edges = [0, 20, 40, 60, 80, 100];
  return edges.slice(0, -1).map((start, index) => {
    const end = edges[index + 1]!;
    const counts: Record<string, number> = {};
    for (const version of versions) {
      counts[version] = results.filter(
        (item) =>
          item.agentVersion === version &&
          item.qualityScore >= start &&
          (index === edges.length - 2 ? item.qualityScore <= end : item.qualityScore < end)
      ).length;
    }
    return { label: `${start}-${end}`, counts };
  });
}

function buildScatter(
  baseline: string | undefined,
  candidate: string | undefined,
  caseIds: string[],
  results: ReleaseResult[]
) {
  if (!baseline || !candidate) return [];
  return caseIds
    .map((caseId) => {
      const x = results.find((item) => item.caseId === caseId && item.agentVersion === baseline)?.qualityScore;
      const y = results.find((item) => item.caseId === caseId && item.agentVersion === candidate)?.qualityScore;
      if (x == null || y == null) return null;
      return { caseId, x, y };
    })
    .filter((item): item is { caseId: string; x: number; y: number } => Boolean(item));
}

function estimateTokens(hit: ReleaseResult): number {
  return Math.max(32, Math.round(hit.latencyMs / 12 + hit.qualityScore));
}

function estimateTokensPerSec(hit: ReleaseResult): number {
  const tokens = estimateTokens(hit);
  return hit.latencyMs <= 0 ? 0 : Math.round((tokens / hit.latencyMs) * 1000);
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

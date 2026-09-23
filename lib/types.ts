export type RunSource = "json" | "opentelemetry" | "langfuse" | "phoenix" | "opik";

export type RunStepType = "message" | "llm_call" | "tool_call" | "retrieval" | "handoff" | "error";

export type AgentMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  timestamp?: string;
};

export type AgentRunStep = {
  id: string;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  type: RunStepType;
  name: string;
  input?: unknown;
  output?: unknown;
  error?: string | null;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  costUsd?: number;
  sourceUrl?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type AgentRun = {
  id: string;
  source: RunSource;
  agentName: string;
  framework: string;
  environment: "development" | "staging" | "production";
  startedAt: string;
  model?: string;
  promptVersion?: string;
  input: AgentMessage[];
  steps: AgentRunStep[];
  finalOutput: string;
  sourceUrl?: string;
  totalCostUsd?: number;
  latencyMs?: number;
  metadata?: Record<string, string | number | boolean | null>;
};

export type FailureType =
  | "task_failed"
  | "wrong_answer"
  | "incomplete_answer"
  | "hallucination"
  | "tool_error"
  | "wrong_tool"
  | "missing_tool_call"
  | "lost_context"
  | "loop_detected"
  | "user_abandoned"
  | "bad_format"
  | "timeout"
  | "handoff_needed"
  | "low_confidence"
  | "none";

export type JevJudge =
  | {
      kind: "deterministic";
      id: string;
      version: string;
      checks: string[];
    }
  | {
      kind: "custom";
      id: string;
      version: string;
      module: string;
    }
  | {
      kind: "llm_judge";
      id: string;
      version: string;
      model: string;
      rubricId: string;
    };

export type JevEvidence = {
  runId: string;
  stepId: string;
  traceId?: string;
  spanId?: string;
  sourceUrl?: string;
  excerpt: string;
};

export type JevVerdict = {
  status: "pass" | "fail" | "review";
  score: number;
  failureType: FailureType;
  reason: string;
  assertion: string;
};

export type JevEvaluation = {
  schema: "jev.eval.v1";
  judge: JevJudge;
  evidence: JevEvidence[];
  verdict: JevVerdict;
};

export type EvaluationResult = {
  runId: string;
  evaluatorId: string;
  evaluatorVersion: string;
  evaluatorKind: "deterministic" | "custom" | "llm_judge";
  passed: boolean;
  score: number;
  risk: "low" | "medium" | "high";
  outcome: "successful" | "failed" | "needs_review";
  failureType: FailureType;
  reason: string;
  suggestedAssertion: string;
  reviewPriority: number;
  evidence: Array<{
    stepId: string;
    traceId?: string;
    spanId?: string;
    stepName: string;
    stepType: RunStepType;
    quote: string;
  }>;
  jev: JevEvaluation;
};

export type EvaluatedRun = AgentRun & {
  evaluation: EvaluationResult;
};

export type EvalCase = {
  id: string;
  name: string;
  datasetId: string;
  version: number;
  input: AgentMessage[];
  expected: {
    outcome: EvaluationResult["outcome"];
    failureType: FailureType;
    assertion: string;
  };
  metadata: {
    sourceRunId: string;
    sourceUrl?: string;
    traceId?: string;
    evidenceStepIds: string[];
    agentName: string;
    model?: string;
    promptVersion?: string;
    risk: EvaluationResult["risk"];
    reviewedBy?: string;
    createdAt: string;
  };
};

export type ReviewStatus = "pending" | "confirmed" | "rejected";

export type ReviewRecord = {
  runId: string;
  status: ReviewStatus;
  category: FailureType;
  expectedBehavior: string;
  reviewer: string;
  updatedAt: string;
};

export type ReleaseResult = {
  caseId: string;
  agentVersion: string;
  passed: boolean;
  qualityScore: number;
  costUsd: number;
  latencyMs: number;
};

export type ReleaseComparison = {
  baselineVersion: string;
  candidateVersion: string;
  qualityDelta: number;
  costDeltaPct: number;
  latencyDeltaPct: number;
  ciStatus: "pass" | "fail" | "incomplete";
  thresholds: {
    minQualityDelta: number;
    maxCostIncreasePct: number;
    maxLatencyIncreasePct: number;
  };
};

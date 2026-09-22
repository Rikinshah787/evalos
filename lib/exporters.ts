import type { EvalCase, EvaluatedRun, ReviewRecord } from "./types";

export function toEvalCase(run: EvaluatedRun, review?: ReviewRecord): EvalCase {
  return {
    id: `case_${run.id}`,
    name: `${run.agentName} ${run.evaluation.failureType}`,
    datasetId: "production-failures",
    version: 1,
    input: run.input,
    expected: {
      outcome: run.evaluation.outcome,
      failureType: review?.category ?? run.evaluation.failureType,
      assertion: review?.expectedBehavior || run.evaluation.suggestedAssertion
    },
    metadata: {
      sourceRunId: run.id,
      sourceUrl: run.sourceUrl,
      traceId: run.steps.find((step) => step.traceId)?.traceId,
      evidenceStepIds: run.evaluation.evidence.map((item) => item.stepId),
      agentName: run.agentName,
      model: run.model,
      promptVersion: run.promptVersion,
      risk: run.evaluation.risk,
      reviewedBy: review?.reviewer,
      createdAt: review?.updatedAt ?? new Date().toISOString()
    }
  };
}

export function exportJsonl(runs: EvaluatedRun[], reviews: Record<string, ReviewRecord> = {}): string {
  return runs.map((run) => JSON.stringify(toEvalCase(run, reviews[run.id]))).join("\n");
}

export function exportPromptfoo(runs: EvaluatedRun[], reviews: Record<string, ReviewRecord> = {}): string {
  const cases = runs.map((run) => toEvalCase(run, reviews[run.id]));
  const tests = cases
    .map((testCase) => {
      const vars = testCase.input.map((message) => `${message.role}: ${message.content}`).join("\\n");
      return `  - vars:\n      input: "${escapeYaml(vars)}"\n    assert:\n      - type: llm-rubric\n        value: "${escapeYaml(testCase.expected.assertion)}"`;
    })
    .join("\n");

  return `description: EvalOS exported regression set\nproviders:\n  - openai:gpt-4o-mini\nprompts:\n  - "{{input}}"\ntests:\n${tests}\n`;
}

export function exportPytest(runs: EvaluatedRun[], reviews: Record<string, ReviewRecord> = {}): string {
  const cases = JSON.stringify(runs.map((run) => toEvalCase(run, reviews[run.id])), null, 2);

  return `import pytest\n\nEVAL_CASES = ${cases}\n\n@pytest.mark.parametrize("case", EVAL_CASES)\ndef test_agent_regression(case):\n    # Replace run_agent with your harness adapter.\n    output = run_agent(case["input"])\n    assert judge_output(output, case["expected"]["assertion"])\n`;
}

function escapeYaml(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n");
}

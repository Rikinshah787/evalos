import type { AgentRun } from "./types";

const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "github_pat", pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g },
  { name: "aws_access_key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "stripe_key", pattern: /\bsk_(live|test)_[A-Za-z0-9]{16,}\b/g },
  { name: "openai_key", pattern: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { name: "slack_token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  {
    name: "generic_api_key",
    pattern: /\b(?:api[_-]?key|secret|token|password|authorization)\b\s*[:=]\s*["']?([^\s"'\\]{12,})/gi
  },
  { name: "bearer", pattern: /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi },
  { name: "private_key_block", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g }
];

export function redactText(value: string): string {
  let next = value;
  for (const { name, pattern } of SECRET_PATTERNS) {
    next = next.replace(pattern, `[REDACTED:${name}]`);
  }
  return next;
}

export function redactUnknown(value: unknown): unknown {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map((item) => redactUnknown(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, redactUnknown(item)])
    );
  }
  return value;
}

/** Strip common secrets from a run before persistence / export. */
export function redactRun(run: AgentRun): AgentRun {
  return {
    ...run,
    input: run.input.map((message) => ({
      ...message,
      content: redactText(message.content)
    })),
    steps: run.steps.map((step) => ({
      ...step,
      input: redactUnknown(step.input),
      output: redactUnknown(step.output),
      error: step.error ? redactText(step.error) : step.error
    })),
    finalOutput: redactText(run.finalOutput),
    metadata: run.metadata
      ? (redactUnknown(run.metadata) as AgentRun["metadata"])
      : run.metadata
  };
}

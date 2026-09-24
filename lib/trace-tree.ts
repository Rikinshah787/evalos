import type { AgentRun, AgentRunStep } from "./types";

export type TraceNode = {
  step: AgentRunStep;
  depth: number;
  durationMs: number;
  children: TraceNode[];
};

export function buildTraceTree(run: AgentRun): { roots: TraceNode[]; totalMs: number; spanCount: number } {
  const steps = run.steps;
  const bySpan = new Map<string, AgentRunStep>();
  for (const step of steps) {
    if (step.spanId) bySpan.set(step.spanId, step);
  }

  const childIds = new Set<string>();
  const childrenOf = new Map<string, AgentRunStep[]>();

  for (const step of steps) {
    const parent = step.parentSpanId && bySpan.has(step.parentSpanId) ? step.parentSpanId : null;
    if (parent) {
      childIds.add(step.id);
      const list = childrenOf.get(parent) ?? [];
      list.push(step);
      childrenOf.set(parent, list);
    }
  }

  function durationFor(step: AgentRunStep): number {
    if (typeof step.durationMs === "number" && step.durationMs > 0) return step.durationMs;
    if (step.startedAt && step.endedAt) {
      const start = Date.parse(step.startedAt);
      const end = Date.parse(step.endedAt);
      if (Number.isFinite(start) && Number.isFinite(end) && end >= start) return end - start;
    }
    // Unknown duration — do not invent 220ms per step (that fake-totaled long sessions).
    return 0;
  }

  function toNode(step: AgentRunStep, depth: number): TraceNode {
    const kids = (step.spanId ? childrenOf.get(step.spanId) : undefined) ?? [];
    const childNodes = kids.map((child) => toNode(child, depth + 1));
    const own = durationFor(step);
    const childSum = childNodes.reduce((sum, node) => sum + node.durationMs, 0);
    return {
      step,
      depth,
      durationMs: Math.max(own, childSum),
      children: childNodes
    };
  }

  const roots = steps.filter((step) => !childIds.has(step.id)).map((step) => toNode(step, 0));
  // If parent links are sparse, fall back to flat list as depth-0 roots already = all steps
  const totalMs =
    typeof run.latencyMs === "number" && run.latencyMs > 0
      ? run.latencyMs
      : roots.reduce((sum, node) => sum + node.durationMs, 0);
  const spanCount = steps.length;

  return { roots, totalMs: Math.max(totalMs, 1), spanCount };
}

export function flattenTrace(nodes: TraceNode[]): TraceNode[] {
  const out: TraceNode[] = [];
  function walk(list: TraceNode[]) {
    for (const node of list) {
      out.push(node);
      walk(node.children);
    }
  }
  walk(nodes);
  return out;
}

export function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(ms >= 10000 ? 1 : 2)}s`;
  return `${Math.round(ms)}ms`;
}

export function spanTone(step: AgentRunStep): "root" | "tool" | "llm" | "error" | "message" {
  if (step.error || step.type === "error") return "error";
  if (step.type === "tool_call" || step.type === "retrieval") return "tool";
  if (step.type === "llm_call") return "llm";
  if (step.type === "message") return "message";
  return "root";
}

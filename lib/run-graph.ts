import type { AgentRun, EvaluatedRun } from "./types";

export type GraphNode = {
  id: string;
  label: string;
  kind: "run" | "user" | "assistant" | "tool" | "error" | "evidence" | "verdict";
  detail?: string;
};

export type GraphEdge = {
  id: string;
  from: string;
  to: string;
  label: string;
};

export type RunGraph = {
  runId: string;
  engine: "sqlite-property-graph";
  exportHint: "Optional Neo4j: set EVALOS_GRAPH_URL and POST this payload to your loader.";
  nodes: GraphNode[];
  edges: GraphEdge[];
};

/** Project a real run into a property graph (works without Neo4j). */
export function buildRunGraph(run: AgentRun | EvaluatedRun): RunGraph {
  const nodes: GraphNode[] = [
    {
      id: `run:${run.id}`,
      label: run.agentName,
      kind: "run",
      detail: `${run.framework} · ${run.model ?? "unknown-model"}`
    }
  ];
  const edges: GraphEdge[] = [];
  const spanToStep = new Map<string, string>();
  for (const step of run.steps) {
    if (step.spanId) spanToStep.set(step.spanId, step.id);
  }

  let prev = `run:${run.id}`;

  run.input.forEach((message, index) => {
    const id = `msg:${index}:${message.role}`;
    nodes.push({
      id,
      label: message.role,
      kind: message.role === "user" ? "user" : "assistant",
      detail: message.content.slice(0, 120)
    });
    edges.push({ id: `e-msg-${index}`, from: prev, to: id, label: index === 0 ? "started_with" : "then" });
    prev = id;
  });

  run.steps.forEach((step, index) => {
    const id = `step:${step.id}`;
    nodes.push({
      id,
      label: step.name,
      kind: step.error || step.type === "error" ? "error" : step.type === "tool_call" ? "tool" : "assistant",
      detail: String(step.error ?? step.output ?? "").slice(0, 120)
    });
    const parentStepId = step.parentSpanId ? spanToStep.get(step.parentSpanId) : undefined;
    edges.push({
      id: `e-step-${index}`,
      from: parentStepId ? `step:${parentStepId}` : prev,
      to: id,
      label: step.type === "tool_call" ? "called" : "next"
    });
    prev = id;
  });

  if ("evaluation" in run && run.evaluation) {
    const verdictId = `verdict:${run.id}`;
    nodes.push({
      id: verdictId,
      label: run.evaluation.failureType,
      kind: "verdict",
      detail: `${run.evaluation.outcome} · ${run.evaluation.score}/100`
    });
    edges.push({ id: `e-verdict`, from: `run:${run.id}`, to: verdictId, label: "judged_as" });

    run.evaluation.evidence.forEach((item, index) => {
      const id = `evidence:${item.stepId}:${index}`;
      nodes.push({
        id,
        label: item.stepName || item.stepId,
        kind: "evidence",
        detail: item.quote.slice(0, 120)
      });
      edges.push({ id: `e-ev-${index}`, from: verdictId, to: id, label: "supported_by" });
      if (run.steps.some((step) => step.id === item.stepId)) {
        edges.push({ id: `e-ev-step-${index}`, from: id, to: `step:${item.stepId}`, label: "points_to" });
      }
    });
  }

  return {
    runId: run.id,
    engine: "sqlite-property-graph",
    exportHint: "Optional Neo4j: set EVALOS_GRAPH_URL and POST this payload to your loader.",
    nodes,
    edges
  };
}


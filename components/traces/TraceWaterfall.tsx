import type { EvaluatedRun } from "@/lib/types";
import { explainFinding } from "@/lib/finding-copy";
import { buildTraceTree, flattenTrace, formatDuration, spanTone } from "@/lib/trace-tree";

export function TraceWaterfall({
  run,
  evidenceStepIds
}: {
  run: EvaluatedRun;
  evidenceStepIds: string[];
}) {
  const { roots, totalMs, spanCount } = buildTraceTree(run);
  const rows = flattenTrace(roots);
  const evidence = new Set(evidenceStepIds);
  const traceId = run.steps.find((step) => step.traceId)?.traceId ?? run.id;
  const finding = explainFinding(run.evaluation);
  const evidenceCount = evidenceStepIds.length;

  return (
    <div className="trace-card">
      <div className="trace-card-head">
        <div>
          <div className="field-label">This session</div>
          <code className="trace-id">{traceId}</code>
        </div>
        <div className="trace-meta">
          <span>{formatDuration(totalMs)} total</span>
          <span>{spanCount} steps</span>
        </div>
      </div>

      <div className="finding-guide">
        <div className="finding-guide-title">
          <strong>{finding.title}</strong>
          <span className={`tag ${run.evaluation.risk === "high" ? "danger" : run.evaluation.risk === "medium" ? "warn" : "ok"}`}>
            {run.evaluation.risk} priority
          </span>
        </div>
        <p>{finding.whatHappened}</p>
        <p className="subtle">{finding.scoreLine}</p>
        <p className="subtle">{finding.nextStep}</p>

        <div className="jev-plain">
          <div>
            <strong>1. Checker</strong>
            <span>Automatic rules reviewed this run (not a human yet).</span>
          </div>
          <div>
            <strong>2. Proof</strong>
            <span>
              {evidenceCount > 0
                ? `${evidenceCount} highlighted step${evidenceCount === 1 ? "" : "s"} below support this finding.`
                : "No proof steps were attached — do not confirm yet."}
            </span>
          </div>
          <div>
            <strong>3. Your call</strong>
            <span>Confirm = save as a regression case. Reject = ignore this finding.</span>
          </div>
        </div>
      </div>

      <div className="field-label" style={{ padding: "10px 14px 0" }}>
        Step-by-step timeline (scroll)
      </div>
      <div className="trace-waterfall" role="list">
        {rows.map((node) => {
          const width = Math.max(4, Math.round((node.durationMs / totalMs) * 100));
          const tone = spanTone(node.step);
          const isEvidence = evidence.has(node.step.id);
          return (
            <div
              className={`trace-row tone-${tone} ${isEvidence ? "is-evidence" : ""} ${node.step.error ? "is-error" : ""}`}
              key={node.step.id}
              role="listitem"
              style={{ ["--depth" as string]: node.depth }}
            >
              <div className="trace-row-main">
                <span className="trace-rail" aria-hidden="true" />
                <span className={`trace-glyph tone-${tone}`} aria-hidden="true" />
                <div className="trace-label">
                  <strong>{node.step.name}</strong>
                  <span>
                    {plainStepType(node.step.type)}
                    {isEvidence ? " · why this finding" : ""}
                    {node.step.error ? " · failed" : ""}
                  </span>
                </div>
                <div className="trace-timing">
                  {node.step.error ? <span className="trace-alert" aria-label="failed" /> : null}
                  <code>{formatDuration(node.durationMs)}</code>
                </div>
              </div>
              <div className="trace-bar-track">
                <div className={`trace-bar tone-${tone}`} style={{ width: `${width}%` }} />
              </div>
              {node.step.error ? <p className="trace-error">{node.step.error}</p> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function plainStepType(type: string) {
  if (type === "tool_call") return "tool";
  if (type === "llm_call") return "model";
  if (type === "message") return "message";
  if (type === "error") return "error";
  return type;
}

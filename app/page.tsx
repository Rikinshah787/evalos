"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  BarChart3,
  Braces,
  CheckCircle2,
  ClipboardList,
  DatabaseZap,
  FileJson,
  GitBranch,
  GitCompareArrows,
  Layers3,
  Link,
  PackageCheck,
  Search,
  ShieldCheck,
  Terminal,
  Upload,
  XCircle
} from "lucide-react";
import { buildAnalytics } from "@/lib/analytics";
import { evaluateRuns } from "@/lib/evaluator";
import { exportJsonl, exportPromptfoo, exportPytest, toEvalCase } from "@/lib/exporters";
import { parseRunsFromJson } from "@/lib/importer";
import { defaultRetentionPolicy, pruneStaleRuns } from "@/lib/retention";
import { sampleRuns } from "@/lib/sample-runs";
import type { AgentRun, EvaluatedRun, FailureType, ReviewRecord } from "@/lib/types";

type ExportFormat = "jsonl" | "promptfoo" | "pytest";

const reviewer = "local-reviewer";
export default function Home() {
  const prunedSamples = useMemo(() => pruneStaleRuns(sampleRuns, new Date(), defaultRetentionPolicy), []);
  const [runs, setRuns] = useState<AgentRun[]>(prunedSamples.activeRuns);
  const [staleRemoved, setStaleRemoved] = useState(prunedSamples.removedRuns.length);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("jsonl");
  const [reviews, setReviews] = useState<Record<string, ReviewRecord>>({});

  useEffect(() => {
    let cancelled = false;

    async function refreshRuns() {
      try {
        const response = await fetch("/api/runs", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { runs?: AgentRun[] };
        if (!cancelled && Array.isArray(payload.runs)) {
          setRuns(payload.runs);
          setSelectedRunId((current) => current || payload.runs?.[0]?.id || "");
        }
      } catch {
        // The dashboard remains usable with pasted JSON if the API is not reachable.
      }
    }

    refreshRuns();
    const interval = window.setInterval(refreshRuns, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const evaluatedRuns = useMemo(() => evaluateRuns(runs), [runs]);
  const analytics = useMemo(() => buildAnalytics(evaluatedRuns), [evaluatedRuns]);
  const reviewRuns = useMemo(
    () =>
      evaluatedRuns
        .filter((run) => !run.evaluation.passed)
        .sort((a, b) => b.evaluation.reviewPriority - a.evaluation.reviewPriority),
    [evaluatedRuns]
  );
  const selectedRun = evaluatedRuns.find((run) => run.id === selectedRunId) ?? evaluatedRuns[0];
  const confirmedRuns = useMemo(() => evaluatedRuns.filter((run) => reviews[run.id]?.status === "confirmed"), [evaluatedRuns, reviews]);
  const datasetRuns = useMemo(() => (confirmedRuns.length > 0 ? confirmedRuns : reviewRuns.slice(0, 3)), [confirmedRuns, reviewRuns]);
  const exportText = buildExport(datasetRuns, exportFormat, reviews);
  const regressionCases = useMemo(() => datasetRuns.map((run) => toEvalCase(run, reviews[run.id])), [datasetRuns, reviews]);

  function handleImport() {
    try {
      const imported = parseRunsFromJson(importText);
      const pruned = pruneStaleRuns(imported, new Date(), defaultRetentionPolicy);
      setRuns((current) => [...pruned.activeRuns, ...current]);
      setStaleRemoved((current) => current + pruned.removedRuns.length);
      setSelectedRunId(pruned.activeRuns[0]?.id ?? selectedRunId);
      setImportText("");
      setImportError("");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Could not parse JSON.");
    }
  }

  function reviewRun(run: EvaluatedRun, status: ReviewRecord["status"]) {
    setReviews((current) => ({
      ...current,
      [run.id]: {
        runId: run.id,
        status,
        category: run.evaluation.failureType,
        expectedBehavior: current[run.id]?.expectedBehavior || run.evaluation.suggestedAssertion,
        reviewer,
        updatedAt: new Date().toISOString()
      }
    }));
  }

  function updateExpectedBehavior(runId: string, expectedBehavior: string) {
    const run = evaluatedRuns.find((item) => item.id === runId);
    if (!run) return;
    setReviews((current) => ({
      ...current,
      [runId]: {
        runId,
        status: current[runId]?.status ?? "pending",
        category: current[runId]?.category ?? run.evaluation.failureType,
        expectedBehavior,
        reviewer,
        updatedAt: new Date().toISOString()
      }
    }));
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <GitBranch size={20} aria-hidden="true" />
          </div>
          EvalOS
        </div>
        <nav className="nav" aria-label="Primary">
          <a className="nav-item active" href="#workflow">
            <GitCompareArrows size={18} aria-hidden="true" />
            Workflow
          </a>
          <a className="nav-item" href="#findings">
            <ClipboardList size={18} aria-hidden="true" />
            Review
          </a>
          <a className="nav-item" href="#datasets">
            <FileJson size={18} aria-hidden="true" />
            Datasets
          </a>
          <a className="nav-item" href="#connectors">
            <Layers3 size={18} aria-hidden="true" />
            Connectors
          </a>
        </nav>
        <p className="sidebar-note">
          Harness-agnostic evals for real agent traces. Import observability data, attach evidence, confirm failures,
          and ship regression datasets without changing the agent runtime.
        </p>
      </aside>

      <section className="main">
        <header className="topbar">
          <div className="grid">
            <div className="eyebrow">Type-safe JEV model for agent releases</div>
            <h1>Agent eval infrastructure that installs next to any harness.</h1>
            <p className="subtle">
              EvalOS normalizes traces into typed JEV records, links every verdict to span evidence, and gives CI a
              release decision without owning your agent runtime.
            </p>
          </div>
          <div className="actions">
            <button className="icon-button" type="button" title="Search traces">
              <Search size={17} aria-hidden="true" />
            </button>
            <button className="button primary" type="button" title="Import JSON traces" onClick={handleImport}>
              <Upload size={17} aria-hidden="true" />
              Import
            </button>
          </div>
        </header>

        <section className="product-console" aria-label="Product overview">
          <div className="console-main">
            <div className="console-topline">
              <span className="tag ok">production path</span>
              <span className="tag">schema jev.eval.v1</span>
              <span className="tag blue">OpenTelemetry ready</span>
            </div>
            <h2>From trace to typed verdict</h2>
            <div className="trace-line">
              <span>OTel span</span>
              <span>Normalized run</span>
              <span>JEV evidence</span>
              <span>Regression case</span>
              <span>CI verdict</span>
            </div>
            <div className="code-line">
              <Terminal size={16} aria-hidden="true" />
              <code>npx evalos init && npx evalos dev</code>
            </div>
          </div>
          <div className="console-side">
            <ProductStat icon={<PackageCheck size={18} aria-hidden="true" />} label="Install" value="1 command" />
            <ProductStat icon={<DatabaseZap size={18} aria-hidden="true" />} label="Retention" value={`${defaultRetentionPolicy.maxAgeDays} days`} />
            <ProductStat icon={<ShieldCheck size={18} aria-hidden="true" />} label="Gate" value="waiting" />
          </div>
        </section>

        <section className="workflow" id="workflow" aria-label="Core workflow">
          {["Import traces", "Normalize JEV", "Review evidence", "Version cases", "Gate releases"].map((step, index) => (
            <div className="workflow-step" key={step}>
              <span>{index + 1}</span>
              <strong>{step}</strong>
            </div>
          ))}
        </section>

        <section className="grid metrics" aria-label="Summary metrics">
          <Metric label="Runs analyzed" value={analytics.totalRuns.toString()} />
          <Metric label="Pass rate" value={`${analytics.passRate}%`} />
          <Metric label="Findings to review" value={analytics.reviewQueue.toString()} tone={analytics.reviewQueue > 0 ? "warn" : "ok"} />
          <Metric label="Regression cases" value={regressionCases.length.toString()} tone={regressionCases.length > 0 ? "ok" : "warn"} />
          <Metric label="Stale pruned" value={staleRemoved.toString()} />
        </section>

        <section className="grid two-col">
          <div className="grid">
            <section className="panel" id="connectors">
              <div className="panel-header">
                <div>
                  <h2>Import Real Runs</h2>
                  <p className="subtle">One working JSON API today, connector contracts ready for Langfuse-style traces.</p>
                </div>
                <Braces size={18} aria-hidden="true" />
              </div>
              <textarea
                className="import-box"
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                placeholder='{"id":"run_100","agentName":"my-agent","sourceUrl":"https://observability/trace/100","totalCostUsd":0.03,"latencyMs":4200,"input":[{"role":"user","content":"Help me"}],"steps":[{"id":"step_1","type":"tool_call","name":"lookup_order","error":"404","durationMs":300}],"finalOutput":"Done"}'
              />
              {importError ? <p className="subtle error-text">{importError}</p> : null}
              <div className="connector-grid">
                <Connector name="JSON API" status="working" detail="Neutral schema accepts steps, errors, timing, cost, source links." />
                <Connector name="OpenTelemetry" status="working" detail="OTLP span payloads map into traceId, spanId, parentSpanId, events, status, and attributes." />
                <Connector name="Harness API" status="working" detail="External harnesses post release results; EvalOS returns CI pass or fail." />
              </div>
            </section>

            <section className="panel" id="findings">
              <div className="panel-header">
                <div>
                  <h2>JEV Findings</h2>
                  <p className="subtle">Typed judge, evidence, and verdict records, each traceable to evaluator version and span.</p>
                </div>
                <span className="tag blue">
                  <span className="status-dot" /> deterministic v0.2.0
                </span>
              </div>
              <div className="run-list">
              {reviewRuns.map((run) => (
                  <RunCard
                    key={run.id}
                    run={run}
                    review={reviews[run.id]}
                    selected={selectedRun?.id === run.id}
                    onSelect={() => setSelectedRunId(run.id)}
                  />
                ))}
                {reviewRuns.length === 0 ? <EmptyState title="No live findings yet" detail="Connect your agent or post traces to /api/runs to populate the review queue." /> : null}
              </div>
            </section>
          </div>

          <div className="grid">
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Review Failure</h2>
                  <p className="subtle">Confirm findings before they become regression data.</p>
                </div>
                {selectedRun ? <RiskTag run={selectedRun} /> : null}
              </div>
              {selectedRun ? (
                <TraceDetail
                  run={selectedRun}
                  review={reviews[selectedRun.id]}
                  onConfirm={() => reviewRun(selectedRun, "confirmed")}
                  onReject={() => reviewRun(selectedRun, "rejected")}
                  onExpectedBehaviorChange={(value) => updateExpectedBehavior(selectedRun.id, value)}
                />
              ) : (
                <EmptyState title="No run selected" detail="Live runs will appear here after your agent sends traces." />
              )}
            </section>

            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Failure Analytics</h2>
                  <p className="subtle">Patterns across imported production traces.</p>
                </div>
                <BarChart3 size={18} aria-hidden="true" />
              </div>
              <Bars data={failureData(analytics.failureCounts)} />
            </section>
          </div>
        </section>

        <section className="grid two-col">
          <section className="panel" id="datasets">
            <div className="panel-header">
              <div>
                <h2>Versioned Regression Dataset</h2>
                <p className="subtle">Reviewed failures become portable cases with explicit assertions.</p>
              </div>
              <ShieldCheck size={18} aria-hidden="true" />
            </div>
            <div className="case-list">
              {regressionCases.map((testCase) => (
                <div className="case-row" key={testCase.id}>
                  <div>
                    <strong>{testCase.name}</strong>
                    <p className="subtle">{testCase.expected.assertion}</p>
                    <p className="subtle detail-line">
                      {testCase.metadata.traceId ?? "no trace id"} · evidence steps {testCase.metadata.evidenceStepIds.join(", ")}
                    </p>
                  </div>
                  <span className="tag">v{testCase.version}</span>
                </div>
              ))}
              {regressionCases.length === 0 ? <EmptyState title="No regression cases" detail="Confirm a live finding to create a versioned dataset case." /> : null}
            </div>
            <div className="actions left-actions">
              <button className={`button ${exportFormat === "jsonl" ? "primary" : ""}`} type="button" onClick={() => setExportFormat("jsonl")}>
                JSONL
              </button>
              <button className={`button ${exportFormat === "promptfoo" ? "primary" : ""}`} type="button" onClick={() => setExportFormat("promptfoo")}>
                Promptfoo
              </button>
              <button className={`button ${exportFormat === "pytest" ? "primary" : ""}`} type="button" onClick={() => setExportFormat("pytest")}>
                pytest
              </button>
            </div>
            <textarea className="export-box" readOnly value={exportText} aria-label="Exported eval dataset" />
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Release Compare and CI</h2>
                <p className="subtle">Harnesses submit results; the JEV verdict compares quality, cost, and latency.</p>
              </div>
              <ShieldCheck size={18} aria-hidden="true" />
            </div>
            <div className="ci-card waiting">
              <strong>CI WAITING</strong>
              <span>Post live harness results to compare releases.</span>
            </div>
            <div className="compare-grid">
              <Metric label="Quality delta" value="--" />
              <Metric label="Cost delta" value="--" />
              <Metric label="Latency delta" value="--" />
            </div>
            <div className="api-box">
              <div className="message-role">results API</div>
              <code>{`POST /api/results { caseId, agentVersion, passed, qualityScore, costUsd, latencyMs }`}</code>
            </div>
            <div className="api-box">
              <div className="message-role">one command</div>
              <code>{`npx evalos init && npx evalos dev`}</code>
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "danger" | "warn" | "ok" }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value" style={{ color: tone ? `var(--${tone === "danger" ? "danger" : tone})` : undefined }}>
        {value}
      </div>
    </div>
  );
}

function Connector({ name, status, detail }: { name: string; status: string; detail: string }) {
  return (
    <div className="connector">
      <div className="run-title">
        <strong>{name}</strong>
        <span className={status === "working" ? "tag ok" : status === "next" ? "tag blue" : "tag"}>{status}</span>
      </div>
      <p className="subtle">{detail}</p>
    </div>
  );
}

function ProductStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="product-stat">
      <span>{icon}</span>
      <div>
        <div className="metric-label">{label}</div>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p className="subtle">{detail}</p>
    </div>
  );
}

function Bars({ data }: { data: Array<{ label: string; value: number }> }) {
  if (data.length === 0) {
    return <EmptyState title="No failure patterns" detail="Failure analytics will appear after live traces are evaluated." />;
  }

  const max = Math.max(...data.map((item) => item.value), 1);
  return (
    <div className="bars">
      {data.map((item) => (
        <div className="bar-row" key={item.label}>
          <div className="bar-label">
            <span>{formatLabel(item.label)}</span>
            <strong>{item.value}</strong>
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${Math.max(7, (item.value / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function RunCard({ run, review, selected, onSelect }: { run: EvaluatedRun; review?: ReviewRecord; selected: boolean; onSelect: () => void }) {
  return (
    <button className={`run-card ${selected ? "selected" : ""}`} type="button" onClick={onSelect}>
      <div className="run-title">
        <h3>{run.agentName}</h3>
        <RiskTag run={run} />
      </div>
      <p className="subtle">{run.evaluation.reason}</p>
      <div className="tags">
        <span className="tag">{run.source}</span>
        <span className="tag">{run.framework}</span>
        <span className="tag">jev.eval.v1</span>
        <span className="tag blue">{run.evaluation.score}/100</span>
        <span className="tag warn">{formatLabel(run.evaluation.failureType)}</span>
        {review ? <span className={review.status === "confirmed" ? "tag ok" : review.status === "rejected" ? "tag danger" : "tag"}>{review.status}</span> : null}
      </div>
    </button>
  );
}

function RiskTag({ run }: { run: EvaluatedRun }) {
  const className = run.evaluation.risk === "high" ? "danger" : run.evaluation.risk === "medium" ? "warn" : "ok";
  return <span className={`tag ${className}`}>{run.evaluation.risk} risk</span>;
}

function TraceDetail({
  run,
  review,
  onConfirm,
  onReject,
  onExpectedBehaviorChange
}: {
  run: EvaluatedRun;
  review?: ReviewRecord;
  onConfirm: () => void;
  onReject: () => void;
  onExpectedBehaviorChange: (value: string) => void;
}) {
  return (
    <div className="trace">
      <div className="tags">
        <span className="tag">{run.id}</span>
        <span className="tag">{run.model ?? "unknown model"}</span>
        <span className="tag">{run.promptVersion ?? "unknown prompt"}</span>
        {run.sourceUrl ? (
          <span className="tag blue">
            <Link size={12} aria-hidden="true" /> trace link
          </span>
        ) : null}
      </div>
      <div className="message">
        <div className="message-role">finding</div>
        <p>{run.evaluation.reason}</p>
        <p className="subtle detail-line">
          {run.evaluation.jev.schema} · {run.evaluation.jev.judge.id}@{run.evaluation.jev.judge.version} · {run.evaluation.jev.judge.kind}
        </p>
      </div>
      <div className="evidence-list">
        {run.evaluation.evidence.map((item) => (
          <div className="step" key={`${item.stepId}-${item.stepName}`}>
            <div className="step-type">
              {item.stepType} · {item.stepName} · {item.stepId}
            </div>
            <p className="subtle detail-line">
              trace {item.traceId ?? "unknown"} · span {item.spanId ?? "unknown"}
            </p>
            <p>{item.quote || "No payload captured."}</p>
          </div>
        ))}
      </div>
      <label className="field-label" htmlFor="expected-behavior">
        Expected behavior
      </label>
      <textarea
        id="expected-behavior"
        className="review-box"
        value={review?.expectedBehavior ?? run.evaluation.suggestedAssertion}
        onChange={(event) => onExpectedBehaviorChange(event.target.value)}
      />
      <div className="actions left-actions">
        <button className="button primary" type="button" onClick={onConfirm}>
          <CheckCircle2 size={17} aria-hidden="true" />
          Confirm
        </button>
        <button className="button" type="button" onClick={onReject}>
          <XCircle size={17} aria-hidden="true" />
          Reject
        </button>
      </div>
      <div className="message">
        <div className="message-role">final output</div>
        <p>{run.finalOutput || "No final output captured."}</p>
      </div>
    </div>
  );
}

function failureData(counts: Record<FailureType, number>) {
  return Object.entries(counts)
    .filter(([key]) => key !== "none")
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function buildExport(runs: EvaluatedRun[], format: ExportFormat, reviews: Record<string, ReviewRecord>): string {
  if (format === "promptfoo") return exportPromptfoo(runs, reviews);
  if (format === "pytest") return exportPytest(runs, reviews);
  return exportJsonl(runs, reviews);
}

function formatLabel(label: string) {
  return label.replaceAll("_", " ");
}

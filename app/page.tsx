"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowUp,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Database,
  Eye,
  FileJson,
  GitBranch,
  GitCompareArrows,
  LayoutDashboard,
  MessageSquare,
  Monitor,
  Moon,
  Paperclip,
  Plus,
  Settings,
  Sun,
  TriangleAlert,
  Upload,
  XCircle
} from "lucide-react";
import { buildAnalytics } from "@/lib/analytics";
import { evaluateRuns } from "@/lib/evaluator";
import { exportJsonl, exportPromptfoo, exportPytest, toEvalCase } from "@/lib/exporters";
import type { AgentRun, EvaluatedRun, ReviewRecord } from "@/lib/types";

type View = "dashboard" | "inspect" | "runs" | "datasets" | "releases" | "settings";
type ExportFormat = "jsonl" | "promptfoo" | "pytest";
type Theme = "light" | "dark";

const reviewer = "local-reviewer";

export default function Home() {
  const [view, setView] = useState<View>("dashboard");
  // Always start dark so SSR HTML matches the first client render.
  const [theme, setTheme] = useState<Theme>("dark");
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [reviews, setReviews] = useState<Record<string, ReviewRecord>>({});
  const [selectedRunId, setSelectedRunId] = useState("");
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("jsonl");
  const [setupMessage, setSetupMessage] = useState("");
  const [cursorConnected, setCursorConnected] = useState(false);
  const [claudeConnected, setClaudeConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [composer, setComposer] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem("evalos.theme");
    if (saved === "light" || saved === "dark") {
      startTransition(() => setTheme(saved));
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const [runsResponse, cursorResponse, claudeResponse] = await Promise.all([
          fetch("/api/runs", { cache: "no-store" }),
          fetch("/api/setup/cursor", { cache: "no-store" }),
          fetch("/api/setup/claude-code", { cache: "no-store" })
        ]);

        if (runsResponse.ok) {
          const payload = (await runsResponse.json()) as {
            runs?: AgentRun[];
            reviews?: Record<string, ReviewRecord>;
          };
          if (!cancelled && Array.isArray(payload.runs)) {
            setRuns(payload.runs);
            setSelectedRunId((current) => current || payload.runs?.[0]?.id || "");
          }
          if (!cancelled && payload.reviews) setReviews(payload.reviews);
        }

        if (cursorResponse.ok) {
          const setup = (await cursorResponse.json()) as { connected?: boolean };
          if (!cancelled) setCursorConnected(Boolean(setup.connected));
        }

        if (claudeResponse.ok) {
          const setup = (await claudeResponse.json()) as { connected?: boolean };
          if (!cancelled) setClaudeConnected(Boolean(setup.connected));
        }
      } catch {
        // Keep the shell usable offline.
      }
    }

    refresh();
    const interval = window.setInterval(refresh, 3000);
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
        .filter((run) => !run.evaluation.passed && reviews[run.id]?.status !== "rejected")
        .sort((a, b) => b.evaluation.reviewPriority - a.evaluation.reviewPriority),
    [evaluatedRuns, reviews]
  );
  const selectedRun = evaluatedRuns.find((run) => run.id === selectedRunId) ?? reviewRuns[0] ?? evaluatedRuns[0];
  const confirmedRuns = useMemo(
    () => evaluatedRuns.filter((run) => reviews[run.id]?.status === "confirmed"),
    [evaluatedRuns, reviews]
  );
  const datasetRuns = confirmedRuns.length > 0 ? confirmedRuns : reviewRuns.slice(0, 3);
  const exportText = buildExport(datasetRuns, exportFormat, reviews);
  const regressionCases = datasetRuns.map((run) => toEvalCase(run, reviews[run.id]));

  function setThemeMode(next: Theme) {
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    window.localStorage.setItem("evalos.theme", next);
  }

  async function refreshRuns() {
    const response = await fetch("/api/runs", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as {
      runs?: AgentRun[];
      reviews?: Record<string, ReviewRecord>;
    };
    if (Array.isArray(data.runs)) {
      setRuns(data.runs);
      setSelectedRunId((current) => current || data.runs?.[0]?.id || "");
    }
    if (data.reviews) setReviews(data.reviews);
  }

  async function connectCursor() {
    setBusy(true);
    setSetupMessage("");
    try {
      const response = await fetch("/api/setup/cursor", { method: "POST" });
      const payload = (await response.json()) as { message?: string; error?: { message?: string } };
      if (!response.ok) {
        setSetupMessage(payload.error?.message ?? "Could not enable Cursor hooks.");
        return;
      }
      setCursorConnected(true);
      setSetupMessage(payload.message ?? "Cursor hooks enabled for this workspace.");
    } catch (error) {
      setSetupMessage(error instanceof Error ? error.message : "Could not enable Cursor hooks.");
    } finally {
      setBusy(false);
    }
  }

  async function connectClaudeCode() {
    setBusy(true);
    setSetupMessage("");
    try {
      const response = await fetch("/api/setup/claude-code", { method: "POST" });
      const payload = (await response.json()) as { message?: string; error?: { message?: string } };
      if (!response.ok) {
        setSetupMessage(payload.error?.message ?? "Could not enable Claude Code hook.");
        return;
      }
      setClaudeConnected(true);
      setSetupMessage(payload.message ?? "Claude Code hook enabled.");
    } catch (error) {
      setSetupMessage(error instanceof Error ? error.message : "Could not enable Claude Code hook.");
    } finally {
      setBusy(false);
    }
  }

  async function loadDemo() {
    setBusy(true);
    setSetupMessage("");
    try {
      const response = await fetch("/api/demo", { method: "POST" });
      const payload = (await response.json()) as { runId?: string; error?: { message?: string } };
      if (!response.ok) {
        setSetupMessage(payload.error?.message ?? "Could not load demo.");
        return;
      }
      await refreshRuns();
      if (payload.runId) setSelectedRunId(payload.runId);
      setView("inspect");
      setSetupMessage("Demo failure loaded. Confirm it to create a regression case.");
    } catch (error) {
      setSetupMessage(error instanceof Error ? error.message : "Could not load demo.");
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    setBusy(true);
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: importText
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        setImportError(payload.error?.message ?? "Could not import runs.");
        return;
      }
      await refreshRuns();
      setImportText("");
      setImportError("");
      setView("inspect");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Could not parse JSON.");
    } finally {
      setBusy(false);
    }
  }

  async function persistReview(
    run: EvaluatedRun,
    patch: Partial<ReviewRecord> & Pick<ReviewRecord, "status" | "expectedBehavior">
  ) {
    const next: ReviewRecord = {
      runId: run.id,
      status: patch.status,
      category: patch.category ?? reviews[run.id]?.category ?? run.evaluation.failureType,
      expectedBehavior: patch.expectedBehavior,
      reviewer,
      updatedAt: new Date().toISOString()
    };
    setReviews((current) => ({ ...current, [run.id]: next }));

    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          runId: next.runId,
          evaluationId: run.evaluation.id,
          status: next.status,
          category: next.category,
          expectedBehavior: next.expectedBehavior,
          reviewer: next.reviewer
        })
      });
      if (!response.ok) return;
      const payload = (await response.json()) as { review?: ReviewRecord };
      if (payload.review) setReviews((current) => ({ ...current, [run.id]: payload.review as ReviewRecord }));
    } catch {
      // Keep optimistic state.
    }
  }

  function runComposerAction() {
    const text = composer.trim().toLowerCase();
    if (!text) return;
    if (text.includes("demo")) {
      void loadDemo();
    } else if (text.includes("claude")) {
      void connectClaudeCode();
    } else if (text.includes("cursor") || text.includes("connect")) {
      void connectCursor();
    } else if (text.includes("review") || text.includes("inbox") || text.includes("error")) {
      setView("inspect");
    } else if (text.includes("dataset") || text.includes("export")) {
      setView("datasets");
    } else {
      setView("inspect");
    }
    setComposer("");
  }

  const titles: Record<View, string> = {
    dashboard: "Dashboard",
    inspect: "Inspect",
    runs: "Runs",
    datasets: "Datasets",
    releases: "Releases",
    settings: "Settings"
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="workspace-chip">
          <span>evalos</span>
          <GitBranch size={14} aria-hidden="true" />
        </div>

        <nav className="nav" aria-label="Primary">
          <NavButton active={view === "dashboard"} onClick={() => setView("dashboard")} icon={<LayoutDashboard size={18} />} label="Dashboard" />
          <NavButton active={view === "inspect"} onClick={() => setView("inspect")} icon={<Eye size={18} />} label="Inspect" />
          <NavButton active={view === "runs"} onClick={() => setView("runs")} icon={<ClipboardList size={18} />} label="Runs" />
          <NavButton active={view === "datasets"} onClick={() => setView("datasets")} icon={<FileJson size={18} />} label="Datasets" />
          <NavButton active={view === "releases"} onClick={() => setView("releases")} icon={<GitCompareArrows size={18} />} label="Releases" />
          <NavButton active={view === "settings"} onClick={() => setView("settings")} icon={<Settings size={18} />} label="Settings" />
        </nav>

        <div className="sidebar-spacer" />

        <div className="sidebar-foot">
          <a className="sidebar-link" href="https://github.com/rikinshah787/evalos" target="_blank" rel="noreferrer">
            <BookOpen size={16} aria-hidden="true" />
            Docs
          </a>
          <a className="sidebar-link" href="https://github.com/rikinshah787/evalos/issues" target="_blank" rel="noreferrer">
            <MessageSquare size={16} aria-hidden="true" />
            Feedback
          </a>
          <div className="sidebar-link">
            <Monitor size={16} aria-hidden="true" />
            Local SQLite
          </div>
          <div className="user-card">
            <div className="user-avatar">JEV</div>
            <div className="user-meta">
              <strong>EvalOS</strong>
              <span>jev.eval.v1</span>
            </div>
          </div>
        </div>
      </aside>

      <section className="main">
        <header className="topbar">
          <h1>{titles[view]}</h1>
          <div className="topbar-actions">
            <button
              className="icon-button"
              type="button"
              title={theme === "dark" ? "Switch to light" : "Switch to dark"}
              onClick={() => setThemeMode(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button className="icon-button" type="button" title="New inspect session" onClick={() => setView("dashboard")}>
              <Plus size={16} />
            </button>
            <button className="button primary" type="button" disabled={busy} onClick={() => void loadDemo()}>
              Load demo
            </button>
          </div>
        </header>

        <div className="content">
          {view === "dashboard" ? (
            <DashboardView
              cursorConnected={cursorConnected}
              claudeConnected={claudeConnected}
              runsCount={runs.length}
              reviewCount={reviewRuns.length}
              confirmedCount={confirmedRuns.length}
              setupMessage={setupMessage}
              busy={busy}
              composer={composer}
              onComposerChange={setComposer}
              onComposerSubmit={runComposerAction}
              onConnectCursor={() => void connectCursor()}
              onConnectClaude={() => void connectClaudeCode()}
              onDemo={() => void loadDemo()}
              onInspect={() => setView("inspect")}
              onImport={() => setView("settings")}
            />
          ) : null}

          {view === "inspect" ? (
            <InspectView
              reviewRuns={reviewRuns}
              selectedRun={selectedRun}
              reviews={reviews}
              onSelect={setSelectedRunId}
              onConfirm={() => selectedRun && void persistReview(selectedRun, {
                status: "confirmed",
                expectedBehavior: reviews[selectedRun.id]?.expectedBehavior || selectedRun.evaluation.suggestedAssertion
              })}
              onReject={() => selectedRun && void persistReview(selectedRun, {
                status: "rejected",
                expectedBehavior: reviews[selectedRun.id]?.expectedBehavior || selectedRun.evaluation.suggestedAssertion
              })}
              onExpectedBehaviorChange={(value) => {
                if (!selectedRun) return;
                void persistReview(selectedRun, {
                  status: reviews[selectedRun.id]?.status ?? "pending",
                  expectedBehavior: value
                });
              }}
              onLoadDemo={() => void loadDemo()}
            />
          ) : null}

          {view === "runs" ? (
            <RunsView
              runs={evaluatedRuns}
              analytics={analytics}
              onSelect={(id) => {
                setSelectedRunId(id);
                setView("inspect");
              }}
            />
          ) : null}

          {view === "datasets" ? (
            <DatasetsView
              cases={regressionCases}
              exportFormat={exportFormat}
              exportText={exportText}
              onFormatChange={setExportFormat}
            />
          ) : null}

          {view === "releases" ? <ReleasesView confirmedCount={confirmedRuns.length} /> : null}

          {view === "settings" ? (
            <SettingsView
              cursorConnected={cursorConnected}
              claudeConnected={claudeConnected}
              importText={importText}
              importError={importError}
              busy={busy}
              onImportTextChange={setImportText}
              onImport={() => void handleImport()}
              onConnectCursor={() => void connectCursor()}
              onConnectClaude={() => void connectClaudeCode()}
              theme={theme}
              onThemeChange={setThemeMode}
            />
          ) : null}
        </div>
      </section>
    </main>
  );
}

function NavButton({
  active,
  onClick,
  icon,
  label
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button className={`nav-item ${active ? "active" : ""}`} type="button" onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function DashboardView({
  cursorConnected,
  claudeConnected,
  runsCount,
  reviewCount,
  confirmedCount,
  setupMessage,
  busy,
  composer,
  onComposerChange,
  onComposerSubmit,
  onConnectCursor,
  onConnectClaude,
  onDemo,
  onInspect,
  onImport
}: {
  cursorConnected: boolean;
  claudeConnected: boolean;
  runsCount: number;
  reviewCount: number;
  confirmedCount: number;
  setupMessage: string;
  busy: boolean;
  composer: string;
  onComposerChange: (value: string) => void;
  onComposerSubmit: () => void;
  onConnectCursor: () => void;
  onConnectClaude: () => void;
  onDemo: () => void;
  onInspect: () => void;
  onImport: () => void;
}) {
  return (
    <div className="hero-center">
      <h2>
        Failures become regression tests with{" "}
        <span className="inspect-pill">
          <Eye size={14} /> JEV
        </span>
      </h2>
      <p>
        Capture Cursor or Claude Code sessions, attach evidence to every verdict, and promote confirmed failures into
        durable eval cases — without owning the agent runtime.
      </p>

      <div className="jev-keys" aria-label="JEV model">
        <div className="jev-key">
          <strong>Judge</strong>
          <span>Which evaluator ran, and why it flagged the run.</span>
        </div>
        <div className="jev-key">
          <strong>Evidence</strong>
          <span>Exact tool steps, spans, and excerpts that support the finding.</span>
        </div>
        <div className="jev-key">
          <strong>Verdict</strong>
          <span>Pass, fail, or review — with an editable expected behavior.</span>
        </div>
      </div>

      <div className="status-row">
        <span className={`tag ${cursorConnected ? "ok" : "warn"}`}>{cursorConnected ? "Cursor connected" : "Cursor not connected"}</span>
        <span className={`tag ${claudeConnected ? "ok" : "warn"}`}>{claudeConnected ? "Claude Code connected" : "Claude Code not connected"}</span>
        <span className="tag blue">{runsCount} runs</span>
        <span className="tag warn">{reviewCount} to review</span>
        <span className="tag ok">{confirmedCount} confirmed</span>
      </div>

      <div className="prompt-stack">
        <button className="prompt-card" type="button" disabled={busy || cursorConnected} onClick={onConnectCursor}>
          <span><CheckCircle2 size={16} /></span>
          Connect this Cursor workspace to EvalOS
        </button>
        <button className="prompt-card" type="button" disabled={busy || claudeConnected} onClick={onConnectClaude}>
          <span><CheckCircle2 size={16} /></span>
          Connect Claude Code (optional second source)
        </button>
        <button className="prompt-card" type="button" disabled={busy} onClick={onDemo}>
          <span><TriangleAlert size={16} /></span>
          Load a demo failure with highlighted evidence
        </button>
        <button className="prompt-card" type="button" onClick={onInspect}>
          <span><Eye size={16} /></span>
          Inspect pending findings and confirm a case
        </button>
        <button className="prompt-card" type="button" onClick={onImport}>
          <span><Upload size={16} /></span>
          Import a JSON or OpenTelemetry trace
        </button>
      </div>

      <div className="composer">
        <Paperclip size={16} aria-hidden="true" />
        <input
          value={composer}
          onChange={(event) => onComposerChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onComposerSubmit();
          }}
          placeholder="Connect Cursor, connect Claude Code, load demo..."
          aria-label="Quick action"
        />
        <button className="composer-send" type="button" onClick={onComposerSubmit} aria-label="Run action">
          <ArrowUp size={16} />
        </button>
      </div>

      {setupMessage ? <p className="subtle">{setupMessage}</p> : null}

      <div className="setup-grid">
        <article className="setup-card">
          <h3>1. Capture</h3>
          <p>Connect Cursor for this chat, Claude Code for terminal sessions, or both.</p>
          <div className="actions left-actions">
            <button className="button primary" type="button" disabled={busy || cursorConnected} onClick={onConnectCursor}>
              {cursorConnected ? "Cursor on" : "Connect Cursor"}
            </button>
            <button className="button" type="button" disabled={busy || claudeConnected} onClick={onConnectClaude}>
              {claudeConnected ? "Claude on" : "Connect Claude Code"}
            </button>
          </div>
        </article>
        <article className="setup-card">
          <h3>2. Review</h3>
          <p>Every finding links to exact tool steps. Confirm only when evidence is solid.</p>
          <button className="button" type="button" onClick={onInspect}>
            Open Inspect
          </button>
        </article>
        <article className="setup-card">
          <h3>3. Protect</h3>
          <p>Confirmed findings become draft cases you can export to JSONL, Promptfoo, or pytest.</p>
          <button className="button" type="button" onClick={onDemo}>
            Try demo now
          </button>
        </article>
      </div>
    </div>
  );
}

function InspectView({
  reviewRuns,
  selectedRun,
  reviews,
  onSelect,
  onConfirm,
  onReject,
  onExpectedBehaviorChange,
  onLoadDemo
}: {
  reviewRuns: EvaluatedRun[];
  selectedRun?: EvaluatedRun;
  reviews: Record<string, ReviewRecord>;
  onSelect: (id: string) => void;
  onConfirm: () => void;
  onReject: () => void;
  onExpectedBehaviorChange: (value: string) => void;
  onLoadDemo: () => void;
}) {
  if (!selectedRun) {
    return (
      <div className="hero-center">
        <h2>No findings yet</h2>
        <p>Load the demo failure or connect Cursor / Claude Code, then come back to Inspect.</p>
        <button className="button primary" type="button" onClick={onLoadDemo}>
          Load demo failure
        </button>
      </div>
    );
  }

  const review = reviews[selectedRun.id];

  return (
    <div className="inspect-layout">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Findings</h2>
            <p className="subtle">Prioritized by risk and evidence.</p>
          </div>
        </div>
        <div className="run-list">
          {reviewRuns.map((run) => (
            <button
              key={run.id}
              className={`run-card ${selectedRun.id === run.id ? "selected" : ""}`}
              type="button"
              onClick={() => onSelect(run.id)}
            >
              <div className="run-title">
                <h3>{run.agentName}</h3>
                <span className={`tag ${run.evaluation.risk === "high" ? "danger" : run.evaluation.risk === "medium" ? "warn" : "ok"}`}>
                  {run.evaluation.risk}
                </span>
              </div>
              <p className="subtle">{run.evaluation.reason}</p>
              <div className="tags">
                <span className="tag">{run.evaluation.failureType.replaceAll("_", " ")}</span>
                {review ? <span className={`tag ${review.status === "confirmed" ? "ok" : review.status === "rejected" ? "danger" : "warn"}`}>{review.status}</span> : null}
              </div>
            </button>
          ))}
          {reviewRuns.length === 0 ? (
            <div className="empty-state">
              <strong>Inbox clear</strong>
              <span className="subtle">No open findings. Load a demo or capture a live run.</span>
            </div>
          ) : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Trace evidence</h2>
            <p className="subtle">{selectedRun.id}</p>
          </div>
          <div className="tags">
            <span className="tag blue">{selectedRun.evaluation.score}/100</span>
            <span className="tag">{selectedRun.model ?? "unknown model"}</span>
          </div>
        </div>

        <div className="trace">
          <div className="message">
            <div className="message-role">finding</div>
            <p>{selectedRun.evaluation.reason}</p>
            <p className="subtle detail-line">
              {selectedRun.evaluation.jev.schema} · {selectedRun.evaluation.evaluatorId}@{selectedRun.evaluation.evaluatorVersion}
            </p>
          </div>

          {selectedRun.evaluation.evidence.map((item) => (
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

          <label className="field-label" htmlFor="expected-behavior">
            Expected behavior
          </label>
          <textarea
            id="expected-behavior"
            className="review-box"
            value={review?.expectedBehavior ?? selectedRun.evaluation.suggestedAssertion}
            onChange={(event) => onExpectedBehaviorChange(event.target.value)}
          />

          <div className="actions left-actions">
            <button className="button primary" type="button" onClick={onConfirm}>
              <CheckCircle2 size={16} />
              Confirm
            </button>
            <button className="button" type="button" onClick={onReject}>
              <XCircle size={16} />
              Reject
            </button>
          </div>

          <div className="message">
            <div className="message-role">final output</div>
            <p>{selectedRun.finalOutput || "No final output captured."}</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function RunsView({
  runs,
  analytics,
  onSelect
}: {
  runs: EvaluatedRun[];
  analytics: ReturnType<typeof buildAnalytics>;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid">
      <div className="metrics">
        <Metric label="Runs" value={String(analytics.totalRuns)} />
        <Metric label="Pass rate" value={`${analytics.passRate}%`} />
        <Metric label="Review queue" value={String(analytics.reviewQueue)} />
        <Metric label="Sources" value={String(new Set(runs.map((run) => run.source)).size)} />
      </div>
      <div className="run-list">
        {runs.map((run) => (
          <button key={run.id} className="run-card" type="button" onClick={() => onSelect(run.id)}>
            <div className="run-title">
              <h3>{run.agentName}</h3>
              <span className="tag">{run.startedAt}</span>
            </div>
            <p className="subtle">{run.evaluation.reason}</p>
            <div className="tags">
              <span className="tag">{run.source}</span>
              <span className="tag">{run.evaluation.outcome}</span>
              <span className="tag blue">{run.id}</span>
            </div>
          </button>
        ))}
        {runs.length === 0 ? (
          <div className="empty-state">
            <strong>No runs stored yet</strong>
            <span className="subtle">Use Dashboard setup to connect Cursor, Claude Code, or load the demo.</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DatasetsView({
  cases,
  exportFormat,
  exportText,
  onFormatChange
}: {
  cases: ReturnType<typeof toEvalCase>[];
  exportFormat: ExportFormat;
  exportText: string;
  onFormatChange: (format: ExportFormat) => void;
}) {
  return (
    <div className="grid two-col">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Draft cases</h2>
            <p className="subtle">Confirmed findings become draft regression cases.</p>
          </div>
          <Database size={18} />
        </div>
        <div className="case-list">
          {cases.map((item) => (
            <div className="case-row" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <p className="subtle">{item.expected.assertion}</p>
              </div>
              <span className="tag">{item.expected.failureType}</span>
            </div>
          ))}
          {cases.length === 0 ? (
            <div className="empty-state">
              <strong>No cases yet</strong>
              <span className="subtle">Confirm a finding in Inspect first.</span>
            </div>
          ) : null}
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Export</h2>
            <p className="subtle">JSONL, Promptfoo, or pytest.</p>
          </div>
        </div>
        <div className="actions left-actions" style={{ marginBottom: 12 }}>
          {(["jsonl", "promptfoo", "pytest"] as ExportFormat[]).map((format) => (
            <button
              key={format}
              className={`button ${exportFormat === format ? "primary" : ""}`}
              type="button"
              onClick={() => onFormatChange(format)}
            >
              {format}
            </button>
          ))}
        </div>
        <textarea className="export-box" readOnly value={exportText} />
      </section>
    </div>
  );
}

function ReleasesView({ confirmedCount }: { confirmedCount: number }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Release gate</h2>
          <p className="subtle">Post harness results to compare baseline vs candidate.</p>
        </div>
      </div>
      <p className="subtle">
        You have {confirmedCount} confirmed case{confirmedCount === 1 ? "" : "s"} ready for harness execution.
      </p>
      <div className="api-box" style={{ marginTop: 12 }}>
        <code>POST /api/results</code>
        <p className="subtle detail-line">
          Body: baselineVersion, candidateVersion, results[]. Returns pass, fail, or incomplete.
        </p>
      </div>
    </section>
  );
}

function SettingsView({
  cursorConnected,
  claudeConnected,
  importText,
  importError,
  busy,
  onImportTextChange,
  onImport,
  onConnectCursor,
  onConnectClaude,
  theme,
  onThemeChange
}: {
  cursorConnected: boolean;
  claudeConnected: boolean;
  importText: string;
  importError: string;
  busy: boolean;
  onImportTextChange: (value: string) => void;
  onImport: () => void;
  onConnectCursor: () => void;
  onConnectClaude: () => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}) {
  return (
    <div className="grid two-col">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Connectors</h2>
            <p className="subtle">Use one source or both. Local setup for capture and theme.</p>
          </div>
        </div>
        <div className="setup-card" style={{ marginBottom: 12 }}>
          <h3>Cursor</h3>
          <p>Writes `.cursor/hooks.json` so this workspace posts agent stops and tool failures to EvalOS.</p>
          <div className="status-row">
            <span className={`tag ${cursorConnected ? "ok" : "warn"}`}>{cursorConnected ? "connected" : "not connected"}</span>
            <button className="button primary" type="button" disabled={busy || cursorConnected} onClick={onConnectCursor}>
              {cursorConnected ? "Connected" : "Connect Cursor"}
            </button>
          </div>
        </div>
        <div className="setup-card" style={{ marginBottom: 12 }}>
          <h3>Claude Code</h3>
          <p>Writes `.claude/settings.json` from the EvalOS hook template for Claude Code sessions.</p>
          <div className="status-row">
            <span className={`tag ${claudeConnected ? "ok" : "warn"}`}>{claudeConnected ? "connected" : "not connected"}</span>
            <button className="button primary" type="button" disabled={busy || claudeConnected} onClick={onConnectClaude}>
              {claudeConnected ? "Connected" : "Connect Claude Code"}
            </button>
          </div>
        </div>
        <div className="setup-card">
          <h3>Theme</h3>
          <p>Match your desktop preference. Saved locally.</p>
          <div className="actions left-actions">
            <button className={`button ${theme === "dark" ? "primary" : ""}`} type="button" onClick={() => onThemeChange("dark")}>
              Dark
            </button>
            <button className={`button ${theme === "light" ? "primary" : ""}`} type="button" onClick={() => onThemeChange("light")}>
              Light
            </button>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Import traces</h2>
            <p className="subtle">Paste JSON runs or OTLP resourceSpans.</p>
          </div>
        </div>
        <textarea
          className="import-box"
          value={importText}
          onChange={(event) => onImportTextChange(event.target.value)}
          placeholder='{"id":"run_1","agentName":"my-agent","input":[{"role":"user","content":"Help"}],"steps":[{"id":"s1","type":"tool_call","name":"edit","error":"failed"}],"finalOutput":"Could not finish"}'
        />
        {importError ? <p className="error-text">{importError}</p> : null}
        <div className="actions left-actions" style={{ marginTop: 12 }}>
          <button className="button primary" type="button" disabled={busy || !importText.trim()} onClick={onImport}>
            <Upload size={16} />
            Import
          </button>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
    </div>
  );
}

function buildExport(runs: EvaluatedRun[], format: ExportFormat, reviews: Record<string, ReviewRecord>): string {
  if (format === "promptfoo") return exportPromptfoo(runs, reviews);
  if (format === "pytest") return exportPytest(runs, reviews);
  return exportJsonl(runs, reviews);
}

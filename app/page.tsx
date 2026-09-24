"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
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
import { CompareResults } from "@/components/results/CompareResults";
import { emptyCompareReport, type CompareReport } from "@/lib/compare";
import { buildAnalytics } from "@/lib/analytics";
import { evaluateRuns } from "@/lib/evaluator";
import { exportJsonl, exportPromptfoo, exportPytest, toEvalCase } from "@/lib/exporters";
import { groupIssues } from "@/lib/issues";
import type { AgentRun, EvaluatedRun, ReviewRecord } from "@/lib/types";
import { TraceWaterfall } from "@/components/traces/TraceWaterfall";

type View = "dashboard" | "inspect" | "runs" | "results" | "datasets" | "releases" | "data" | "settings";
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
  const [captureToast, setCaptureToast] = useState("");
  const [caseToast, setCaseToast] = useState("");
  const knownRunIds = useRef(new Set<string>());
  const bootstrappedRuns = useRef(false);

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
            const nextIds = payload.runs.map((run) => run.id);
            if (!bootstrappedRuns.current) {
              knownRunIds.current = new Set(nextIds);
              bootstrappedRuns.current = true;
            } else {
              const fresh = nextIds.filter((id) => !knownRunIds.current.has(id));
              if (fresh.length > 0) {
                knownRunIds.current = new Set(nextIds);
                setCaptureToast(
                  fresh.length === 1
                    ? `New capture landed: ${fresh[0]}`
                    : `${fresh.length} new captures landed`
                );
                setSelectedRunId(fresh[0]);
              } else {
                knownRunIds.current = new Set(nextIds);
              }
            }
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
  const issueGroups = useMemo(() => groupIssues(evaluatedRuns, reviews), [evaluatedRuns, reviews]);
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

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (view !== "inspect") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.isContentEditable)) {
        return;
      }
      if (!selectedRun) return;
      if (event.key === "c" || event.key === "C") {
        void persistReview(selectedRun, {
          status: "confirmed",
          expectedBehavior: reviews[selectedRun.id]?.expectedBehavior || selectedRun.evaluation.suggestedAssertion
        });
      }
      if (event.key === "r" || event.key === "R") {
        void persistReview(selectedRun, {
          status: "rejected",
          expectedBehavior: reviews[selectedRun.id]?.expectedBehavior || selectedRun.evaluation.suggestedAssertion
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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

  async function importCursorSession() {
    setBusy(true);
    setSetupMessage("");
    try {
      const response = await fetch("/api/setup/cursor/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ replace: true })
      });
      const payload = (await response.json()) as {
        runId?: string;
        steps?: number;
        messages?: number;
        toolCalls?: number;
        error?: { message?: string };
      };
      if (!response.ok) {
        setSetupMessage(payload.error?.message ?? "Could not import this Cursor session.");
        return;
      }
      await refreshRuns();
      if (payload.runId) setSelectedRunId(payload.runId);
      setView("inspect");
      setSetupMessage(
        `Imported this Cursor session: ${payload.messages ?? 0} user turns, ${payload.toolCalls ?? 0} tool calls, ${payload.steps ?? 0} trace steps.`
      );
    } catch (error) {
      setSetupMessage(error instanceof Error ? error.message : "Could not import this Cursor session.");
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
      const payload = (await response.json()) as { review?: ReviewRecord & { casePath?: string } };
      if (payload.review) {
        setReviews((current) => ({ ...current, [run.id]: payload.review as ReviewRecord }));
        if (payload.review.casePath) {
          setCaseToast(`Regression case written: ${payload.review.casePath}`);
        }
      }
    } catch {
      // Keep optimistic state.
    }
  }

  function runComposerAction() {
    const text = composer.trim().toLowerCase();
    if (!text) return;
    if (text.includes("session") || text.includes("import this") || text.includes("capture")) {
      void importCursorSession();
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
    results: "Results",
    datasets: "Datasets",
    releases: "Releases",
    data: "Data",
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
          <NavButton active={view === "results"} onClick={() => setView("results")} icon={<GitCompareArrows size={18} />} label="Results" />
          <NavButton active={view === "runs"} onClick={() => setView("runs")} icon={<ClipboardList size={18} />} label="Runs" />
          <NavButton active={view === "datasets"} onClick={() => setView("datasets")} icon={<FileJson size={18} />} label="Datasets" />
          <NavButton active={view === "releases"} onClick={() => setView("releases")} icon={<Database size={18} />} label="Releases" />
          <NavButton active={view === "data"} onClick={() => setView("data")} icon={<Monitor size={18} />} label="Data" />
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
            <button className="button primary" type="button" disabled={busy} onClick={() => void importCursorSession()}>
              Import this session
            </button>
          </div>
        </header>

        <div className="content">
          {captureToast ? (
            <div className="live-toast" role="status">
              <strong>Auto-capture</strong>
              <span>{captureToast}</span>
              <button className="button" type="button" onClick={() => { setCaptureToast(""); setView("inspect"); }}>
                Open Inspect
              </button>
              <button className="icon-button" type="button" aria-label="Dismiss" onClick={() => setCaptureToast("")}>
                ×
              </button>
            </div>
          ) : null}
          {caseToast ? (
            <div className="live-toast ok" role="status">
              <strong>Confirmed</strong>
              <span>{caseToast}</span>
              <button className="button" type="button" onClick={() => { setCaseToast(""); setView("datasets"); }}>
                View datasets
              </button>
              <button className="icon-button" type="button" aria-label="Dismiss" onClick={() => setCaseToast("")}>
                ×
              </button>
            </div>
          ) : null}
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
              onImportSession={() => void importCursorSession()}
              onInspect={() => setView("inspect")}
              onImport={() => setView("settings")}
              onResults={() => setView("results")}
            />
          ) : null}

          {view === "inspect" ? (
            <InspectView
              reviewRuns={reviewRuns}
              issueGroups={issueGroups}
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
              onLoadSession={() => void importCursorSession()}
            />
          ) : null}

          {view === "results" ? <ResultsView /> : null}

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

          {view === "releases" ? (
            <ReleasesView confirmedCount={confirmedRuns.length} runs={evaluatedRuns} reviews={reviews} />
          ) : null}

          {view === "data" ? <DataView selectedRunId={selectedRun?.id} onSelectRun={setSelectedRunId} /> : null}

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
  onImportSession,
  onInspect,
  onImport,
  onResults
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
  onImportSession: () => void;
  onInspect: () => void;
  onImport: () => void;
  onResults: () => void;
}) {
  return (
    <div className="hero-center">
      <h2>
        Fail once. Never fail the same way twice.{" "}
        <span className="inspect-pill">
          <Eye size={14} /> JEV
        </span>
      </h2>
      <p>
        Keep EvalOS running. Hooks + MCP auto-setup on boot — any agent that POSTs JSON/OTLP works, Cursor captures on stop.
        Confirm writes real cases into <code>evals/cases/</code>. No demo rows in the database.
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
        <button className="prompt-card" type="button" disabled={busy} onClick={onImportSession}>
          <span><Eye size={16} /></span>
          Import this Cursor chat as a real traced run
        </button>
        <button className="prompt-card" type="button" disabled={busy || cursorConnected} onClick={onConnectCursor}>
          <span><CheckCircle2 size={16} /></span>
          {cursorConnected ? "Cursor auto-capture on" : "Repair Cursor auto-setup"}
        </button>
        <button className="prompt-card" type="button" disabled={busy || claudeConnected} onClick={onConnectClaude}>
          <span><CheckCircle2 size={16} /></span>
          Connect Claude Code (optional second source)
        </button>
        <button className="prompt-card" type="button" onClick={onResults}>
          <span><GitCompareArrows size={16} /></span>
          Open Results — model/version compare grid
        </button>
        <button className="prompt-card" type="button" onClick={onInspect}>
          <span><TriangleAlert size={16} /></span>
          Open Inspect to review evidence
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
          placeholder="Import this session, connect Cursor, connect Claude Code..."
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
          <p>Import this live Cursor transcript, or enable hooks for the next agent stop.</p>
          <div className="actions left-actions">
            <button className="button primary" type="button" disabled={busy} onClick={onImportSession}>
              Import this session
            </button>
            <button className="button" type="button" disabled={busy || cursorConnected} onClick={onConnectCursor}>
              {cursorConnected ? "Cursor on" : "Connect Cursor"}
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
          <button className="button" type="button" disabled={busy || claudeConnected} onClick={onConnectClaude}>
            {claudeConnected ? "Claude on" : "Connect Claude Code"}
          </button>
        </article>
      </div>
    </div>
  );
}

function InspectView({
  reviewRuns,
  issueGroups,
  selectedRun,
  reviews,
  onSelect,
  onConfirm,
  onReject,
  onExpectedBehaviorChange,
  onLoadSession
}: {
  reviewRuns: EvaluatedRun[];
  issueGroups: ReturnType<typeof groupIssues>;
  selectedRun?: EvaluatedRun;
  reviews: Record<string, ReviewRecord>;
  onSelect: (id: string) => void;
  onConfirm: () => void;
  onReject: () => void;
  onExpectedBehaviorChange: (value: string) => void;
  onLoadSession: () => void;
}) {
  if (!selectedRun) {
    return (
      <div className="hero-center">
        <h2>No live runs yet</h2>
        <p>Import this Cursor chat or connect hooks, then come back to Inspect.</p>
        <button className="button primary" type="button" onClick={onLoadSession}>
          Import this Cursor session
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
            <h2>Queue</h2>
            <p className="subtle">Grouped recurring failures, then individual sessions.</p>
          </div>
        </div>
        {issueGroups.length > 0 ? (
          <div className="run-list" style={{ marginBottom: 12 }}>
            {issueGroups.slice(0, 6).map((group) => (
              <button
                key={group.fingerprint}
                className="run-card"
                type="button"
                onClick={() => onSelect(group.latestRunId)}
              >
                <div className="run-title">
                  <h3>{group.title}</h3>
                  <span className={`tag ${group.risk === "high" ? "danger" : group.risk === "medium" ? "warn" : "ok"}`}>
                    ×{group.count}
                  </span>
                </div>
                <p className="subtle">{group.reason}</p>
              </button>
            ))}
          </div>
        ) : null}
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
                {reviews[run.id] ? (
                  <span className={`tag ${reviews[run.id]?.status === "confirmed" ? "ok" : reviews[run.id]?.status === "rejected" ? "danger" : "warn"}`}>
                    {reviews[run.id]?.status}
                  </span>
                ) : null}
              </div>
            </button>
          ))}
          {reviewRuns.length === 0 ? (
            <div className="empty-state">
              <strong>Inbox clear</strong>
              <span className="subtle">No open findings. Import this Cursor session or capture a live run.</span>
            </div>
          ) : null}
        </div>
      </section>

      <section className="panel trace-panel">
        <div className="panel-header">
          <div>
            <div className="field-label">Review</div>
            <h2>What went wrong in this run?</h2>
            <p className="subtle">
              Read the finding in plain English, check the highlighted steps, then Confirm or Reject. Shortcuts: C confirm · R reject
            </p>
          </div>
        </div>

        <TraceWaterfall
          run={selectedRun}
          evidenceStepIds={selectedRun.evaluation.evidence.map((item) => item.stepId)}
        />

        <div className="trace-review">
          <div className="message">
            <div className="message-role">What the user asked</div>
            <p>{selectedRun.input[0]?.content || "No user input captured."}</p>
          </div>

          <label className="field-label" htmlFor="expected-behavior">
            What should the agent do next time?
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
              Confirm — keep as a test case
            </button>
            <button className="button" type="button" onClick={onReject}>
              <XCircle size={16} />
              Reject — false alarm
            </button>
          </div>
          <p className="subtle">
            Confirm only if the highlighted steps really show a failure you never want to see again.
          </p>
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
            <span className="subtle">Use Dashboard → Import this session, or connect Cursor / Claude Code.</span>
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

function DataView({
  selectedRunId,
  onSelectRun
}: {
  selectedRunId?: string;
  onSelectRun: (id: string) => void;
}) {
  const [db, setDb] = useState<{
    path: string;
    engine: string;
    tables: Array<{ name: string; count: number }>;
    recentRuns: Array<{
      id: string;
      agentName: string;
      framework: string;
      source: string;
      startedAt: string;
      model: string | null;
    }>;
    note: string;
  } | null>(null);
  const [graph, setGraph] = useState<{
    runId: string;
    nodes: Array<{ id: string; label: string; kind: string; detail?: string }>;
    edges: Array<{ id: string; from: string; to: string; label: string }>;
    exportHint: string;
  } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/db", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not read database.");
        return response.json();
      })
      .then((payload) => {
        if (!cancelled) setDb(payload);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "DB browse failed");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const query = selectedRunId ? `?runId=${encodeURIComponent(selectedRunId)}` : "";
    fetch(`/api/graph${query}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((payload) => {
        if (!cancelled && payload?.graph) setGraph(payload.graph);
      })
      .catch(() => {
        // empty ok
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRunId]);

  return (
    <div className="grid two-col">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>SQLite (source of truth)</h2>
            <p className="subtle">Only real ingested rows. No demo seed.</p>
          </div>
        </div>
        {error ? <p className="subtle">{error}</p> : null}
        {db ? (
          <>
            <p className="subtle">
              Engine <code>{db.engine}</code> · path <code>{db.path}</code>
            </p>
            <div className="metrics" style={{ marginTop: 12 }}>
              {db.tables.map((table) => (
                <Metric key={table.name} label={table.name} value={String(table.count)} />
              ))}
            </div>
            <p className="subtle" style={{ marginTop: 12 }}>
              {db.note}
            </p>
            <div className="run-list" style={{ marginTop: 16 }}>
              {db.recentRuns.map((run) => (
                <button key={run.id} className="run-card" type="button" onClick={() => onSelectRun(run.id)}>
                  <div className="run-title">
                    <h3>{run.agentName}</h3>
                    <span className="tag">{run.framework}</span>
                  </div>
                  <p className="subtle">
                    {run.id} · {run.model || "no-model"} · {run.startedAt}
                  </p>
                </button>
              ))}
              {db.recentRuns.length === 0 ? (
                <div className="empty-state">
                  <strong>Database empty</strong>
                  <span className="subtle">Import a session or POST any agent JSON/OTLP to /api/runs.</span>
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <p className="subtle">Loading database…</p>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Run graph</h2>
            <p className="subtle">Property-graph projection from SQLite. Neo4j optional later.</p>
          </div>
        </div>
        {graph ? (
          <>
            <p className="subtle">
              Run <code>{graph.runId}</code> · {graph.nodes.length} nodes · {graph.edges.length} edges
            </p>
            <RunGraphSvg nodes={graph.nodes} edges={graph.edges} />
            <p className="subtle detail-line" style={{ marginTop: 12 }}>
              {graph.exportHint}
            </p>
            <textarea className="export-box" readOnly value={JSON.stringify(graph, null, 2)} />
          </>
        ) : (
          <div className="empty-state">
            <strong>No graph yet</strong>
            <span className="subtle">Select a real run on the left.</span>
          </div>
        )}
      </section>
    </div>
  );
}

function RunGraphSvg({
  nodes,
  edges
}: {
  nodes: Array<{ id: string; label: string; kind: string; detail?: string }>;
  edges: Array<{ id: string; from: string; to: string; label: string }>;
}) {
  const width = 640;
  const height = Math.max(280, nodes.length * 28);
  const positions = new Map<string, { x: number; y: number }>();
  nodes.forEach((node, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    positions.set(node.id, {
      x: col === 0 ? 140 : 420,
      y: 36 + row * 52
    });
  });

  return (
    <svg className="run-graph" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Run property graph">
      {edges.map((edge) => {
        const from = positions.get(edge.from);
        const to = positions.get(edge.to);
        if (!from || !to) return null;
        return (
          <g key={edge.id}>
            <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="currentColor" opacity="0.35" />
          </g>
        );
      })}
      {nodes.map((node) => {
        const pos = positions.get(node.id);
        if (!pos) return null;
        return (
          <g key={node.id}>
            <rect
              x={pos.x - 70}
              y={pos.y - 16}
              width="140"
              height="32"
              rx="8"
              className={`graph-node kind-${node.kind}`}
            />
            <text x={pos.x} y={pos.y + 4} textAnchor="middle" fontSize="11" fill="currentColor">
              {node.label.slice(0, 18)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function ResultsView() {
  const [report, setReport] = useState<CompareReport>(() =>
    emptyCompareReport("Loading real captures…")
  );
  const [source, setSource] = useState("empty");
  const [truthful, setTruthful] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function applyPayload(payload: {
    report?: CompareReport;
    source?: string;
    truthful?: boolean;
  }) {
    if (payload.report) setReport(payload.report);
    if (payload.source) setSource(payload.source);
    setTruthful(payload.truthful !== false);
  }

  async function refreshReal() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/compare", { cache: "no-store" });
      const payload = (await response.json()) as {
        report?: CompareReport;
        source?: string;
        truthful?: boolean;
        error?: { message?: string };
      };
      if (!response.ok) {
        setError(payload.error?.message ?? "Could not load results.");
        return;
      }
      applyPayload(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load results.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/compare", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as { report?: CompareReport; source?: string; truthful?: boolean };
      })
      .then((payload) => {
        if (cancelled || !payload?.report) return;
        startTransition(() => applyPayload(payload));
      })
      .catch(() => {
        // Keep empty honest state.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadSample() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/compare?sample=1", { cache: "no-store" });
      const payload = (await response.json()) as {
        report?: CompareReport;
        source?: string;
        truthful?: boolean;
        error?: { message?: string };
      };
      if (!response.ok) {
        setError(payload.error?.message ?? "Could not load sample.");
        return;
      }
      applyPayload({ ...payload, truthful: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load sample.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error ? <p className="subtle">{error}</p> : null}
      <CompareResults
        report={report}
        source={source}
        truthful={truthful}
        busy={busy}
        onRefresh={() => void refreshReal()}
        onLoadSample={() => void loadSample()}
      />
    </>
  );
}

function ReleasesView({
  confirmedCount,
  runs,
  reviews
}: {
  confirmedCount: number;
  runs: EvaluatedRun[];
  reviews: Record<string, ReviewRecord>;
}) {
  const [watchSummary, setWatchSummary] = useState<{ caseCount: number; regressed: number; runCount: number } | null>(
    null
  );
  const groups = useMemo(() => groupIssues(runs, reviews), [runs, reviews]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/watch", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as { caseCount?: number; regressed?: number; runCount?: number };
        if (!cancelled) {
          setWatchSummary({
            caseCount: payload.caseCount ?? 0,
            regressed: payload.regressed ?? 0,
            runCount: payload.runCount ?? 0
          });
        }
      })
      .catch(() => {
        // offline ok
      });
    return () => {
      cancelled = true;
    };
  }, [runs.length, confirmedCount]);

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Release gate + online watch</h2>
          <p className="subtle">Confirmed cases are watched on every new capture, then gated in CI.</p>
        </div>
      </div>

      <div className="metrics" style={{ marginBottom: 16 }}>
        <Metric label="Confirmed cases" value={String(confirmedCount)} />
        <Metric label="Issue groups" value={String(groups.length)} />
        <Metric label="Cases on disk" value={String(watchSummary?.caseCount ?? "—")} />
        <Metric label="Watch regressions" value={String(watchSummary?.regressed ?? "—")} />
      </div>

      {groups.length > 0 ? (
        <div className="run-list" style={{ marginBottom: 16 }}>
          {groups.slice(0, 8).map((group) => (
            <div key={group.fingerprint} className="run-card">
              <div className="run-title">
                <h3>{group.title}</h3>
                <span className="tag danger">×{group.count}</span>
              </div>
              <p className="subtle">{group.reason}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="subtle">No open issue groups. Confirm failures in Inspect to grow the gate.</p>
      )}

      <div className="api-box" style={{ marginTop: 12 }}>
        <code>POST /api/results</code>
        <p className="subtle detail-line">
          Body: baselineVersion, candidateVersion, results[]. Returns pass, fail, or incomplete. Also runs the
          confirmed-case CI gate.
        </p>
        <code style={{ display: "block", marginTop: 10 }}>GET /api/watch</code>
        <p className="subtle detail-line">Scores live runs against evals/cases/*.json (regressed / clear / watching).</p>
        <code style={{ display: "block", marginTop: 10 }}>node scripts/ci-gate.mjs</code>
        <p className="subtle detail-line">GitHub Action: .github/workflows/evalos-gate.yml</p>
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

"use client";

import type { CompareCell, CompareReport } from "@/lib/compare";

export function CompareResults({
  report,
  source,
  onLoadSample,
  busy
}: {
  report: CompareReport;
  source: string;
  onLoadSample?: () => void;
  busy?: boolean;
}) {
  const left = report.versions[0];
  const right = report.versions[1];

  return (
    <div className="compare-shell">
      <div className="compare-head">
        <div>
          <div className="field-label">Evaluations</div>
          <h2>{report.title}</h2>
          <p className="subtle">
            Side-by-side harness results — pass ratio, score distribution, and per-case cost/latency.
            {source === "sample" ? " Showing sample data so the surface is never empty." : null}
          </p>
        </div>
        {onLoadSample ? (
          <button className="button" type="button" disabled={busy} onClick={onLoadSample}>
            Load sample compare
          </button>
        ) : null}
      </div>

      <div className="compare-charts">
        <article className="compare-chart-card">
          <h3>Pass ratio</h3>
          <div className="pass-bars">
            {report.summaries.map((summary) => (
              <div key={summary.agentVersion} className="pass-bar-row">
                <div className="pass-bar-label">
                  <strong>{shortVersion(summary.agentVersion)}</strong>
                  <span>
                    {summary.passRatio}% ({summary.passed}/{summary.total})
                  </span>
                </div>
                <div className="pass-bar-track">
                  <div className="pass-bar-fill" style={{ width: `${Math.min(100, summary.passRatio)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="compare-chart-card">
          <h3>Score histogram</h3>
          <div className="histo">
            {report.scoreBuckets.map((bucket) => {
              const max = Math.max(1, ...Object.values(bucket.counts));
              return (
                <div key={bucket.label} className="histo-col">
                  <div className="histo-stacks">
                    {report.versions.map((version, index) => (
                      <div
                        key={version}
                        className={`histo-bar tone-${index}`}
                        style={{ height: `${((bucket.counts[version] ?? 0) / max) * 100}%` }}
                        title={`${version}: ${bucket.counts[version] ?? 0}`}
                      />
                    ))}
                  </div>
                  <span>{bucket.label}</span>
                </div>
              );
            })}
          </div>
        </article>

        <article className="compare-chart-card">
          <h3>
            {left && right ? `${shortVersion(left)} vs ${shortVersion(right)}` : "Score scatter"}
          </h3>
          <ScatterPlot points={report.scatter} />
        </article>
      </div>

      <div className="compare-table-wrap">
        <table className="compare-table">
          <thead>
            <tr>
              <th>Variables</th>
              {report.versions.map((version, index) => {
                const summary = report.summaries.find((item) => item.agentVersion === version);
                return (
                  <th key={version}>
                    <div className="compare-version-head">
                      <code>{version}</code>
                      {summary ? (
                        <span className={`tag ${summary.passRatio >= 80 ? "ok" : summary.passRatio >= 50 ? "warn" : "danger"}`}>
                          {summary.passRatio.toFixed(2)}% passing ({summary.passed}/{summary.total} cases)
                        </span>
                      ) : null}
                    </div>
                    <div className="compare-version-meta">
                      avg score {summary?.avgScore ?? "—"} · {summary?.avgLatencyMs ?? "—"} ms · $
                      {summary?.avgCostUsd ?? "—"}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={row.caseId}>
                <td>
                  <div className="compare-vars">
                    {row.variables.map((variable) => (
                      <div key={variable.key}>
                        <span className="var-key">{variable.key}</span>
                        <span className="var-val">{variable.value}</span>
                      </div>
                    ))}
                  </div>
                </td>
                {report.versions.map((version) => (
                  <td key={version}>
                    <CompareCellView cell={row.cells[version]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CompareCellView({ cell }: { cell?: CompareCell }) {
  if (!cell) {
    return <div className="compare-cell empty">No result</div>;
  }

  return (
    <div className={`compare-cell ${cell.passed ? "pass" : "fail"}`}>
      <div className="compare-cell-top">
        <span className={`tag ${cell.passed ? "ok" : "danger"}`}>
          {cell.passed ? "PASS" : "FAIL"} ({(cell.qualityScore / 100).toFixed(2)})
        </span>
      </div>
      <p className="compare-output">{cell.outputPreview}</p>
      <div className="compare-metrics">
        <span>Tokens {cell.tokens ?? "—"}</span>
        <span>Latency {cell.latencyMs} ms</span>
        <span>Tokens/Sec {cell.tokensPerSec ?? "—"}</span>
        <span>Cost ${cell.costUsd.toFixed(4)}</span>
      </div>
    </div>
  );
}

function ScatterPlot({ points }: { points: Array<{ caseId: string; x: number; y: number }> }) {
  const size = 180;
  const pad = 18;
  if (points.length === 0) {
    return <p className="subtle">Need two versions to plot.</p>;
  }

  return (
    <svg className="scatter" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Score scatter">
      <line x1={pad} y1={size - pad} x2={size - pad} y2={size - pad} stroke="currentColor" opacity="0.25" />
      <line x1={pad} y1={pad} x2={pad} y2={size - pad} stroke="currentColor" opacity="0.25" />
      <line
        x1={pad}
        y1={size - pad}
        x2={size - pad}
        y2={pad}
        stroke="currentColor"
        opacity="0.15"
        strokeDasharray="4 4"
      />
      {points.map((point) => {
        const cx = pad + (point.x / 100) * (size - pad * 2);
        const cy = size - pad - (point.y / 100) * (size - pad * 2);
        return <circle key={point.caseId} cx={cx} cy={cy} r="4.5" fill="var(--accent)" />;
      })}
    </svg>
  );
}

function shortVersion(version: string) {
  const parts = version.split(":");
  return parts[parts.length - 1] || version;
}

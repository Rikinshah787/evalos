# EvalOS

### Agent failures → typed **JEV** regression tests

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
[![CI](https://github.com/Rikinshah787/evalos/actions/workflows/ci.yml/badge.svg)](https://github.com/Rikinshah787/evalos/actions/workflows/ci.yml)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6)
![SQLite](https://img.shields.io/badge/storage-SQLite-0F766E)
![Cursor](https://img.shields.io/badge/Cursor-hooks-18181b)
![Claude Code](https://img.shields.io/badge/Claude%20Code-hook-0F766E)

![EvalOS product preview](docs/assets/evalos-preview.svg)

**EvalOS** is local-first eval infrastructure for agentic software.  
It captures real Cursor / Claude Code sessions, turns failures into **JEV** records (**Judge · Evidence · Verdict**), and lets you promote confirmed findings into regression cases your harness can run forever.

> Your unit tests prove *code* works.  
> EvalOS proves the *agent* still solves the failures you already paid for.

---

## Why this exists

Agent failures disappear into chat history. Tomorrow’s model or prompt “fixes” them by accident — until they regress.

EvalOS makes failures durable:

| Without EvalOS | With EvalOS |
| --- | --- |
| “It failed once in chat” | Typed `jev.eval.v1` record |
| Screenshot of a tool error | Evidence linked to exact step / span |
| Hope the next run is better | Confirmed case → export → release gate |

```ts
type JevEvaluation = {
  schema: "jev.eval.v1";
  judge: JevJudge;       // who decided
  evidence: JevEvidence[]; // what proved it
  verdict: JevVerdict;   // pass | fail | review
};
```

---

## 60-second demo

```bash
npm install
npm run dev
```

Open the URL Next prints (often `http://localhost:3000`).

1. **Dashboard → Connect Cursor** (this workspace)  
   and/or **Connect Claude Code** (optional second source)
2. Click **Load demo** — a real tool-error finding with evidence
3. **Inspect → Confirm** — durable draft regression case
4. **Datasets** — export JSONL / Promptfoo / pytest

Data lives in `.evalos/evalos.db` and survives restarts.

---

## Product loop

```text
Cursor or Claude Code session
            │
            ▼
     Capture + normalize
            │
            ▼
   JEV  Judge · Evidence · Verdict
            │
            ▼
     Human confirms / rejects
            │
            ▼
   Draft case → export / harness
            │
            ▼
   POST /api/results → pass|fail|incomplete
```

---

## Connectors

### Cursor (this repo)

Dashboard **Connect Cursor**, or commit-ready hooks:

- `.cursor/hooks.json`
- `.cursor/hooks/evalos-capture.mjs`

Posts on `stop`, `sessionEnd`, and `postToolUseFailure` while EvalOS is running.

### Claude Code

Dashboard **Connect Claude Code**, or:

```powershell
Copy-Item .claude\evalos.settings.example.json .claude\settings.json
```

When a Claude Code task stops, the hook posts to `POST /api/runs`.

### Import / OTLP

Paste JSON in **Settings**, or:

```bash
npx evalos ingest trace.json http://localhost:3000
```

Accepts neutral JSON runs or OTLP `resourceSpans`.

---

## What ships today

- Dark / light product UI with **JEV** as the core model
- Zod-validated ingestion and stable API errors
- SQLite persistence for runs, evaluations, evidence, reviews, draft cases
- Deterministic evidence-backed evaluator
- Review queue with confirm / reject
- Exports: JSONL, Promptfoo, pytest
- Harness results API with `incomplete` for missing data (never a fake pass)
- CI: typecheck, lint, tests, build

---

## Release gate API

Your harness executes cases. EvalOS decides:

```http
POST /api/results
```

```json
{
  "baselineVersion": "v1",
  "candidateVersion": "v2",
  "results": [
    {
      "caseId": "case_checkout_refund",
      "agentVersion": "v2",
      "passed": true,
      "qualityScore": 86,
      "costUsd": 0.03,
      "latencyMs": 4200
    }
  ]
}
```

Returns `ciStatus`: `pass` | `fail` | `incomplete`.

---

## Local APIs

```http
GET    /api/runs
POST   /api/runs
DELETE /api/runs
POST   /api/reviews
POST   /api/demo
POST   /api/setup/cursor
POST   /api/setup/claude-code
POST   /api/results
```

Set `EVALOS_DB_PATH` to override `.evalos/evalos.db`.

---

## Development

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

---

## Star if this is useful

If EvalOS saves you from re-learning the same agent failure twice, **star the repo** and open an issue with the connector you want next.

Built for engineers who refuse to treat agent regressions as vibes.

## License

Apache-2.0

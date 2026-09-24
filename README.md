# EvalOS

### Agent failures → typed **JEV** regression tests

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
[![CI](https://github.com/Rikinshah787/evalos/actions/workflows/ci.yml/badge.svg)](https://github.com/Rikinshah787/evalos/actions/workflows/ci.yml)
[![GitHub stars](https://img.shields.io/github/stars/Rikinshah787/evalos?style=social)](https://github.com/Rikinshah787/evalos/stargazers)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6)
![SQLite](https://img.shields.io/badge/storage-SQLite-0F766E)
![Cursor](https://img.shields.io/badge/Cursor-hooks-18181b)
![Claude Code](https://img.shields.io/badge/Claude%20Code-hook-0F766E)

![EvalOS product preview](docs/assets/evalos-preview.svg)

**EvalOS** is local-first eval infrastructure for agentic software.  
It captures real **Cursor** and **Claude Code** sessions, turns failures into **JEV** records (**Judge · Evidence · Verdict**), and lets you promote confirmed findings into regression cases your harness can run forever.

> Your unit tests prove *code* works.  
> EvalOS proves the *agent* still solves the failures you already paid for.

**If this saves you from re-learning the same agent bug twice → [★ Star the repo](https://github.com/Rikinshah787/evalos).**

---

## 60-second try

```bash
git clone https://github.com/Rikinshah787/evalos.git
cd evalos
npm install
npm run dev
```

Open http://localhost:3000

1. **Connect Cursor** — enables hooks + local MCP (auto-capture on agent stop)  
2. Or **Import this session** — one-shot load of the live Cursor chat  
3. **Inspect** → **Confirm** → writes `evals/cases/case_*.json`  
4. Ask Cursor: `list EvalOS issues` (MCP)

Keep EvalOS running on `:3000`. Data lives in `.evalos/evalos.db`. No cloud. No signup.

---

## Why teams care

Agent failures disappear into chat. Tomorrow’s model “fixes” them by accident — until they regress.

| Without EvalOS | With EvalOS |
| --- | --- |
| “It failed once in chat” | Typed `jev.eval.v1` record |
| Screenshot of a tool error | Evidence linked to exact step / span |
| Hope the next run is better | Confirmed case → export → release gate |

```ts
type JevEvaluation = {
  schema: "jev.eval.v1";
  judge: JevJudge;       // who decided (triage signal)
  evidence: JevEvidence[]; // what proved it
  verdict: JevVerdict;   // pass | fail | review
};
```

**Product truth:** automatic scores are *triage signals*. **Confirmed JEV cases** are the source of truth.

---

## vs the usual stack

| | EvalOS | Promptfoo | LangSmith | Braintrust |
| --- | --- | --- | --- | --- |
| Capture from Cursor / Claude Code chat | ✅ first-class | ❌ | ❌ | ❌ |
| Human confirm → durable case | ✅ core loop | optional | traces | datasets |
| Local SQLite, no signup | ✅ | ✅ CLI | cloud | cloud |
| CI `pass \| fail \| incomplete` | ✅ | custom | custom | gates |
| LLM-as-judge playground | thin triage | ✅ | ✅ | ✅ |

EvalOS is not “another scoreboard.” It is **Sentry for agent failures you already hit** — then Promptfoo/pytest forever.

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

### Cursor

Dashboard **Connect Cursor**, or:

- `.cursor/hooks.json`
- `.cursor/hooks/evalos-capture.mjs`

Posts on `stop`, `sessionEnd`, and `postToolUseFailure` while EvalOS is running.

### Claude Code

Dashboard **Connect Claude Code**, or:

```powershell
Copy-Item .claude\evalos.settings.example.json .claude\settings.json
```

### Import / OTLP

Paste JSON in **Settings**, or:

```bash
npx evalos ingest trace.json http://localhost:3000
```

---

## What ships today

- **Auto-capture:** Cursor stop / tool failure → full transcript ingest (port `3000`)
- **Confirm → repo:** writes `evals/cases/*.json` as the durable regression source of truth
- **Local MCP:** `evalos_list_issues`, `evalos_get_issue`, `evalos_import_session`, `evalos_confirm`
- Dark / light product UI with live capture toasts
- Zod-validated ingestion and stable API errors
- SQLite persistence for runs, evaluations, evidence, reviews, draft cases
- Deterministic evidence-backed triage (loop = same tool + same inputs)
- Exports: JSONL, Promptfoo, pytest
- Harness results API with `incomplete` for missing data (never a fake pass)
- CI: typecheck, lint, tests, build

**Not claiming:** cloud production monitoring like Lemma. EvalOS owns the IDE failure → owned test loop.

---

## Release gate API

```http
POST /api/results
```

Returns `ciStatus`: `pass` | `fail` | `incomplete`.

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

Built for engineers who refuse to treat agent regressions as vibes.

**[★ Star EvalOS](https://github.com/Rikinshah787/evalos)** · [Open an issue](https://github.com/Rikinshah787/evalos/issues) · Apache-2.0

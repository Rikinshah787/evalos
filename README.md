# EvalOS

### Your agent failed once. Make sure it never fails the same way twice.

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
[![CI](https://github.com/Rikinshah787/evalos/actions/workflows/ci.yml/badge.svg)](https://github.com/Rikinshah787/evalos/actions/workflows/ci.yml)
[![GitHub stars](https://img.shields.io/github/stars/Rikinshah787/evalos?style=social)](https://github.com/Rikinshah787/evalos/stargazers)

```bash
npm install && npm run demo
```

```text
User   Refund order #48291...
↻ lookup_order({"orderId":"48291"})  Missing order id…
↻ lookup_order({"orderId":"48291"})  Missing order id…
↻ lookup_order({"orderId":"48291"})  Missing order id…   ← stuck loop

Judge · Evidence · Verdict → Confirm
→ wrote evals/cases/case_demo_viral_loop.json
→ CI gate: FAIL  (candidate still loops)
```

**That’s EvalOS:** capture a real agent failure → attach exact tool evidence → you Confirm → it becomes a regression case → CI goes red if it comes back.

No cloud. No signup. Local SQLite.

**If that should exist → [★ Star the repo](https://github.com/Rikinshah787/evalos).**

---

## Try it (15 seconds)

```bash
git clone https://github.com/Rikinshah787/evalos.git
cd evalos
npm install
npm run demo          # terminal: fail → Confirm → case → CI red
```

Or:

```bash
npx evalos demo
```

## Open the UI (60 seconds)

```bash
npm run dev
```

Open http://localhost:3000

1. Auto Cursor hooks on boot — agent stop captures into EvalOS  
2. **Inspect** a finding → **Confirm** (`C`) / **Reject** (`R`)  
3. Confirmed findings write `evals/cases/case_*.json`  
4. `npm run gate` → `pass | fail | incomplete`

```bash
npx evalos init && npx evalos dev
```

Data: `.evalos/evalos.db`. Keep the app on `:3000`.

---

## Why this spreads

Agent failures die in chat. Tomorrow’s model “fixes” them by accident — until they regress in prod.

| Without EvalOS | With EvalOS |
| --- | --- |
| “It failed once in Cursor” | Confirmed case file in the repo |
| Screenshot of a tool error | Evidence linked to exact steps |
| Hope the next run is better | CI blocks the same failure |

**Product truth:** automatic scores are *triage signals*. **Confirmed cases** are the source of truth.

---

## vs the usual stack

| | EvalOS | Promptfoo | LangSmith | Braintrust |
| --- | --- | --- | --- | --- |
| Capture from Cursor / Claude Code chat | ✅ first-class | ❌ | ❌ | ❌ |
| Human confirm → durable case | ✅ core loop | optional | traces | datasets |
| Local SQLite, no signup | ✅ | ✅ CLI | cloud | cloud |
| CI `pass \| fail \| incomplete` | ✅ | custom | custom | gates |

EvalOS is **Sentry for agent failures you already hit** — then Promptfoo/pytest forever.

---

## Product loop

```text
Cursor / Claude Code / any agent JSON
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
   evals/cases/*.json → harness / CI
```

---

## Connectors

### Cursor

`npm run dev` auto-wires hooks + MCP. Or dashboard **Connect Cursor**.

### Claude Code

Dashboard **Connect Claude Code**, or copy `.claude/evalos.settings.example.json` → `.claude/settings.json`.

### Any agent

```bash
npx evalos ingest trace.json http://localhost:3000
```

---

## What ships

- Auto-capture (Cursor stop / tool failure)
- Confirm → `evals/cases/*.json`
- Results UI (live runs only; sample opt-in)
- Online watch vs confirmed cases
- Issue groups by failure fingerprint
- CI gate + GitHub Action
- Secret redaction on ingest
- Local MCP
- Exports: JSONL, Promptfoo, pytest

Launch / post copy: [`docs/LAUNCH.md`](docs/LAUNCH.md)

---

## Development

```bash
npm run demo
npm run typecheck && npm run lint && npm test && npm run build
```

---

## Star if this is useful

Built for engineers who refuse to treat agent regressions as vibes.

**[★ Star EvalOS](https://github.com/Rikinshah787/evalos)** · [Issues](https://github.com/Rikinshah787/evalos/issues) · Apache-2.0

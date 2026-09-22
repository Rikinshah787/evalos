# Contributing to EvalOS

EvalOS is early. The best contributions are small, typed, and easy to verify.

## Local setup

```bash
npm install
npm run dev
```

## Checks

Run these before opening a PR:

```bash
npm run typecheck
npm run lint
```

## Good first areas

- Claude Code transcript normalization
- OpenTelemetry span mapping
- JEV evaluator plugins
- Dataset export formats
- Persistence adapters

## Design principles

- Keep agents and harnesses outside the core.
- Preserve evidence before producing verdicts.
- Make every evaluator versioned.
- Prefer typed contracts over ad hoc JSON.
- Do not include real secrets or private transcripts in fixtures.

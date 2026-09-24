# Eval cases

Confirmed JEV findings land here as durable regression cases.

```text
Confirm in Inspect  →  evals/cases/case_<runId>.json
npm run demo        →  case_demo_viral_loop.json (gitignored) + CI red
```

Point Promptfoo / pytest / your harness at these files. They are the source of truth — not the triage score in the UI.

Commit real confirmed cases. Demo artifacts stay local.

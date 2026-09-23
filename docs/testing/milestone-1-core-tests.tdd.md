# TDD Evidence: Milestone 1 Core Tests

## Source

Derived from the EvalOS Product Architecture brief supplied on 2026-09-23.

## User Journeys

- As a developer, I can ingest JSON or OpenTelemetry traces so that live agent sessions become normalized runs.
- As a reviewer, I can trust that findings include exact evidence and a typed JEV record.
- As a maintainer, I can export reviewed failures into portable regression formats.
- As a release owner, I can compare baseline and candidate results without treating missing data as a false pass.

## Evidence

| Guarantee | Test file | Result | Evidence |
| --- | --- | --- | --- |
| Neutral JSON ingestion preserves trace metadata, timing, cost, and step errors | `tests/unit/importer.test.ts` | PASS | `npm test` |
| OpenTelemetry `resourceSpans` normalize into trace-linked runs and ordered steps | `tests/unit/importer.test.ts` | PASS | `npm test` |
| Tool errors produce JEV evidence linked to the exact failed step | `tests/unit/evaluator.test.ts` | PASS | `npm test` |
| Repeated identical tool calls are detected as loops with all repeated steps cited | `tests/unit/evaluator.test.ts` | PASS | `npm test` |
| Reviewed findings produce regression cases and JSONL/Promptfoo/pytest exports | `tests/unit/exporters.test.ts` | PASS | `npm test` |
| Release comparison passes, fails, and reports incomplete missing-data states | `tests/unit/release.test.ts` | PASS | `npm test` |

## RED/GREEN Summary

- RED: `npm test` initially failed because missing baseline/candidate data returned `pass` instead of `incomplete`, and OpenTelemetry spans without timestamps sorted ahead of timed root spans.
- GREEN: `npm test` passes after adding `incomplete` release status handling and sorting untimed OpenTelemetry spans after timed spans.

## Validation Commands

```bash
npm test
npm run typecheck
npm run lint
```

All three passed after the implementation.

## Known Gaps

- Coverage thresholds are not enforced yet.
- API integration tests and Playwright journeys are still pending.
- Persistence tests are pending SQLite/Drizzle implementation.

#!/usr/bin/env node
/**
 * Ingest the newest Cursor agent transcript into the local EvalOS SQLite DB.
 * Usage: node --import tsx scripts/ingest-cursor-session.mts
 * Or:    npx tsx scripts/ingest-cursor-session.mts
 */

import { loadCursorSessionRun } from "../lib/cursor-transcript.ts";
import { evaluateRuns } from "../lib/evaluator.ts";
import { clearEvaluations, saveEvaluations } from "../lib/evaluation-store.ts";
import { clearReviews } from "../lib/review-store.ts";
import { appendRuns, clearRuns, listRuns } from "../lib/run-store.ts";
import { closeDatabaseForTests } from "../lib/db/connection.ts";

const run = loadCursorSessionRun();
clearReviews();
clearEvaluations();
clearRuns();
appendRuns([run]);
const evaluated = evaluateRuns([run]);
saveEvaluations(evaluated.map((item) => item.evaluation));

console.log(
  JSON.stringify(
    {
      ok: true,
      runId: run.id,
      messages: run.input.length,
      steps: run.steps.length,
      toolCalls: run.steps.filter((step) => step.type === "tool_call" || step.type === "error").length,
      outcome: evaluated[0]?.evaluation.outcome,
      failureType: evaluated[0]?.evaluation.failureType,
      sourceUrl: run.sourceUrl,
      totalRuns: listRuns().length
    },
    null,
    2
  )
);

closeDatabaseForTests();

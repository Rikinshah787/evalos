import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

type DatabaseHandle = {
  path: string;
  sqlite: Database.Database;
  db: ReturnType<typeof drizzle<typeof schema>>;
};

let handle: DatabaseHandle | null = null;

export function getDatabasePath() {
  return process.env.EVALOS_DB_PATH || join(process.cwd(), ".evalos", "evalos.db");
}

export function getDatabase() {
  const path = getDatabasePath();

  if (handle && handle.path === path) {
    return handle.db;
  }

  closeDatabaseForTests();
  ensureParentDir(path);

  const sqlite = new Database(path);
  sqlite.pragma("foreign_keys = ON");
  runMigrations(sqlite);

  handle = {
    path,
    sqlite,
    db: drizzle(sqlite, { schema })
  };

  return handle.db;
}

export function closeDatabaseForTests() {
  if (handle) {
    handle.sqlite.close();
    handle = null;
  }
}

function ensureParentDir(path: string) {
  const parent = dirname(path);
  if (!existsSync(parent)) {
    mkdirSync(parent, { recursive: true });
  }
}

function runMigrations(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY NOT NULL,
      source TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      framework TEXT NOT NULL,
      environment TEXT NOT NULL,
      started_at TEXT NOT NULL,
      model TEXT,
      prompt_version TEXT,
      source_url TEXT,
      total_cost_usd REAL,
      latency_ms INTEGER,
      final_output TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS runs_started_at_idx ON runs (started_at);
    CREATE INDEX IF NOT EXISTS runs_source_idx ON runs (source);
    CREATE INDEX IF NOT EXISTS runs_agent_name_idx ON runs (agent_name);

    CREATE TABLE IF NOT EXISTS run_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      sequence INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp TEXT
    );

    CREATE INDEX IF NOT EXISTS run_messages_run_id_idx ON run_messages (run_id);

    CREATE TABLE IF NOT EXISTS run_steps (
      id TEXT NOT NULL,
      run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      sequence INTEGER NOT NULL,
      trace_id TEXT,
      span_id TEXT,
      parent_span_id TEXT,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      input_json TEXT,
      output_json TEXT,
      error TEXT,
      started_at TEXT,
      ended_at TEXT,
      duration_ms INTEGER,
      cost_usd REAL,
      source_url TEXT,
      metadata_json TEXT,
      PRIMARY KEY (run_id, id)
    );

    CREATE INDEX IF NOT EXISTS run_steps_run_id_idx ON run_steps (run_id);
    CREATE INDEX IF NOT EXISTS run_steps_trace_id_idx ON run_steps (trace_id);
    CREATE INDEX IF NOT EXISTS run_steps_span_id_idx ON run_steps (span_id);

    CREATE TABLE IF NOT EXISTS evaluations (
      id TEXT PRIMARY KEY NOT NULL,
      run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      evaluator_id TEXT NOT NULL,
      evaluator_version TEXT NOT NULL,
      evaluator_kind TEXT NOT NULL,
      status TEXT NOT NULL,
      passed INTEGER NOT NULL,
      score REAL NOT NULL,
      risk TEXT NOT NULL,
      outcome TEXT NOT NULL,
      failure_type TEXT NOT NULL,
      confidence REAL,
      reason TEXT NOT NULL,
      suggested_assertion TEXT NOT NULL,
      review_priority INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS evaluations_run_id_idx ON evaluations (run_id);
    CREATE INDEX IF NOT EXISTS evaluations_failure_type_idx ON evaluations (failure_type);
    CREATE INDEX IF NOT EXISTS evaluations_created_at_idx ON evaluations (created_at);

    CREATE TABLE IF NOT EXISTS evaluation_evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      evaluation_id TEXT NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
      run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      step_id TEXT NOT NULL,
      trace_id TEXT,
      span_id TEXT,
      step_name TEXT NOT NULL,
      step_type TEXT NOT NULL,
      excerpt TEXT NOT NULL,
      explanation TEXT
    );

    CREATE INDEX IF NOT EXISTS evaluation_evidence_evaluation_id_idx ON evaluation_evidence (evaluation_id);
    CREATE INDEX IF NOT EXISTS evaluation_evidence_run_id_idx ON evaluation_evidence (run_id);

    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY NOT NULL,
      evaluation_id TEXT REFERENCES evaluations(id) ON DELETE SET NULL,
      run_id TEXT NOT NULL UNIQUE REFERENCES runs(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      category TEXT NOT NULL,
      expected_behavior TEXT NOT NULL,
      notes TEXT,
      reviewer TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS reviews_status_idx ON reviews (status);

    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY NOT NULL,
      dataset_id TEXT NOT NULL,
      name TEXT NOT NULL,
      version INTEGER NOT NULL,
      status TEXT NOT NULL,
      source_run_id TEXT REFERENCES runs(id) ON DELETE SET NULL,
      source_evaluation_id TEXT REFERENCES evaluations(id) ON DELETE SET NULL,
      failure_type TEXT NOT NULL,
      risk TEXT NOT NULL,
      expected_behavior TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS cases_dataset_id_idx ON cases (dataset_id);
    CREATE INDEX IF NOT EXISTS cases_source_run_id_idx ON cases (source_run_id);
    CREATE INDEX IF NOT EXISTS cases_status_idx ON cases (status);

    CREATE TABLE IF NOT EXISTS ingestion_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      external_id TEXT,
      message TEXT NOT NULL,
      payload_json TEXT,
      created_at TEXT NOT NULL
    );
  `);
}

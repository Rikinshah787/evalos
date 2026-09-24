import { getDatabase } from "./db/connection";
import { cases, evaluationEvidence, evaluations, reviews, runMessages, runSteps, runs } from "./db/schema";
import { sql } from "drizzle-orm";

export type DbTableStats = {
  name: string;
  count: number;
};

export type DbBrowserPayload = {
  engine: "sqlite";
  path: string;
  graphOption: "sqlite-property-graph" | "neo4j-optional";
  tables: DbTableStats[];
  recentRuns: Array<{
    id: string;
    agentName: string;
    framework: string;
    source: string;
    startedAt: string;
    model: string | null;
  }>;
  note: string;
};

/** Inspect the real local SQLite store — no demo rows invented. */
export function browseDatabase(): DbBrowserPayload {
  const db = getDatabase();
  const path = process.env.EVALOS_DB_PATH || ".evalos/evalos.db";

  const countOf = (table: typeof runs | typeof runMessages | typeof runSteps | typeof evaluations | typeof evaluationEvidence | typeof reviews | typeof cases) =>
    Number(db.select({ value: sql<number>`count(*)` }).from(table).all()[0]?.value ?? 0);

  const recentRuns = db
    .select({
      id: runs.id,
      agentName: runs.agentName,
      framework: runs.framework,
      source: runs.source,
      startedAt: runs.startedAt,
      model: runs.model
    })
    .from(runs)
    .orderBy(sql`${runs.startedAt} desc`)
    .limit(25)
    .all();

  return {
    engine: "sqlite",
    path,
    graphOption: "sqlite-property-graph",
    tables: [
      { name: "runs", count: countOf(runs) },
      { name: "run_messages", count: countOf(runMessages) },
      { name: "run_steps", count: countOf(runSteps) },
      { name: "evaluations", count: countOf(evaluations) },
      { name: "evaluation_evidence", count: countOf(evaluationEvidence) },
      { name: "reviews", count: countOf(reviews) },
      { name: "cases", count: countOf(cases) }
    ],
    recentRuns,
    note:
      "SQLite is the source of truth. Use Graph view for a property-graph projection of any run. Neo4j is optional later via EVALOS_GRAPH_URL — not required."
  };
}

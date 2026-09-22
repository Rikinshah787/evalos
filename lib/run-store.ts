import type { AgentRun } from "./types";

type EvalosGlobal = typeof globalThis & {
  __evalosRuns?: AgentRun[];
};

function getStore(): AgentRun[] {
  const scopedGlobal = globalThis as EvalosGlobal;
  scopedGlobal.__evalosRuns ??= [];
  return scopedGlobal.__evalosRuns;
}

export function listRuns(): AgentRun[] {
  return [...getStore()];
}

export function appendRuns(runs: AgentRun[]): AgentRun[] {
  const store = getStore();
  const seen = new Set(store.map((run) => run.id));

  for (const run of runs) {
    if (!seen.has(run.id)) {
      store.unshift(run);
      seen.add(run.id);
    }
  }

  return listRuns();
}

export function clearRuns() {
  const scopedGlobal = globalThis as EvalosGlobal;
  scopedGlobal.__evalosRuns = [];
}

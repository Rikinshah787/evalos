#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const command = process.argv[2] ?? "help";
const cwd = process.cwd();
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

if (command === "init") {
  const configPath = join(cwd, "evalos.config.json");
  const samplesDir = join(cwd, ".evalos");
  const casesDir = join(cwd, "evals", "cases");

  mkdirSync(samplesDir, { recursive: true });
  mkdirSync(casesDir, { recursive: true });

  if (!existsSync(join(cwd, "evals", "README.md"))) {
    writeFileSync(
      join(cwd, "evals", "README.md"),
      `# Eval cases\n\nConfirmed JEV findings land in \`evals/cases/\`.\n`,
      "utf8"
    );
  }

  if (!existsSync(configPath)) {
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          retention: { maxAgeDays: 30, keepFailedRuns: true },
          ci: { minQualityDelta: 0, maxCostIncreasePct: 20, maxLatencyIncreasePct: 15 },
          serverUrl: "http://localhost:3000"
        },
        null,
        2
      )
    );
  }

  writeFileSync(
    join(samplesDir, "otel-trace.sample.json"),
    JSON.stringify(
      {
        resourceSpans: [
          {
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: "trace-demo-001",
                    spanId: "span-root",
                    name: "agent.run",
                    startTimeUnixNano: "1790000000000000000",
                    endTimeUnixNano: "1790000003200000000",
                    attributes: [
                      { key: "service.name", value: { stringValue: "support-agent" } },
                      { key: "agent.input", value: { stringValue: "Refund my broken headphones" } }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      },
      null,
      2
    )
  );

  console.log("EvalOS ready.\n");
  console.log("  npx evalos dev");
  console.log("  open http://localhost:3000 → Results\n");
  process.exit(0);
}

if (command === "dev") {
  const result = spawnSync("npm", ["run", "dev"], {
    cwd: existsSync(join(cwd, "package.json")) ? cwd : repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  process.exit(result.status ?? 1);
}

if (command === "ingest") {
  const file = process.argv[3];
  const serverUrl = process.argv[4] ?? readConfigServerUrl();
  if (!file) fail("Usage: npx evalos ingest <trace.json> [serverUrl]");
  const payload = readFileSync(resolve(cwd, file), "utf8");
  const response = await fetch(`${serverUrl}/api/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload
  });
  console.log(JSON.stringify(await response.json(), null, 2));
  process.exit(response.ok ? 0 : 1);
}

if (command === "gate") {
  const script = join(repoRoot, "scripts", "ci-gate.mjs");
  const result = spawnSync(process.execPath, [script, ...process.argv.slice(3)], {
    cwd,
    stdio: "inherit"
  });
  process.exit(result.status ?? 1);
}

if (command === "demo") {
  const script = join(repoRoot, "scripts", "demo.mjs");
  const result = spawnSync(process.execPath, [script], {
    cwd: repoRoot,
    stdio: "inherit"
  });
  process.exit(result.status ?? 1);
}

if (command === "proxy") {
  const script = join(repoRoot, "scripts", "evalos-proxy.mjs");
  const result = spawnSync(process.execPath, [script, ...process.argv.slice(3)], {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env
  });
  process.exit(result.status ?? 1);
}

printHelp();

function readConfigServerUrl() {
  const configPath = join(cwd, "evalos.config.json");
  if (!existsSync(configPath)) return "http://localhost:3000";
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  return config.serverUrl ?? "http://localhost:3000";
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function printHelp() {
  console.log(`EvalOS — agent failures → regression tests

Commands:
  npx evalos demo                  15s: fail → Confirm → case → CI red
  npx evalos proxy                 Magic: capture OpenAI/Anthropic traffic
  npx evalos init                  Create config + evals/cases scaffold
  npx evalos dev                   Start local UI on :3000
  npx evalos ingest <trace.json>   POST JSON / OTLP traces
  npx evalos gate                  Run CI gate on evals/cases
`);
}

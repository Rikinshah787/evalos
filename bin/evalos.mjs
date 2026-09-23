#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const command = process.argv[2] ?? "help";
const cwd = process.cwd();

if (command === "init") {
  const configPath = join(cwd, "evalos.config.json");
  const samplesDir = join(cwd, ".evalos");

  if (!existsSync(samplesDir)) mkdirSync(samplesDir, { recursive: true });
  if (!existsSync(configPath)) {
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          retention: {
            maxAgeDays: 30,
            keepFailedRuns: true
          },
          ci: {
            minQualityDelta: 0,
            maxCostIncreasePct: 20,
            maxLatencyIncreasePct: 15
          },
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
                      { key: "agent.input", value: { stringValue: "Refund my broken headphones" } },
                      { key: "agent.prompt.version", value: { stringValue: "support-v13" } }
                    ]
                  },
                  {
                    traceId: "trace-demo-001",
                    spanId: "span-tool",
                    parentSpanId: "span-root",
                    name: "tool.lookup_order",
                    startTimeUnixNano: "1790000000200000000",
                    endTimeUnixNano: "1790000000800000000",
                    status: { code: "STATUS_CODE_ERROR", message: "Missing order id" },
                    attributes: [{ key: "gen_ai.usage.cost_usd", value: { doubleValue: 0.001 } }]
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

  console.log("EvalOS config created.");
  console.log("Next: npm install evalos && npx evalos dev");
  process.exit(0);
}

if (command === "dev") {
  const result = spawnSync("npm", ["run", "dev"], { stdio: "inherit", shell: process.platform === "win32" });
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

printHelp();

function readConfigServerUrl() {
  const configPath = join(cwd, "evalos.config.json");
  if (!existsSync(configPath)) return "http://localhost:3001";
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  return config.serverUrl ?? "http://localhost:3001";
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function printHelp() {
  console.log(`EvalOS

Commands:
  npx evalos init                  Create evalos.config.json and sample OpenTelemetry trace
  npx evalos dev                   Start the local EvalOS app
  npx evalos ingest <trace.json>   POST JSON or OpenTelemetry traces to /api/runs
`);
}

#!/usr/bin/env node

/**
 * Runs before `next dev` so Cursor hooks exist without clicking Connect.
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const serverUrl = process.env.EVALOS_URL || "http://localhost:3000";

const HOOKS_TEMPLATE = {
  version: 1,
  hooks: {
    stop: [{ command: "node .cursor/hooks/evalos-capture.mjs" }],
    postToolUseFailure: [{ command: "node .cursor/hooks/evalos-capture.mjs" }],
    sessionEnd: [{ command: "node .cursor/hooks/evalos-capture.mjs" }]
  }
};

const hooksDir = join(root, ".cursor", "hooks");
const hooksJson = join(root, ".cursor", "hooks.json");
const mcpJson = join(root, ".cursor", "mcp.json");
const captureScript = join(root, ".cursor", "hooks", "evalos-capture.mjs");
const scriptSource = join(root, "scripts", "cursor-evalos-hook.mjs");
const mcpScript = join(root, "bin", "evalos-mcp.mjs");

mkdirSync(hooksDir, { recursive: true });

if (existsSync(scriptSource)) {
  copyFileSync(scriptSource, captureScript);
}

writeFileSync(hooksJson, `${JSON.stringify(HOOKS_TEMPLATE, null, 2)}\n`, "utf8");

if (existsSync(mcpScript)) {
  writeFileSync(
    mcpJson,
    `${JSON.stringify(
      {
        mcpServers: {
          evalos: {
            type: "stdio",
            command: "node",
            args: [mcpScript.replaceAll("\\", "/")],
            env: { EVALOS_URL: serverUrl }
          }
        }
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

console.log(`[evalos] Cursor auto-setup ready → ${serverUrl}`);
console.log("[evalos] Agent stop / tool failure / sessionEnd will capture automatically.");

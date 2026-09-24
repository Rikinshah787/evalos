import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_URL = process.env.EVALOS_URL || "http://localhost:3000";

const HOOKS_TEMPLATE = {
  version: 1,
  hooks: {
    stop: [{ command: "node .cursor/hooks/evalos-capture.mjs" }],
    postToolUseFailure: [{ command: "node .cursor/hooks/evalos-capture.mjs" }],
    sessionEnd: [{ command: "node .cursor/hooks/evalos-capture.mjs" }]
  }
};

export type AutoSetupResult = {
  connected: boolean;
  mcpConnected: boolean;
  changed: boolean;
  hooksPath: string;
  mcpPath: string;
  serverUrl: string;
  message: string;
};

/** Idempotent: write Cursor hooks + MCP the first time EvalOS boots in this repo. */
export function ensureCursorAutoSetup(cwd = process.cwd()): AutoSetupResult {
  const hooksDir = join(cwd, ".cursor", "hooks");
  const hooksJson = join(cwd, ".cursor", "hooks.json");
  const mcpJson = join(cwd, ".cursor", "mcp.json");
  const captureScript = join(cwd, ".cursor", "hooks", "evalos-capture.mjs");
  const scriptSource = join(cwd, "scripts", "cursor-evalos-hook.mjs");
  const mcpScript = join(cwd, "bin", "evalos-mcp.mjs");

  mkdirSync(hooksDir, { recursive: true });
  let changed = false;

  if (existsSync(scriptSource)) {
    const next = readFileSync(scriptSource, "utf8");
    const prev = existsSync(captureScript) ? readFileSync(captureScript, "utf8") : "";
    if (prev !== next) {
      copyFileSync(scriptSource, captureScript);
      changed = true;
    }
  } else if (!existsSync(captureScript)) {
    return {
      connected: false,
      mcpConnected: false,
      changed: false,
      hooksPath: ".cursor/hooks.json",
      mcpPath: ".cursor/mcp.json",
      serverUrl: DEFAULT_URL,
      message: "Missing Cursor hook script source."
    };
  }

  const hooksBody = `${JSON.stringify(HOOKS_TEMPLATE, null, 2)}\n`;
  const prevHooks = existsSync(hooksJson) ? readFileSync(hooksJson, "utf8") : "";
  if (prevHooks !== hooksBody) {
    writeFileSync(hooksJson, hooksBody, "utf8");
    changed = true;
  }

  let mcpConnected = false;
  if (existsSync(mcpScript)) {
    const mcpBody = `${JSON.stringify(
      {
        mcpServers: {
          evalos: {
            type: "stdio",
            command: "node",
            args: [mcpScript.replaceAll("\\", "/")],
            env: { EVALOS_URL: DEFAULT_URL }
          }
        }
      },
      null,
      2
    )}\n`;
    const prevMcp = existsSync(mcpJson) ? readFileSync(mcpJson, "utf8") : "";
    if (prevMcp !== mcpBody) {
      writeFileSync(mcpJson, mcpBody, "utf8");
      changed = true;
    }
    mcpConnected = true;
  }

  return {
    connected: existsSync(hooksJson) && existsSync(captureScript),
    mcpConnected,
    changed,
    hooksPath: ".cursor/hooks.json",
    mcpPath: ".cursor/mcp.json",
    serverUrl: DEFAULT_URL,
    message: changed
      ? "Auto-setup wrote Cursor hooks + MCP. Keep EvalOS running — agent stops will capture."
      : "Cursor capture already configured."
  };
}

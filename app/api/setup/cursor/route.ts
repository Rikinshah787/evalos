import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { apiError, fromUnknownError } from "@/lib/validation/errors";

const DEFAULT_URL = process.env.EVALOS_URL || "http://localhost:3000";

const HOOKS_TEMPLATE = {
  version: 1,
  hooks: {
    stop: [{ command: "node .cursor/hooks/evalos-capture.mjs" }],
    postToolUseFailure: [{ command: "node .cursor/hooks/evalos-capture.mjs" }],
    sessionEnd: [{ command: "node .cursor/hooks/evalos-capture.mjs" }]
  }
};

function paths() {
  const root = process.cwd();
  return {
    root,
    hooksDir: join(root, ".cursor", "hooks"),
    hooksJson: join(root, ".cursor", "hooks.json"),
    mcpJson: join(root, ".cursor", "mcp.json"),
    captureScript: join(root, ".cursor", "hooks", "evalos-capture.mjs"),
    scriptSource: join(root, "scripts", "cursor-evalos-hook.mjs"),
    mcpScript: join(root, "bin", "evalos-mcp.mjs")
  };
}

function mcpTemplate(root: string) {
  return {
    mcpServers: {
      evalos: {
        type: "stdio",
        command: "node",
        args: [join(root, "bin", "evalos-mcp.mjs").replaceAll("\\", "/")],
        env: {
          EVALOS_URL: DEFAULT_URL
        }
      }
    }
  };
}

export async function GET() {
  try {
    const { hooksJson, captureScript, mcpJson } = paths();
    const connected = existsSync(hooksJson) && existsSync(captureScript);
    let events: string[] = [];

    if (existsSync(hooksJson)) {
      try {
        const parsed = JSON.parse(readFileSync(hooksJson, "utf8")) as {
          hooks?: Record<string, unknown>;
        };
        events = Object.keys(parsed.hooks ?? {});
      } catch {
        events = [];
      }
    }

    return NextResponse.json({
      connected,
      mcpConnected: existsSync(mcpJson),
      events,
      targetPath: ".cursor/hooks.json",
      mcpPath: ".cursor/mcp.json",
      serverUrl: DEFAULT_URL
    });
  } catch (error) {
    return fromUnknownError(error);
  }
}

export async function POST() {
  try {
    const { root, hooksDir, hooksJson, captureScript, scriptSource, mcpJson, mcpScript } = paths();
    mkdirSync(hooksDir, { recursive: true });

    if (existsSync(scriptSource)) {
      copyFileSync(scriptSource, captureScript);
    } else if (!existsSync(captureScript)) {
      return apiError(404, "missing_hook_script", "Missing Cursor EvalOS hook script.");
    }

    writeFileSync(hooksJson, `${JSON.stringify(HOOKS_TEMPLATE, null, 2)}\n`, "utf8");

    if (existsSync(mcpScript)) {
      writeFileSync(mcpJson, `${JSON.stringify(mcpTemplate(root), null, 2)}\n`, "utf8");
    }

    return NextResponse.json({
      connected: true,
      mcpConnected: existsSync(mcpJson),
      targetPath: ".cursor/hooks.json",
      mcpPath: ".cursor/mcp.json",
      message:
        "Cursor hooks + MCP enabled. Keep EvalOS on :3000. Agent stops auto-ingest the full transcript. Ask Cursor: “list EvalOS issues”."
    });
  } catch (error) {
    return fromUnknownError(error);
  }
}

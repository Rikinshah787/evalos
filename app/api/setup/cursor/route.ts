import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { apiError, fromUnknownError } from "@/lib/validation/errors";

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
    hooksDir: join(root, ".cursor", "hooks"),
    hooksJson: join(root, ".cursor", "hooks.json"),
    captureScript: join(root, ".cursor", "hooks", "evalos-capture.mjs"),
    scriptSource: join(root, "scripts", "cursor-evalos-hook.mjs")
  };
}

export async function GET() {
  try {
    const { hooksJson, captureScript } = paths();
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
      events,
      targetPath: ".cursor/hooks.json",
      serverUrl: process.env.EVALOS_URL || "http://localhost:3001"
    });
  } catch (error) {
    return fromUnknownError(error);
  }
}

export async function POST() {
  try {
    const { hooksDir, hooksJson, captureScript, scriptSource } = paths();
    mkdirSync(hooksDir, { recursive: true });

    if (existsSync(scriptSource)) {
      copyFileSync(scriptSource, captureScript);
    } else if (!existsSync(captureScript)) {
      return apiError(404, "missing_hook_script", "Missing Cursor EvalOS hook script.");
    }

    writeFileSync(hooksJson, `${JSON.stringify(HOOKS_TEMPLATE, null, 2)}\n`, "utf8");

    return NextResponse.json({
      connected: true,
      targetPath: ".cursor/hooks.json",
      message: "Cursor hooks enabled. Keep EvalOS running, then continue this chat — stop/tool failures will appear in Inspect."
    });
  } catch (error) {
    return fromUnknownError(error);
  }
}

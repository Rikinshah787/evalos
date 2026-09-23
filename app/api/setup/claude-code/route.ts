import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { apiError, fromUnknownError } from "@/lib/validation/errors";

function settingsPaths() {
  const root = process.cwd();
  return {
    example: join(root, ".claude", "evalos.settings.example.json"),
    target: join(root, ".claude", "settings.json")
  };
}

export async function GET() {
  try {
    const { example, target } = settingsPaths();
    const exampleExists = existsSync(example);
    const connected = existsSync(target);
    let hookCommand: string | null = null;

    if (connected) {
      try {
        const raw = readFileSync(target, "utf8");
        const parsed = JSON.parse(raw) as {
          hooks?: { Stop?: Array<{ hooks?: Array<{ command?: string }> }> };
        };
        hookCommand = parsed.hooks?.Stop?.[0]?.hooks?.[0]?.command ?? null;
      } catch {
        hookCommand = null;
      }
    }

    return NextResponse.json({
      exampleExists,
      connected,
      hookCommand,
      serverUrl: process.env.EVALOS_URL || "http://localhost:3001",
      targetPath: ".claude/settings.json"
    });
  } catch (error) {
    return fromUnknownError(error);
  }
}

export async function POST() {
  try {
    const { example, target } = settingsPaths();
    if (!existsSync(example)) {
      return apiError(404, "missing_template", "Missing .claude/evalos.settings.example.json");
    }

    mkdirSync(join(process.cwd(), ".claude"), { recursive: true });
    copyFileSync(example, target);

    return NextResponse.json({
      connected: true,
      targetPath: ".claude/settings.json",
      message: "Claude Code hook enabled for this repository."
    });
  } catch (error) {
    return fromUnknownError(error);
  }
}

import { NextResponse } from "next/server";
import { ensureCursorAutoSetup } from "@/lib/auto-setup";
import { fromUnknownError } from "@/lib/validation/errors";

export async function GET() {
  try {
    const setup = ensureCursorAutoSetup();
    return NextResponse.json({
      connected: setup.connected,
      mcpConnected: setup.mcpConnected,
      autoSetup: true,
      changed: setup.changed,
      events: ["stop", "postToolUseFailure", "sessionEnd"],
      targetPath: setup.hooksPath,
      mcpPath: setup.mcpPath,
      serverUrl: setup.serverUrl,
      message: setup.message
    });
  } catch (error) {
    return fromUnknownError(error);
  }
}

export async function POST() {
  try {
    const setup = ensureCursorAutoSetup();
    return NextResponse.json({
      connected: setup.connected,
      mcpConnected: setup.mcpConnected,
      autoSetup: true,
      changed: setup.changed,
      targetPath: setup.hooksPath,
      mcpPath: setup.mcpPath,
      message: setup.message
    });
  } catch (error) {
    return fromUnknownError(error);
  }
}

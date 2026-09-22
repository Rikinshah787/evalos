#!/usr/bin/env node

import { readFileSync } from "node:fs";

const stdin = await readStdin();
const hook = parseJson(stdin, {});
const serverUrl = process.env.EVALOS_URL || "http://localhost:3001";
const transcriptPath = hook.transcript_path;
const transcript = transcriptPath ? readTranscript(transcriptPath) : [];
const run = buildRun(hook, transcript);

try {
  const response = await fetch(`${serverUrl}/api/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(run)
  });

  if (!response.ok) {
    console.error(`EvalOS ingest failed: ${response.status}`);
    process.exit(0);
  }

  console.log(JSON.stringify({ evalos: "ingested", runId: run.id }));
} catch (error) {
  console.error(`EvalOS is not reachable at ${serverUrl}: ${error instanceof Error ? error.message : "unknown error"}`);
}

function buildRun(hookInput, transcriptRows) {
  const sessionId = stringOr(hookInput.session_id, `claude-${Date.now()}`);
  const cwd = stringOr(hookInput.cwd, process.cwd());
  const userMessages = transcriptRows
    .filter((row) => row.type === "user" || row.role === "user")
    .map((row) => extractText(row))
    .filter(Boolean);
  const assistantMessages = transcriptRows
    .filter((row) => row.type === "assistant" || row.role === "assistant")
    .map((row) => extractText(row))
    .filter(Boolean);
  const toolRows = transcriptRows.filter((row) => row.tool_name || row.tool_use_id || row.type === "tool_result");
  const finalOutput = assistantMessages.at(-1) || stringOr(hookInput.message, "Claude Code session completed.");

  return {
    id: `claude_${sessionId}_${Date.now()}`,
    source: "json",
    agentName: "claude-code",
    framework: "claude-code",
    environment: "development",
    startedAt: new Date().toISOString(),
    input: [
      {
        role: "user",
        content: userMessages.at(-1) || `Claude Code session in ${cwd}`
      }
    ],
    steps: [
      {
        id: "session",
        type: "message",
        name: stringOr(hookInput.hook_event_name, "claude.session"),
        input: { cwd, transcriptPath: hookInput.transcript_path },
        output: `Transcript rows: ${transcriptRows.length}`
      },
      ...toolRows.slice(-20).map((row, index) => ({
        id: `tool_${index + 1}`,
        type: row.is_error ? "error" : "tool_call",
        name: stringOr(row.tool_name, stringOr(row.name, "claude.tool")),
        input: row.tool_input ?? row.input,
        output: row.content ?? row.output,
        error: row.is_error ? extractText(row) || "Claude Code tool error" : null
      }))
    ],
    finalOutput,
    sourceUrl: transcriptPath ? `file://${transcriptPath}` : undefined,
    metadata: {
      sessionId,
      cwd,
      hookEvent: stringOr(hookInput.hook_event_name, "unknown")
    }
  };
}

function readTranscript(path) {
  try {
    return readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => parseJson(line, null))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function extractText(row) {
  if (typeof row.content === "string") return row.content;
  if (Array.isArray(row.content)) {
    return row.content
      .map((item) => (typeof item === "string" ? item : item?.text || item?.content || ""))
      .filter(Boolean)
      .join("\n");
  }
  if (row.message) return extractText(row.message);
  return "";
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function stringOr(value, fallback) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
  });
}

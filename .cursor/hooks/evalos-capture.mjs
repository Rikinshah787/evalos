#!/usr/bin/env node

/**
 * Cursor → EvalOS capture hook.
 * On stop/sessionEnd: ingest the full live transcript.
 * On tool failure: also post a thin failure span (then try full transcript).
 */

const serverUrl = process.env.EVALOS_URL || "http://localhost:3000";

const stdin = await readStdin();
const payload = parseJson(stdin, {});
const eventName = stringOr(payload.hook_event_name, stringOr(payload.event, "stop"));
const isFailure = /failure|error/i.test(eventName) || Boolean(payload.error || payload.tool_error);
const wantsFullSession = /stop|sessionEnd|session_end/i.test(eventName);

try {
  if (wantsFullSession || isFailure) {
    const session = await ingestFullSession();
    if (session?.ok) {
      console.log(
        JSON.stringify({
          evalos: "session_ingested",
          runId: session.runId,
          steps: session.steps,
          outcome: session.outcome,
          source: "cursor-transcript"
        })
      );
      process.exit(0);
    }
  }

  const run = buildRun(payload, eventName, isFailure);
  const response = await fetch(`${serverUrl}/api/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(run)
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`EvalOS ingest failed: ${response.status} ${body}`);
    process.exit(0);
  }

  console.log(JSON.stringify({ evalos: "ingested", runId: run.id, source: "cursor-hook" }));
} catch (error) {
  console.error(
    `EvalOS is not reachable at ${serverUrl}: ${error instanceof Error ? error.message : "unknown error"}`
  );
}

async function ingestFullSession() {
  try {
    const response = await fetch(`${serverUrl}/api/setup/cursor/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ replace: false })
    });
    if (!response.ok) return null;
    const body = await response.json();
    return {
      ok: true,
      runId: body.runId,
      steps: body.steps,
      outcome: body.outcome
    };
  } catch {
    return null;
  }
}

function buildRun(hookInput, eventName, isFailure) {
  const sessionId = stringOr(
    hookInput.session_id,
    stringOr(hookInput.conversation_id, `cursor-${Date.now()}`)
  );
  const cwd = stringOr(hookInput.cwd, stringOr(hookInput.workspace_roots?.[0], process.cwd()));
  const toolName = stringOr(
    hookInput.tool_name,
    stringOr(hookInput.toolName, stringOr(hookInput.tool?.name, "cursor.tool"))
  );
  const toolError =
    stringOr(hookInput.error, stringOr(hookInput.tool_error, stringOr(hookInput.message, ""))) ||
    (isFailure ? `${toolName} failed` : null);
  const userPrompt = stringOr(
    hookInput.prompt,
    stringOr(hookInput.user_message, stringOr(hookInput.message, `Cursor agent session in ${cwd}`))
  );
  const finalOutput = stringOr(
    hookInput.agent_message,
    stringOr(
      hookInput.response,
      isFailure ? `Tool failure during Cursor session: ${toolName}` : "Cursor agent session completed."
    )
  );

  const steps = [
    {
      id: "cursor_session",
      type: "message",
      name: eventName,
      input: {
        cwd,
        eventName,
        conversationId: sessionId
      },
      output: `Cursor hook event: ${eventName}`
    }
  ];

  if (toolName !== "cursor.tool" || toolError) {
    steps.push({
      id: "cursor_tool_1",
      type: toolError ? "error" : "tool_call",
      name: toolName,
      input: hookInput.tool_input ?? hookInput.input ?? hookInput.args ?? undefined,
      output: hookInput.tool_output ?? hookInput.output ?? undefined,
      error: toolError
    });
  }

  return {
    id: `cursor_${sessionId}_${Date.now()}`,
    source: "json",
    agentName: "cursor",
    framework: "cursor",
    environment: "development",
    startedAt: new Date().toISOString(),
    model: stringOr(hookInput.model, "cursor-agent"),
    input: [{ role: "user", content: userPrompt }],
    steps,
    finalOutput,
    metadata: {
      sessionId,
      cwd,
      hookEvent: eventName,
      connector: "cursor"
    }
  };
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

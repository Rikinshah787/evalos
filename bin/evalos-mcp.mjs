#!/usr/bin/env node

/**
 * Minimal EvalOS MCP server (stdio JSON-RPC).
 * Lets Cursor ask: list issues, get evidence, import session, confirm.
 */

import { createInterface } from "node:readline";

const serverUrl = process.env.EVALOS_URL || "http://localhost:3000";

const tools = [
  {
    name: "evalos_list_issues",
    description: "List open EvalOS agent failure issues waiting for Confirm/Reject.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "evalos_get_issue",
    description: "Get one EvalOS run with evidence and suggested assertion.",
    inputSchema: {
      type: "object",
      properties: { runId: { type: "string" } },
      required: ["runId"],
      additionalProperties: false
    }
  },
  {
    name: "evalos_import_session",
    description: "Import the current Cursor chat transcript into EvalOS.",
    inputSchema: {
      type: "object",
      properties: { replace: { type: "boolean" } },
      additionalProperties: false
    }
  },
  {
    name: "evalos_confirm",
    description: "Confirm an issue as a durable regression case (writes evals/cases/*.json).",
    inputSchema: {
      type: "object",
      properties: {
        runId: { type: "string" },
        expectedBehavior: { type: "string" }
      },
      required: ["runId"],
      additionalProperties: false
    }
  },
  {
    name: "evalos_watch",
    description: "Score live runs against confirmed evals/cases (regressed / clear / watching).",
    inputSchema: {
      type: "object",
      properties: { runId: { type: "string" } },
      additionalProperties: false
    }
  }
];

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    return;
  }

  if (message.method === "notifications/initialized" || message.method === "notifications/cancelled") {
    return;
  }

  if (!message.id && message.method?.startsWith("notifications/")) return;

  try {
    const result = await handle(message);
    if (message.id !== undefined) {
      write({ jsonrpc: "2.0", id: message.id, result });
    }
  } catch (error) {
    if (message.id !== undefined) {
      write({
        jsonrpc: "2.0",
        id: message.id,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : "EvalOS MCP error"
        }
      });
    }
  }
});

async function handle(message) {
  if (message.method === "initialize") {
    return {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "evalos", version: "0.2.0" }
    };
  }

  if (message.method === "tools/list") {
    return { tools };
  }

  if (message.method === "tools/call") {
    const name = message.params?.name;
    const args = message.params?.arguments ?? {};
    const text = await callTool(name, args);
    return { content: [{ type: "text", text }] };
  }

  if (message.method === "ping") {
    return {};
  }

  throw new Error(`Unsupported method: ${message.method}`);
}

async function callTool(name, args) {
  if (name === "evalos_list_issues") {
    const data = await getJson("/api/issues");
    return JSON.stringify(data, null, 2);
  }

  if (name === "evalos_get_issue") {
    const data = await getJson("/api/issues");
    const issue = (data.issues ?? []).find((item) => item.runId === args.runId);
    if (!issue) throw new Error(`Issue not found: ${args.runId}`);
    return JSON.stringify(issue, null, 2);
  }

  if (name === "evalos_import_session") {
    const response = await fetch(`${serverUrl}/api/setup/cursor/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ replace: args.replace !== false })
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message || "Import failed");
    return JSON.stringify(body, null, 2);
  }

  if (name === "evalos_confirm") {
    const issues = await getJson("/api/issues");
    const issue = (issues.issues ?? []).find((item) => item.runId === args.runId);
    if (!issue) throw new Error(`Issue not found: ${args.runId}`);

    const response = await fetch(`${serverUrl}/api/reviews`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId: args.runId,
        status: "confirmed",
        category: issue.failureType,
        expectedBehavior: args.expectedBehavior || issue.expectedBehavior,
        reviewer: "cursor-mcp"
      })
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message || "Confirm failed");
    return JSON.stringify(body, null, 2);
  }

  if (name === "evalos_watch") {
    const path = args.runId ? `/api/watch?runId=${encodeURIComponent(args.runId)}` : "/api/watch";
    const data = await getJson(path);
    return JSON.stringify(data, null, 2);
  }

  throw new Error(`Unknown tool: ${name}`);
}

async function getJson(path) {
  const response = await fetch(`${serverUrl}${path}`, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || `GET ${path} failed`);
  return body;
}

function write(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

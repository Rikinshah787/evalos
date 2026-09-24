#!/usr/bin/env node

/**
 * Magic capture — no per-vendor importers.
 *
 *   npx evalos proxy
 *   OPENAI_BASE_URL=http://127.0.0.1:8787/v1
 *
 * All Responses / Chat Completions traffic is forwarded upstream and
 * fire-and-forget ingested into EvalOS. Confirm → cases → CI stays the same.
 */

import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

const PORT = Number(process.env.EVALOS_PROXY_PORT || 8787);
const EVALOS_URL = (process.env.EVALOS_URL || "http://localhost:3000").replace(/\/$/, "");
const OPENAI_UPSTREAM = process.env.OPENAI_UPSTREAM || "https://api.openai.com";
const ANTHROPIC_UPSTREAM = process.env.ANTHROPIC_UPSTREAM || "https://api.anthropic.com";

const server = http.createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);

    const hostHeader = String(req.headers["x-evalos-upstream"] || "");
    const path = req.url || "/";
    const upstreamBase = pickUpstream(path, hostHeader);
    const upstreamUrl = new URL(path, upstreamBase);

    const headers = { ...req.headers, host: upstreamUrl.host };
    delete headers["content-length"];

    const upstreamBody = await forward(upstreamUrl, req.method || "POST", headers, body);

    res.writeHead(upstreamBody.status, {
      "content-type": upstreamBody.contentType || "application/json",
      "access-control-allow-origin": "*"
    });
    res.end(upstreamBody.buffer);

    // Capture after response so the agent is never blocked by EvalOS.
    void capture(path, body, upstreamBody.buffer, upstreamBody.status).catch(() => {});
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "evalos_proxy_error", message }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`EvalOS proxy on http://127.0.0.1:${PORT}`);
  console.log(`Ingest → ${EVALOS_URL}/api/runs`);
  console.log("");
  console.log("Magic setup (pick one):");
  console.log(`  set OPENAI_BASE_URL=http://127.0.0.1:${PORT}/v1`);
  console.log(`  set ANTHROPIC_BASE_URL=http://127.0.0.1:${PORT}`);
  console.log("");
  console.log("Keep EvalOS UI running: npm run dev");
  console.log("Then Inspect → Confirm → evals/cases → npm run gate");
});

function pickUpstream(path, hostHeader) {
  if (hostHeader.includes("anthropic")) return ANTHROPIC_UPSTREAM;
  if (path.includes("/v1/messages") || path.includes("anthropic")) return ANTHROPIC_UPSTREAM;
  return OPENAI_UPSTREAM;
}

function forward(url, method, headers, body) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      url,
      {
        method,
        headers
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode || 502,
            contentType: res.headers["content-type"],
            buffer: Buffer.concat(chunks)
          });
        });
      }
    );
    req.on("error", reject);
    if (body.length) req.write(body);
    req.end();
  });
}

async function capture(path, requestBuf, responseBuf, status) {
  if (!/responses|chat\/completions|messages/i.test(path)) return;
  if (status >= 500) return;

  let requestJson = {};
  let responseJson = {};
  try {
    requestJson = JSON.parse(requestBuf.toString("utf8") || "{}");
  } catch {
    requestJson = {};
  }
  try {
    responseJson = JSON.parse(responseBuf.toString("utf8") || "{}");
  } catch {
    responseJson = {};
  }

  const run = toRun(path, requestJson, responseJson, status);
  await fetch(`${EVALOS_URL}/api/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(run)
  });
}

function toRun(path, requestJson, responseJson, status) {
  const id =
    (typeof responseJson.id === "string" && responseJson.id) ||
    `proxy_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const inputText = extractInput(requestJson);
  const outputText = extractOutput(responseJson);
  const toolSteps = extractTools(requestJson, responseJson);
  const error =
    status >= 400
      ? `HTTP ${status}`
      : typeof responseJson.error === "object" && responseJson.error?.message
        ? String(responseJson.error.message)
        : null;

  const steps = [...toolSteps];
  if (error) {
    steps.push({
      id: `${id}_error`,
      type: "error",
      name: "api.error",
      error
    });
  }
  if (outputText) {
    steps.push({
      id: `${id}_out`,
      type: "message",
      name: "assistant",
      output: outputText.slice(0, 4000)
    });
  }

  return {
    id,
    source: "json",
    agentName: "proxy-agent",
    framework: path.includes("messages") ? "anthropic" : "openai",
    environment: "development",
    startedAt: new Date().toISOString(),
    model: requestJson.model || responseJson.model,
    input: [{ role: "user", content: inputText || "proxied request" }],
    steps,
    finalOutput: outputText || error || "",
    metadata: {
      capture: "evalos-proxy",
      path,
      status
    }
  };
}

function extractInput(req) {
  if (typeof req.input === "string") return req.input;
  if (Array.isArray(req.input)) return flattenContent(req.input);
  if (Array.isArray(req.messages)) return flattenContent(req.messages);
  return "";
}

function extractOutput(res) {
  if (typeof res.output_text === "string") return res.output_text;
  if (Array.isArray(res.output)) return flattenContent(res.output);
  if (Array.isArray(res.choices) && res.choices[0]?.message?.content) {
    return String(res.choices[0].message.content);
  }
  if (Array.isArray(res.content)) return flattenContent(res.content);
  return "";
}

function extractTools(req, res) {
  const steps = [];
  const outputs = Array.isArray(res.output) ? res.output : [];
  for (const [i, item] of outputs.entries()) {
    if (!item || typeof item !== "object") continue;
    if (item.type === "function_call" || item.type === "tool_use") {
      const name = item.name || "tool";
      const args = item.arguments || item.input;
      steps.push({
        id: `tool_${i}`,
        type: "tool_call",
        name,
        input: typeof args === "string" ? tryJson(args) : args
      });
    }
  }
  // Tool results often sit in the next request's messages — mark stderr-like content.
  const blob = JSON.stringify(req).slice(0, 8000);
  if (/is not recognized|command not found|\[rejected\]|fatal:|ENOENT/i.test(blob)) {
    const match = blob.match(/is not recognized[^"\\]*|command not found[^"\\]*|\[rejected\][^"\\]*|fatal:[^"\\]*|ENOENT[^"\\]*/i);
    steps.push({
      id: "tool_stderr",
      type: "error",
      name: "shell",
      error: (match?.[0] || "tool failure").slice(0, 400)
    });
  }
  return steps;
}

function flattenContent(items) {
  return items
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      if (typeof item.content === "string") return item.content;
      if (typeof item.text === "string") return item.text;
      if (Array.isArray(item.content)) {
        return item.content.map((p) => (p && p.text) || "").join("");
      }
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000);
}

function tryJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { attachConversationSignals } from "./conversation-signals";
import type { AgentMessage, AgentRun, AgentRunStep } from "./types";

type TranscriptRow = {
  role?: string;
  type?: string;
  message?: {
    content?: unknown;
  };
  content?: unknown;
};

const MAX_STEP_CHARS = 1200;
const MAX_STEPS = 400;
const MAX_USER_TURNS = 40;

export function resolveCursorTranscriptPath(cwd = process.cwd()): string | null {
  if (process.env.EVALOS_CURSOR_TRANSCRIPT && existsSync(process.env.EVALOS_CURSOR_TRANSCRIPT)) {
    return process.env.EVALOS_CURSOR_TRANSCRIPT;
  }

  const home = process.env.USERPROFILE || process.env.HOME || "";
  const candidates = [
    join(home, ".cursor", "projects", "c-Users-rikin-Documents-ChatGPT-Rikin", "agent-transcripts"),
    join(home, ".cursor", "projects", cwd.replace(/[:\\/]+/g, "-").replace(/^-/, ""), "agent-transcripts")
  ];

  for (const root of candidates) {
    if (!existsSync(root)) continue;
    const newest = findNewestJsonl(root);
    if (newest) return newest;
  }

  return null;
}

export function parseCursorTranscript(
  raw: string,
  options?: { conversationId?: string; transcriptPath?: string }
): AgentRun {
  const rows = raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as TranscriptRow;
      } catch {
        return null;
      }
    })
    .filter((row): row is TranscriptRow => Boolean(row));

  const conversationId = options?.conversationId || "cursor-session";
  const traceId = `trace_${conversationId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 36)}`;
  const input: AgentMessage[] = [];
  const steps: AgentRunStep[] = [];
  let stepIndex = 0;
  let lastAssistant = "";
  let parentSpan: string | undefined;
  let startedAt: string | undefined;

  for (const row of rows) {
    const role = row.role || row.type;
    const content = row.message?.content ?? row.content;
    const rowTime = extractTimestamp(row);

    if (role === "user") {
      const text = extractText(content);
      if (text) {
        input.push({
          role: "user",
          content: truncate(stripTags(text), 4000),
          timestamp: rowTime
        });
        if (!startedAt && rowTime) startedAt = rowTime;
      }
      continue;
    }

    if (role !== "assistant") continue;

    const blocks = Array.isArray(content) ? content : [];
    for (const block of blocks) {
      if (!block || typeof block !== "object") continue;
      const item = block as Record<string, unknown>;

      if (item.type === "text" && typeof item.text === "string") {
        lastAssistant = item.text;
        const spanId = `span_msg_${++stepIndex}`;
        steps.push({
          id: `msg_${stepIndex}`,
          traceId,
          spanId,
          parentSpanId: parentSpan,
          type: "message",
          name: "assistant.response",
          output: truncate(item.text, MAX_STEP_CHARS),
          startedAt: rowTime
        });
        parentSpan = spanId;
        continue;
      }

      if (item.type === "tool_use") {
        const toolName = String(item.name || "tool");
        const isError = Boolean(item.is_error || item.error);
        const spanId = `span_tool_${++stepIndex}`;
        steps.push({
          id: `tool_${stepIndex}`,
          traceId,
          spanId,
          parentSpanId: parentSpan,
          type: isError ? "error" : "tool_call",
          name: toolName,
          input: sanitize(item.input ?? item.arguments),
          output: sanitize(item.output ?? item.result),
          error: isError ? truncate(String(item.error || item.message || `${toolName} failed`), 500) : null,
          startedAt: rowTime,
          metadata: {
            toolCallId: typeof item.id === "string" ? item.id : null
          }
        });
        parentSpan = spanId;
      }
    }
  }

  const deduped = dedupeSteps(steps).slice(0, MAX_STEPS);
  const uniqueInput = uniqueMessages(input).slice(-MAX_USER_TURNS);
  const firstUser = uniqueInput[0]?.content || "Cursor agent session";
  const latencyMs = estimateLatencyMs(uniqueInput, deduped, startedAt);

  const run: AgentRun = {
    id: `cursor_${conversationId}`,
    source: "json",
    agentName: "cursor",
    framework: "cursor",
    environment: "development",
    startedAt: startedAt || new Date().toISOString(),
    model: "cursor-agent",
    promptVersion: "live-session",
    input: uniqueInput.length > 0 ? uniqueInput : [{ role: "user", content: firstUser }],
    steps: deduped,
    finalOutput: truncate(stripTags(lastAssistant) || "Cursor session captured.", 4000),
    sourceUrl: options?.transcriptPath ? `file://${options.transcriptPath}` : undefined,
    latencyMs,
    metadata: {
      connector: "cursor",
      conversationId,
      transcriptRows: rows.length,
      stepCount: deduped.length,
      userTurns: uniqueInput.length
    }
  };

  return attachConversationSignals(run);
}

export function loadCursorSessionRun(transcriptPath?: string): AgentRun {
  const path = transcriptPath || resolveCursorTranscriptPath();
  if (!path) {
    throw new Error("No Cursor agent transcript found for this workspace.");
  }

  const parts = path.split(/[/\\]/);
  const conversationId = parts[parts.length - 2] || "cursor-session";
  const raw = readFileSync(path, "utf8");
  return parseCursorTranscript(raw, { conversationId, transcriptPath: path });
}

function findNewestJsonl(root: string): string | null {
  let best: { path: string; mtime: number } | null = null;

  for (const entry of readdirSync(root)) {
    const dir = join(root, entry);
    try {
      if (!statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    const file = join(dir, `${entry}.jsonl`);
    if (!existsSync(file)) continue;
    const mtime = statSync(file).mtimeMs;
    if (!best || mtime > best.mtime) best = { path: file, mtime };
  }

  return best?.path ?? null;
}

function extractTimestamp(row: TranscriptRow): string | undefined {
  const record = row as Record<string, unknown>;
  for (const key of ["timestamp", "createdAt", "created_at", "time"]) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
    if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
  }
  return undefined;
}

function estimateLatencyMs(input: AgentMessage[], steps: AgentRunStep[], startedAt?: string) {
  const fromSteps = steps.reduce((sum, step) => sum + (step.durationMs ?? 0), 0);
  if (fromSteps > 0) return fromSteps;
  const times = [...input.map((item) => item.timestamp), ...steps.map((step) => step.startedAt), startedAt]
    .filter((value): value is string => Boolean(value))
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value));
  if (times.length >= 2) {
    return Math.max(1, Math.max(...times) - Math.min(...times));
  }
  return Math.max(steps.length * 40, 1);
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && typeof (item as { text?: string }).text === "string") {
        return (item as { text: string }).text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function stripTags(value: string) {
  return value
    .replace(/<\/?[a-zA-Z][^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function sanitize(value: unknown) {
  if (value == null) return value;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return truncate(text, MAX_STEP_CHARS);
}

function uniqueMessages(messages: AgentMessage[]) {
  const seen = new Set<string>();
  const out: AgentMessage[] = [];
  for (const message of messages) {
    const key = `${message.role}:${message.content.slice(0, 200)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(message);
  }
  return out;
}

function dedupeSteps(steps: AgentRunStep[]) {
  const out: AgentRunStep[] = [];
  for (const step of steps) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.type === step.type &&
      prev.name === step.name &&
      JSON.stringify(prev.input) === JSON.stringify(step.input) &&
      JSON.stringify(prev.output) === JSON.stringify(step.output) &&
      prev.error === step.error
    ) {
      continue;
    }
    out.push(step);
  }
  return out;
}

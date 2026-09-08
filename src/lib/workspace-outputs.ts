import type { MessageEvent } from "../types/memex";
import { getAgentRuntime } from "./runtime-urls";

export interface WorkspaceOutput {
  name: string;
  html?: string;
  url?: string;
  downloadUrl?: string;
  mimeType?: string;
  path?: string;
}

export const outputEventTypes = ["design_artifact", "artifact", "media_attachment"];

/** The user-facing channel for a runtime event. These are deliberately not
 * backend event types: a worker update can be progress, an intent, or an
 * issue depending on what it says. */
export type ActivityTone = "intent" | "tool" | "progress" | "issue";

export interface ActivityPresentation {
  tone: ActivityTone;
  title: string;
  detail?: string;
  command?: string;
  actor?: string;
}

/**
 * Runtime messages are intentionally rich for logs, but they are not product
 * copy.  Keep the conversation activity surface calm and consistent across
 * Chat and Code, including sessions saved before this presentation layer.
 */
export function activityLabel(value: string): string {
  const clean = value
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, "")
    .replace(/^[\s→•·|:-]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  const lower = clean.toLowerCase();
  if (!clean) return "Working";
  if (/request sent|preparing memex/.test(lower)) return "Preparing request";
  if (/input cleared/.test(lower)) return "Request checked";
  if (/security agent:.*(scann|validat|check)|security:\s*pass/.test(lower)) return lower.includes("pass") || lower.includes("clear") ? "Request approved" : "Checking request";
  if (/neural cortex|analyzing intent|routing request/.test(lower)) return "Choosing approach";
  if (/hive mind.*think|thinking/.test(lower)) return "Thinking";
  if (/design studio:.*(activat|prepar)/.test(lower)) return "Preparing design";
  if (/design studio:.*setting up/.test(lower)) return "Setting up design";
  if (/design studio:.*ready to generate/.test(lower)) return "Design model ready";
  if (/design studio:.*generating/.test(lower)) return "Generating design";
  if (/design studio:.*wait|waiting for.*gpu/.test(lower)) return "Waiting for model";
  if (/first token|model connected/.test(lower)) return "Generating";
  if (/generated .*output tokens/.test(lower)) return clean.replace(/^.*?:\s*/, "");
  if (/validating.*html|validating.*output/.test(lower)) return "Validating output";
  if (/saving.*(html|output|artifact)/.test(lower)) return "Saving output";
  if (/research mode:.*activat|librarian agent|grounding.*web/.test(lower)) return "Researching";
  if (/coordinator.*(launch|start)|starting.*code/.test(lower)) return "Starting code task";
  if (/architect.*(plan|design)|implementation plan/.test(lower)) return "Planning implementation";
  if (/devops.*(environment|check)|checking out/.test(lower)) return "Preparing workspace";
  if (/runtime is still waiting|since the last server update/.test(lower)) return "Waiting for update";
  if (/conversation \(\d+% confidence\)|turn complete/.test(lower)) return "Ready";
  return clean.replace(/^(?:[A-Za-z][A-Za-z ]{1,40}):\s*/, "");
}

/** Remove decorative runtime glyphs even from expandable technical details. */
export function sanitizeActivityText(value: string): string {
  return value.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, "");
}

/**
 * Detailed mode is a work trace, not a dump of private model reasoning.  Keep
 * durable runtime decisions readable, and summarize unstructured thought
 * chunks without exposing a model's scratchpad.
 */
export function activityDetail(value: string, type: MessageEvent["type"]): string {
  const clean = activityLabel(value);
  const lower = sanitizeActivityText(value).trim().toLowerCase();
  if (/router started this turn/.test(lower)) return "Router started";
  if (/jwt-ace.*(session|scope)/.test(lower)) return "Session prepared";
  if (/security analysis/.test(lower)) return "Safety check completed";
  if (/librarian started this turn/.test(lower)) return "Research agent started";
  if (/memex started this turn/.test(lower)) return "Response agent started";
  if (/forcing research intent|research \(\d+% confidence\)/.test(lower)) return "Research route selected";
  if (/model queue status/.test(lower)) return "Model queue updated";
  if (/response stream ended/.test(lower)) return "Response complete";
  if (/\[research\].*completed query/.test(lower)) return "Research complete";
  if (/\[turn .* completed\]/.test(lower)) return "Turn complete";
  if (/^responding\.?$/.test(lower)) return "Streaming response";
  if (/^requesting\.?$/.test(lower)) return "Starting request";
  if (/^ready\.?$/.test(lower)) return "Ready";
  if (type === "thought") {
    if (/phase \d|routing to |hive fast|marsrl|verifier|compliance|multi-faceted/.test(lower)) return clean;
    return "Considering response";
  }
  if (type === "log") return "Runtime update";
  return clean;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = sanitizeActivityText(value).replace(/\s+/g, " ").trim();
  return clean || undefined;
}

function toolDetail(data: Record<string, unknown>): string | undefined {
  const input = data.tool_input ?? data.input ?? data.arguments ?? data.command ?? data.result ?? data.output;
  if (typeof input === "string") return text(input);
  if (input && typeof input === "object") {
    const values = record(input);
    return text(values.command) ?? text(values.path) ?? text(values.query) ?? text(values.content) ?? text(values.output);
  }
  return undefined;
}

/**
 * Turn a protocol event into an intentionally legible work trace. We never
 * display private model scratchpad: `thought` events are runtime-provided
 * summaries and retain their original, user-safe wording.
 */
export function activityPresentation(event: MessageEvent): ActivityPresentation {
  const data = record(event.data);
  const rawType = String(data.type ?? event.type);
  const eventType = String(data.event_type ?? data.kind ?? "");
  const actor = text(event.pioneer_name ?? event.agent_name ?? data.pioneer_name ?? data.agent_name ?? data.role);
  const body = text(event.content) ?? "Working";
  const isTool = event.type === "tool_call_start" || event.type === "tool_call_result" || rawType === "tool_start" || rawType === "tool_result" || eventType === "tool_use" || eventType === "tool_result";
  if (isTool) {
    const name = text(data.tool_name ?? data.name ?? data.tool ?? actor) ?? "Command";
    const detail = toolDetail(data) ?? (body !== name ? body : undefined);
    return { tone: "tool", title: event.type === "tool_call_result" || rawType === "tool_result" ? `${name} completed` : `Running ${name}`, detail, command: detail, actor };
  }
  if (event.type === "thought" || eventType === "thought" || rawType === "thinking") {
    const detail = activityDetail(body, "thought");
    return { tone: "intent", title: actor ? `${actor} is assessing the task` : "Thinking", detail, actor };
  }
  const failed = rawType === "error" || eventType === "error" || /^error:/i.test(body) || /\b(failed|blocked|unavailable|denied)\b/i.test(body);
  if (failed) return { tone: "issue", title: "Attention needed", detail: body.replace(/^error:\s*/i, ""), actor };
  const title = activityDetail(body, event.type);
  const detail = title === body ? undefined : body;
  return { tone: "progress", title, detail, actor };
}
export function safeOutputUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^\/(?!\/)/.test(value) && !/[\\\s]/.test(value)) {
    return getAgentRuntime() + value.replace(/^\/api\/backend(?=\/)/, "");
  }
  return undefined;
}

/** Recover the original structured payload, including sessions stored as legacy logs. */
export function outputsFromEvents(events: MessageEvent[]): WorkspaceOutput[] {
  return events.flatMap((event) => {
    const type = String(event.data?.type ?? event.type);
    if (!outputEventTypes.includes(type)) return [];
    let payload: unknown = event.data?.content;
    if (!payload || typeof payload !== "object") {
      try { payload = JSON.parse(event.content); } catch { return []; }
    }
    if (!payload || typeof payload !== "object") return [];
    const item = payload as Record<string, unknown>;
    return [{
      name: String(item.filename ?? item.name ?? "Generated output").replace(/[\\/]/g, "_"),
      html: typeof item.html === "string" ? item.html : undefined,
      url: safeOutputUrl(item.url) ?? safeOutputUrl(item.downloadUrl),
      downloadUrl: safeOutputUrl(item.downloadUrl),
      mimeType: typeof item.mimeType === "string" ? item.mimeType : undefined,
      path: typeof item.path === "string" ? item.path : undefined,
    }];
  });
}

export function activityEvents(events: MessageEvent[], detailed: boolean): MessageEvent[] {
  const result: MessageEvent[] = [];
  const progressPositions = new Map<string, number>();
  for (const event of events) {
    const rawType = String(event.data?.type ?? event.type);
    if (outputEventTypes.includes(rawType) || ["message", "response", "clarification_card"].includes(event.type)) continue;
    if (["workshop_questions", "workflow_next_steps"].includes(rawType)) continue;
    if (!detailed && (["stream_mode", "turn_metadata"].includes(rawType) || event.type === "log")) continue;
    if (!detailed && /^(Runtime is still waiting|Stream mode:|Model queue status received)/.test(event.content)) continue;
    if (!detailed && /Generating HTML —|since the last server update/.test(event.content)) {
      const key = event.content.split("—")[0];
      const position = progressPositions.get(key);
      if (position !== undefined) { result[position] = event; continue; }
      progressPositions.set(key, result.length);
    }
    if (result.at(-1)?.content === event.content) continue;
    result.push(event);
  }
  return result;
}

export function errorEvents(events: MessageEvent[]): MessageEvent[] {
  return events.filter((event) => event.data?.type === "error" || /^Error:/.test(event.content));
}

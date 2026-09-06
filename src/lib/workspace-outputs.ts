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

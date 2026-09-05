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

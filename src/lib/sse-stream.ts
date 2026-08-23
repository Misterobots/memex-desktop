import { getAgentRuntime } from "./runtime-urls";
import { desktop }         from "./desktop";
import type { EventType, MemexMode, TokenUsage, ClarificationCard } from "../types/memex";

export interface SSEEvent {
  type: EventType;
  content: string;
  agent_name?: string;
  pioneer_name?: string;
  /** Structured payload for clarification_card events (rides outside `content`). */
  clarification?: ClarificationCard;
  /** Full raw delta for rich (non-text) events — lets new structured event types
   *  reach the UI without a parser change. Undefined for plain text tokens. */
  data?: Record<string, unknown>;
}

export interface StreamOptions {
  messages: Array<{ role: string; content: string }>;
  mode: MemexMode;
  modeFlags: Record<string, boolean>;
  /** Ollama model id to route to (e.g. "qwen3-coder:30b"). Defaults to "swarm". */
  model?: string;
  sessionId?: string;
  alreadySteered?: boolean;
  /** Resume a server-side DevHarness checkpoint after explicit tool replay. */
  devResume?: boolean;
  /** If provided, a RunRecord will be opened and closed around the stream. */
  runMeta?: { profile: string };
  /** Called as soon as the run record is created, with its ID. */
  onRunStarted?: (runId: string) => void;
  onEvent: (event: SSEEvent) => void;
  /** Token usage for the turn (OpenAI-style, arrives at end of stream). */
  onUsage?: (usage: TokenUsage) => void;
  onDone: () => void;
  onError: (err: Error) => void;
}

/** Translate runtime-specific event names into the renderer's stable contract. */
export function normalizeSSEDelta(delta: Record<string, unknown>): SSEEvent | null {
  const rawType = typeof delta.type === "string" ? delta.type : "message";
  const typeMap: Record<string, EventType> = {
    content: "message", error: "log", tool_start: "tool_call_start",
    tool_approval_needed: "status", tool_result: "tool_call_result",
    file_change: "agent_event", todo: "status", approval_requested: "status",
    approval_granted: "status", approval_denied: "status", continuation: "status",
  };
  const knownTypes: EventType[] = ["message", "status", "thought", "response", "log", "agent_event", "clarification_card", "tool_call_start", "tool_call_result"];
  const eventType = typeMap[rawType] ?? (knownTypes.includes(rawType as EventType) ? rawType as EventType : "log");
  const rawContent = delta.content;
  const content = typeof rawContent === "string" ? rawContent : rawType === "todo" ? "Updated task plan." : rawType === "file_change" ? "Proposed file changes." : JSON.stringify(rawContent ?? {});
  return {
    type: eventType,
    content,
    agent_name: typeof delta.agent_name === "string" ? delta.agent_name : undefined,
    pioneer_name: typeof delta.pioneer_name === "string" ? delta.pioneer_name : undefined,
    clarification: delta.clarification as SSEEvent["clarification"],
    data: eventType === "message" || eventType === "response" ? undefined : delta,
  };
}
export function streamChat(opts: StreamOptions): () => void {
  const controller = new AbortController();
  const bridge     = desktop();
  let runId: string | undefined;

  // Open a run record if the bridge is available
  if (bridge?.runs && opts.runMeta) {
    const userMsg = [...opts.messages].reverse().find((m: { role: string; content: string }) => m.role === "user")?.content ?? "";
    bridge.runs.start({
      sessionId: opts.sessionId ?? "default",
      mode:      opts.mode,
      model:     opts.model ?? "swarm",
      profile:   opts.runMeta.profile,
      message:   userMsg.slice(0, 200),
    }).then((r) => {
      runId = r?.id;
      if (runId) opts.onRunStarted?.(runId);
    });
  }

  const body = JSON.stringify({
    model: opts.model || "swarm",
    messages: opts.messages,
    stream: true,
    session_id: opts.sessionId ?? "default_session",
    already_steered: opts.alreadySteered ?? false,
    dev_resume: opts.devResume ?? false,
    ...opts.modeFlags,
  });

  const consumeChunk = async (value: Uint8Array) => {
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (!data || data === "[DONE]") continue;

      try {
        const chunk = JSON.parse(data);
        if (chunk.usage) {
          opts.onUsage?.({
            promptTokens: chunk.usage.prompt_tokens ?? 0,
            completionTokens: chunk.usage.completion_tokens ?? 0,
            totalTokens: chunk.usage.total_tokens ?? 0,
          });
        }
        const delta = chunk?.choices?.[0]?.delta;
        if (!delta || (!delta.type && !delta.content)) continue;
        const rawType = (delta.type as string) ?? "message";

        if (rawType === "memory_write" && bridge) {
          const policy = await bridge.workspace.getPolicy();
          if (policy.mode === "ask") {
            const { approved } = await bridge.permissions.request({
              toolName: "memory_write",
              toolInput: { content: String(delta.content).slice(0, 100) },
              callId: `mw-${Date.now()}`,
            });
            if (!approved) continue;
          }
        }
        const normalized = normalizeSSEDelta(delta as Record<string, unknown>);
        if (normalized) opts.onEvent(normalized);

      } catch {}
    }
  };
  const decoder = new TextDecoder();
  let buf = "";

  // Electron streaming must stay in the authenticated native process. The
  // browser build retains ordinary fetch against its same-origin proxy.
  if (bridge?.api) {
    const streamId = `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let status = 0;
    let failureDetail = "";
    const cancel = bridge.api.stream(streamId, {
      url: `${getAgentRuntime()}/v1/chat/completions`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }, (event) => {
      if (event.kind === "response") {
        const response = event.value as { status?: number; detail?: string };
        status = Number(response?.status ?? 0);
        failureDetail = response?.detail ?? "";
      } else if (event.kind === "chunk") {
        void consumeChunk(new Uint8Array(event.value as ArrayBufferLike));
      } else if (event.kind === "done") {
        if (status < 200 || status >= 300) {
          const detail = failureDetail ? `: ${failureDetail.slice(0, 500)}` : "";
          opts.onError(new Error(`agent_runtime returned ${status}${detail}`));
        }
        else { if (runId) bridge.runs?.end(runId, "done"); opts.onDone(); }
      } else if (event.kind === "error") {
        if (runId) bridge.runs?.end(runId, "error");
        opts.onError(new Error(String(event.value ?? "Stream failed")));
      }
    });
    return () => { cancel(); if (runId) bridge.runs?.end(runId, "cancelled"); };
  }

  fetch(`${getAgentRuntime()}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        throw new Error(`agent_runtime returned ${res.status}`);
      }

      const reader = res.body!.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await consumeChunk(value);
      }

      if (runId) bridge?.runs?.end(runId, "done");
      opts.onDone();
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        if (runId) bridge?.runs?.end(runId, "error");
        opts.onError(err);
      } else {
        if (runId) bridge?.runs?.end(runId, "cancelled");
      }
    });

  return () => controller.abort();
}

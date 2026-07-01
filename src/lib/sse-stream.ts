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
    ...opts.modeFlags,
  });

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
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (!data || data === "[DONE]") continue;

          try {
            const chunk = JSON.parse(data);

            // Token usage rides at the top level (OpenAI-style), not in delta.
            if (chunk.usage) {
              opts.onUsage?.({
                promptTokens:     chunk.usage.prompt_tokens     ?? 0,
                completionTokens: chunk.usage.completion_tokens ?? 0,
                totalTokens:      chunk.usage.total_tokens      ?? 0,
              });
            }

            const delta = chunk?.choices?.[0]?.delta;
            // Forward EVERY typed event. Only skip deltas with neither a `type` nor
            // `content` (OpenAI role-only openers, empty keepalives). Rich events
            // carry their payload in structured fields, not text — never drop a typed
            // event just because it has no `content` (that was the silent-drop bug).
            if (!delta || (!delta.type && !delta.content)) continue;

            const rawType   = (delta.type as string) ?? "message";
            const eventType = rawType as EventType;

            // In Ask mode, gate memory writes through the permission dialog
            if (rawType === "memory_write" && bridge) {
              const policy = await bridge.workspace.getPolicy();
              if (policy.mode === "ask") {
                const { approved } = await bridge.permissions.request({
                  toolName:  "memory_write",
                  toolInput: { content: String(delta.content).slice(0, 100) },
                  callId:    `mw-${Date.now()}`,
                });
                if (!approved) {
                  if (runId) bridge.runs?.addEvent(runId, "permission", { action: "memory_write", denied: true });
                  continue;
                }
              }
            }

            const isText = rawType === "message" || rawType === "response";
            opts.onEvent({
              type:          eventType,
              content:       delta.content ?? "",
              agent_name:    delta.agent_name,
              pioneer_name:  delta.pioneer_name,
              clarification: delta.clarification,
              // Carry the full payload for rich events so a new structured type
              // reaches the UI with no parser edit; text tokens skip it (no bloat).
              data:          isText ? undefined : (delta as Record<string, unknown>),
            });
          } catch {}
        }
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

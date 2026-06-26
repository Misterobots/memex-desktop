import { getAgentRuntime } from "./runtime-urls";
import { desktop }         from "./desktop";
import type { EventType, MemexMode } from "../types/memex";

export interface SSEEvent {
  type: EventType;
  content: string;
  agent_name?: string;
  pioneer_name?: string;
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
            const delta = chunk?.choices?.[0]?.delta;
            if (!delta?.content) continue;

            opts.onEvent({
              type:         (delta.type as EventType) ?? "message",
              content:      delta.content,
              agent_name:   delta.agent_name,
              pioneer_name: delta.pioneer_name,
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

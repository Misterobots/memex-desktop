import { AGENT_RUNTIME } from "./memex-client";
import type { EventType, MemexMode, MODE_FLAGS } from "../types/memex";

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
  sessionId?: string;
  alreadySteered?: boolean;
  onEvent: (event: SSEEvent) => void;
  onDone: () => void;
  onError: (err: Error) => void;
}

export function streamChat(opts: StreamOptions): () => void {
  const controller = new AbortController();

  const body = JSON.stringify({
    model: "swarm",
    messages: opts.messages,
    stream: true,
    session_id: opts.sessionId ?? "default_session",
    already_steered: opts.alreadySteered ?? false,
    ...opts.modeFlags,
  });

  fetch(`${AGENT_RUNTIME}/v1/chat/completions`, {
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

      opts.onDone();
    })
    .catch((err) => {
      if (err.name !== "AbortError") opts.onError(err);
    });

  return () => controller.abort();
}

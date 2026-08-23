import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "./api-fetch";
import { getAgentRuntime } from "./runtime-urls";
import { handleRemoteCadRequest } from "./remote-cad-protocol";

const PAIRING_PATH = "/api/v1/pairing";

export type RemoteCadHostState = {
  status: "idle" | "waiting" | "connected" | "error";
  code: string | null;
  error: string | null;
};

function websocketUrl(token: string): string {
  const url = new URL(getAgentRuntime());
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}${PAIRING_PATH}/ws/${token}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

/** Desktop-only host for the narrowly whitelisted remote CAD protocol. */
export function useRemoteCadHost() {
  const [state, setState] = useState<RemoteCadHostState>({ status: "idle", code: null, error: null });
  const tokenRef = useRef<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const disconnect = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
    const token = tokenRef.current;
    tokenRef.current = null;
    if (token) void apiFetch(`${getAgentRuntime()}${PAIRING_PATH}/leave/${token}`, { method: "DELETE" });
    setState({ status: "idle", code: null, error: null });
  }, []);

  useEffect(() => () => {
    socketRef.current?.close();
    const token = tokenRef.current;
    if (token) void apiFetch(`${getAgentRuntime()}${PAIRING_PATH}/leave/${token}`, { method: "DELETE" });
  }, []);

  const host = useCallback(async () => {
    disconnect();
    try {
      const response = await apiFetch(`${getAgentRuntime()}${PAIRING_PATH}/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: "Friday CAD workstation",
          capabilities: ["cad_review"],
        }),
      });
      if (!response.ok) throw new Error(`Could not create pairing (${response.status}).`);
      const created = await response.json() as { code: string; token: string };
      tokenRef.current = created.token;
      setState({ status: "waiting", code: created.code, error: null });

      const socket = new WebSocket(websocketUrl(created.token));
      socketRef.current = socket;
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as Record<string, unknown>;
          if (message.type === "peer_joined") {
            setState((current) => ({ ...current, status: "connected" }));
            return;
          }
          if (message.type === "peer_left") {
            setState((current) => ({ ...current, status: "waiting" }));
            return;
          }
          void handleRemoteCadRequest(message).then((reply) => {
            if (reply && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(reply));
          });
        } catch {
          // Ignore malformed relay messages; no local action is performed.
        }
      };
      socket.onerror = () => setState((current) => ({ ...current, status: "error", error: "Pairing relay connection failed." }));
      socket.onclose = () => setState((current) => current.status === "connected" ? { ...current, status: "waiting" } : current);
    } catch (caught) {
      setState({ status: "error", code: null, error: caught instanceof Error ? caught.message : "Could not start pairing." });
    }
  }, [disconnect]);

  return { state, host, disconnect };
}

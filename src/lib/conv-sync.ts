/**
 * Conversation sync — resume sessions from the backend and push local changes.
 *
 * The backend (agent_runtime) persists full conversation objects in Postgres
 * keyed by (id, owner). Owner is the X-authentik-username header, injected by
 * the Electron main process. This gives session resume across a fresh install
 * and cross-device sync with any client signed in as the same user.
 */
import { getAgentRuntime } from "./runtime-urls";
import { apiFetch } from "./api-fetch";
import type { Session } from "../types/memex";

/** Fetch all stored conversations for the current user (newest first). */
export async function fetchRemoteSessions(): Promise<Session[]> {
  try {
    const res = await apiFetch(`${getAgentRuntime()}/v1/conversations`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { conversations?: unknown };
    const list = Array.isArray(data.conversations) ? data.conversations : [];
    // Only trust well-formed conversation objects.
    return list.filter((c): c is Session =>
      !!c && typeof (c as Session).id === "string" && Array.isArray((c as Session).messages)
    ).map((session) => ({ ...session, experience: session.experience ?? "chat" }));
  } catch {
    return [];
  }
}

// Debounce pushes per session so rapid turns coalesce into one PUT.
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Upsert a session to the backend (debounced). Skips empty sessions. */
export function pushSession(session: Session): void {
  if (!session || session.messages.length === 0) return;
  const existing = timers.get(session.id);
  if (existing) clearTimeout(existing);
  timers.set(session.id, setTimeout(() => {
    timers.delete(session.id);
    const payload = { ...session, updatedAt: session.updatedAt ?? Date.now() };
    // Backend requires body.id === path id.
    apiFetch(`${getAgentRuntime()}/v1/conversations/${encodeURIComponent(session.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }, 1200));
}

/** Delete a session from the backend. */
export function deleteRemoteSession(id: string): void {
  apiFetch(`${getAgentRuntime()}/v1/conversations/${encodeURIComponent(id)}`, {
    method: "DELETE",
  }).catch(() => {});
}

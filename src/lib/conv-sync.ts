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
    ).map((session) => ({
      ...session,
      experience: session.experience ?? "chat",
      // Older/synced messages can arrive without an events array; every
      // renderer downstream (MessageBubble, etc.) assumes it's always present.
      messages: session.messages.map((m) => ({ ...m, events: m.events ?? [] })),
    }));
  } catch {
    return [];
  }
}

// Debounce pushes per session so rapid turns coalesce into one PUT. Failed
// writes are retried because a runtime restart or short network interruption
// should not silently lose the latest local conversation state.
type PendingPush = {
  session: Session;
  attempt: number;
  timer?: ReturnType<typeof setTimeout>;
};

const pendingPushes = new Map<string, PendingPush>();
const RETRY_DELAYS_MS = [1500, 3000, 6000, 12000];

function schedulePush(id: string, pending: PendingPush, delayMs: number): void {
  if (pending.timer) clearTimeout(pending.timer);
  pending.timer = setTimeout(() => {
    pending.timer = undefined;
    void performPush(id, pending);
  }, delayMs);
}

async function performPush(id: string, pending: PendingPush): Promise<void> {
  // A newer local snapshot has replaced this retry; never let an older
  // in-flight request delete or reschedule the newer entry.
  if (pendingPushes.get(id) !== pending) return;

  const payload = { ...pending.session, updatedAt: pending.session.updatedAt ?? Date.now() };
  try {
    const response = await apiFetch(`${getAgentRuntime()}/v1/conversations/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`conversation sync failed (${response.status})`);
    if (pendingPushes.get(id) === pending) pendingPushes.delete(id);
  } catch {
    if (pendingPushes.get(id) !== pending) return;
    const retryDelay = RETRY_DELAYS_MS[pending.attempt];
    if (retryDelay === undefined) {
      pendingPushes.delete(id);
      return;
    }
    pending.attempt += 1;
    schedulePush(id, pending, retryDelay);
  }
}

/** Upsert a session to the backend (debounced). Skips empty sessions. */
export function pushSession(session: Session): void {
  if (!session || session.messages.length === 0) return;
  const pending: PendingPush = { session, attempt: 0 };
  pendingPushes.set(session.id, pending);
  schedulePush(session.id, pending, 1200);
}

/** Delete a session from the backend. */
export function deleteRemoteSession(id: string): void {
  apiFetch(`${getAgentRuntime()}/v1/conversations/${encodeURIComponent(id)}`, {
    method: "DELETE",
  }).catch(() => {});
}

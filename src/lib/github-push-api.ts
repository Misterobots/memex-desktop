/**
 * GitHub push-token API client (fine-grained PAT for repo-write access).
 * Talks to agent_runtime /api/v1/github/push/* over the same-origin proxy in
 * web mode (getAgentRuntime() === "") and the active profile URL in Electron.
 * All routes are owner-scoped server-side. Structurally separate from any
 * other GitHub connection (e.g. the read:user OAuth device flow) — this
 * token is used only to open pull requests from completed Tasks.
 */
import { getAgentRuntime } from "./runtime-urls";

export interface GithubPushStatus {
  connected: boolean;
  github_username?: string;
}

export async function connectGithubPush(
  token: string
): Promise<{ connected: boolean; github_username?: string; error?: string }> {
  try {
    const r = await fetch(`${getAgentRuntime()}/api/v1/github/push/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return { connected: false, error: data?.detail || `HTTP ${r.status}` };
    }
    return { connected: true, github_username: data?.github_username };
  } catch (e) {
    return { connected: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

export async function getGithubPushStatus(): Promise<GithubPushStatus> {
  try {
    const r = await fetch(`${getAgentRuntime()}/api/v1/github/push/status`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { connected: false };
    const data = await r.json();
    return { connected: !!data?.connected, github_username: data?.github_username };
  } catch {
    return { connected: false };
  }
}

export async function disconnectGithubPush(): Promise<boolean> {
  try {
    const r = await fetch(`${getAgentRuntime()}/api/v1/github/push/token`, {
      method: "DELETE",
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return false;
    const data = await r.json();
    return !!data?.deleted;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Gated push + PR (Phase D backend / Phase F UI) — GET /v1/tasks/{id}/push/preview,
// POST /v1/tasks/{id}/push/confirm, GET /v1/tasks/{id}/push/status. Every route
// is 404 when the server-side GITHUB_PUSH_ENABLED flag is off (same "not enabled
// yet" shape as TASKS_DIRECT_CREATE_ENABLED in tasks-api.ts's createTask), and
// preview/confirm both surface 409s with a user-facing `detail` message (diff
// not approved, no pushable branch, no token connected, expired confirm_token) —
// callers need that message verbatim, so failures are returned as a typed
// `{error, status}` variant rather than collapsed to null/false.
// ---------------------------------------------------------------------------

export interface PushPreview {
  confirm_token: string;
  git_url: string;
  base_branch: string;
  branch: string;
  pr_title: string;
  pr_body: string;
  expires_in: number;
}

export interface PushConfirmBody {
  confirm_token: string;
  branch: string;
  pr_title: string;
  pr_body: string;
  base_branch: string;
}

export interface PushConfirmResult {
  pr_number: number;
  pr_url: string;
}

export interface PushStatus {
  stage: "preview_shown" | "confirm_attempted" | "push_succeeded" | "push_failed" | null;
  target_repo?: string;
  target_branch?: string;
  base_branch?: string;
  pr_number?: number;
  pr_url?: string;
  error?: string;
  created_at?: string;
}

/** Pure computation, no git/GitHub side effects — issues a short-TTL confirm_token. */
export async function getPushPreview(
  coordinationId: string
): Promise<PushPreview | { error: string; status: number }> {
  try {
    const r = await fetch(`${getAgentRuntime()}/v1/tasks/${encodeURIComponent(coordinationId)}/push/preview`, {
      signal: AbortSignal.timeout(8000),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { error: data?.detail || `HTTP ${r.status}`, status: r.status };
    return data as PushPreview;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Network error", status: 0 };
  }
}

/**
 * Executes the actual git push + PR creation — a real network call to GitHub,
 * so it gets a longer timeout than this file's other routes (precedent for a
 * non-8000ms timeout on a legitimately slow op: ContextMeter.tsx uses 70000).
 */
export async function confirmPush(
  coordinationId: string,
  body: PushConfirmBody
): Promise<PushConfirmResult | { error: string; status: number }> {
  try {
    const r = await fetch(`${getAgentRuntime()}/v1/tasks/${encodeURIComponent(coordinationId)}/push/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { error: data?.detail || `HTTP ${r.status}`, status: r.status };
    return data as PushConfirmResult;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Network error", status: 0 };
  }
}

/** Polls the latest audit-trail row for this task. Defensive/optional — confirmPush's own response already carries pr_url on success. */
export async function getPushStatus(coordinationId: string): Promise<PushStatus> {
  try {
    const r = await fetch(`${getAgentRuntime()}/v1/tasks/${encodeURIComponent(coordinationId)}/push/status`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { stage: null };
    const data = await r.json();
    return data as PushStatus;
  } catch {
    return { stage: null };
  }
}

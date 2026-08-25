/**
 * Task board API client (mobile Codex loop). Talks to agent_runtime /v1/tasks
 * over the same-origin proxy in web mode (getAgentRuntime() === "") and the
 * active profile URL in Electron. All routes are owner-scoped server-side.
 */
import { getAgentRuntime } from "./runtime-urls";
import { apiFetch } from "./api-fetch";
import type { Task, TaskWorker } from "../types/memex";

export type TaskUpdate = Partial<Pick<Task, "title" | "scope" | "branch">> & { prompt?: string };
export interface TaskMutationResult { ok: boolean; status: number; error?: string; }

export function normalizeTask(value: unknown): Task | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<Task>;
  if (typeof item.coordination_id !== "string" || typeof item.status !== "string") return null;
  return {
    ...item,
    coordination_id: item.coordination_id,
    status: item.status as Task["status"],
    phase: typeof item.phase === "number" ? item.phase : 0,
    workers_total: typeof item.workers_total === "number" ? item.workers_total : 0,
    workers_completed: typeof item.workers_completed === "number" ? item.workers_completed : 0,
    workers_failed: typeof item.workers_failed === "number" ? item.workers_failed : 0,
    approval_state: item.approval_state === "pending" || item.approval_state === "approved" || item.approval_state === "denied" ? item.approval_state : "none",
    started_at: typeof item.started_at === "number" ? item.started_at : Date.now(),
  };
}

export function normalizeTaskList(value: unknown): Task[] {
  if (!value || typeof value !== "object") return [];
  const source = value as { runs?: unknown; tasks?: unknown };
  const entries = Array.isArray(source.runs) ? source.runs : Array.isArray(source.tasks) ? source.tasks : [];
  return entries.map(normalizeTask).filter((task): task is Task => task !== null);
}

export async function listTasks(status: "all" | "running" = "all"): Promise<Task[]> {
  try {
    const r = await apiFetch(`${getAgentRuntime()}/v1/tasks?status=${status}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return [];
    const data = await r.json();
    return normalizeTaskList(data);
  } catch {
    return [];
  }
}

export async function getTask(id: string): Promise<{ run: Task; workers: TaskWorker[] } | null> {
  try {
    const r = await apiFetch(`${getAgentRuntime()}/v1/tasks/${encodeURIComponent(id)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const run = normalizeTask(data?.run ?? data?.task);
    if (!run) return null;
    const workers = Array.isArray(data?.workers) ? data.workers.filter((worker: unknown): worker is TaskWorker => !!worker && typeof worker === "object" && typeof (worker as TaskWorker).worker_id === "string") : [];
    return { run, workers };
  } catch {
    return null;
  }
}

export interface TaskDiff {
  coordination_id: string;
  scope?: string;
  diff_text: string;
  truncated: boolean;
}

/** Returns the diff, or a status code for the "not ready" cases (404 none / 409 running). */
export async function getTaskDiff(id: string): Promise<{ diff?: TaskDiff; status: number }> {
  try {
    const r = await apiFetch(`${getAgentRuntime()}/v1/tasks/${encodeURIComponent(id)}/diff`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { status: r.status };
    return { diff: await r.json(), status: 200 };
  } catch {
    return { status: 0 };
  }
}

export async function stopTask(id: string): Promise<boolean> {
  try {
    const r = await apiFetch(`${getAgentRuntime()}/v1/tasks/${encodeURIComponent(id)}/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** Update mutable task metadata/prompt without changing its approval state. */
export async function updateTask(id: string, update: TaskUpdate): Promise<TaskMutationResult> {
  try {
    const r = await apiFetch(`${getAgentRuntime()}/v1/tasks/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) return { ok: true, status: r.status };
    const data = await r.json().catch(() => ({}));
    return { ok: false, status: r.status, error: typeof data?.detail === "string" ? data.detail : undefined };
  } catch {
    return { ok: false, status: 0 };
  }
}
export async function setTaskApproval(id: string, decision: "approve" | "deny"): Promise<boolean> {
  try {
    const r = await apiFetch(`${getAgentRuntime()}/v1/tasks/${encodeURIComponent(id)}/${decision}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Direct task creation for the "New Task" composer (NewTaskComposer.tsx) —
 * bypasses chat entirely. POST /v1/tasks returns 202 on success (the run is
 * created and drained in the background), 404 if the server-side
 * TASKS_DIRECT_CREATE_ENABLED flag is off.
 *
 * Returns `status` alongside the result (same shape as getTaskDiff above)
 * rather than collapsing every failure to a bare null — the composer needs
 * to tell "not enabled" (404) apart from a generic failure to show a useful
 * message instead of a dead end.
 */
export async function createTask(body: {
  prompt: string;
  dev_project_id?: string;
  branch?: string;
}): Promise<{ coordination_id?: string; status: number }> {
  try {
    const r = await apiFetch(`${getAgentRuntime()}/v1/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { status: r.status };
    const data = await r.json();
    return { coordination_id: data?.coordination_id, status: r.status };
  } catch {
    return { status: 0 };
  }
}

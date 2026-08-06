/**
 * Task board API client (mobile Codex loop). Talks to agent_runtime /v1/tasks
 * over the same-origin proxy in web mode (getAgentRuntime() === "") and the
 * active profile URL in Electron. All routes are owner-scoped server-side.
 */
import { getAgentRuntime } from "./runtime-urls";
import type { Task, TaskWorker } from "../types/memex";

export async function listTasks(status: "all" | "running" = "all"): Promise<Task[]> {
  try {
    const r = await fetch(`${getAgentRuntime()}/v1/tasks?status=${status}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data?.runs) ? data.runs : [];
  } catch {
    return [];
  }
}

export async function getTask(id: string): Promise<{ run: Task; workers: TaskWorker[] } | null> {
  try {
    const r = await fetch(`${getAgentRuntime()}/v1/tasks/${encodeURIComponent(id)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    return await r.json();
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
    const r = await fetch(`${getAgentRuntime()}/v1/tasks/${encodeURIComponent(id)}/diff`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { status: r.status };
    return { diff: await r.json(), status: 200 };
  } catch {
    return { status: 0 };
  }
}

export async function setTaskApproval(id: string, decision: "approve" | "deny"): Promise<boolean> {
  try {
    const r = await fetch(`${getAgentRuntime()}/v1/tasks/${encodeURIComponent(id)}/${decision}`, {
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
    const r = await fetch(`${getAgentRuntime()}/v1/tasks`, {
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

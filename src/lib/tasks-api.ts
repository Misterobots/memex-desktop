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

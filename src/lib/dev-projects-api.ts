/**
 * Dev-project API client. Talks to agent_runtime /v1/dev/projects over the
 * same-origin proxy in web mode (getAgentRuntime() === "") and the active
 * profile URL in Electron. All routes are owner-scoped server-side.
 *
 * These are the repos the "New Task" composer (NewTaskComposer.tsx) picks
 * from / creates via the inline "+ New repo" affordance.
 */
import { getAgentRuntime } from "./runtime-urls";
import { apiFetch } from "./api-fetch";

export interface DevProject {
  id:         string;
  uid:        string;
  name:       string;
  source:     "blank" | "git_url";
  git_url?:   string;
  git_ref?:   string;
  path:       string;
  created_at: string;
}

export async function listDevProjects(): Promise<DevProject[]> {
  try {
    const r = await apiFetch(`${getAgentRuntime()}/v1/dev/projects`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data?.projects) ? data.projects : [];
  } catch {
    return [];
  }
}

export async function createDevProject(body: {
  name: string;
  source: "blank" | "git_url";
  git_url?: string;
  git_ref?: string;
}): Promise<DevProject | null> {
  try {
    const r = await apiFetch(`${getAgentRuntime()}/v1/dev/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

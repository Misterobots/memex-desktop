/**
 * "Publish to GitHub" API client — for a blank (local, git-inited) dev
 * project only. Same conventions as dev-projects-api.ts/tasks-api.ts:
 * same-origin proxy in web mode, active profile URL in Electron, owner-scoped
 * server-side. Backend: agents/dev_projects/routes.py's publish/preview and
 * publish routes.
 */
import { getAgentRuntime } from "./runtime-urls";
import { apiFetch } from "./api-fetch";

export interface PublishPreview {
  branch: string;
  files: string[];
  suggested_repo_name: string;
  github_username?: string;
}

/** Returns the preview, or a status code for the "not eligible yet" cases
 *  (400 no content / no token connected, 404 not enabled). Distinguishing
 *  those from a network failure is what lets the dialog show a specific
 *  reason instead of a dead end. */
export async function getPublishPreview(projectId: string): Promise<{ preview?: PublishPreview; status: number; detail?: string }> {
  try {
    const r = await apiFetch(`${getAgentRuntime()}/v1/dev/projects/${encodeURIComponent(projectId)}/publish/preview`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) {
      const body = await r.json().catch(() => null);
      return { status: r.status, detail: body?.detail };
    }
    return { preview: await r.json(), status: 200 };
  } catch {
    return { status: 0 };
  }
}

export interface PublishResult {
  git_url?: string;
  html_url?: string;
  status: number;
  detail?: string;
}

export async function publishProject(projectId: string, body: { repoName: string; private: boolean }): Promise<PublishResult> {
  try {
    const r = await apiFetch(`${getAgentRuntime()}/v1/dev/projects/${encodeURIComponent(projectId)}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo_name: body.repoName, private: body.private }),
      signal: AbortSignal.timeout(60000), // repo creation + a real git push — slower than the usual 8s budget
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) return { status: r.status, detail: data?.detail };
    return { git_url: data?.git_url, html_url: data?.html_url, status: 200 };
  } catch {
    return { status: 0 };
  }
}

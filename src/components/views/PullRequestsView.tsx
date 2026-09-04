import { useCallback, useEffect, useState } from "react";
import type { Task } from "../../types/memex";
import { listTasks } from "../../lib/tasks-api";
import { getPushStatus, type PushStatus } from "../../lib/github-push-api";

type PullRequest = { task: Task; status: PushStatus };

export function PullRequestsView() {
  const [pulls, setPulls] = useState<PullRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setMessage("");
    try {
      const candidates = (await listTasks("all")).filter((task) => task.repo_url && task.approval_state === "approved");
      const statuses = await Promise.all(candidates.map(async (task) => ({ task, status: await getPushStatus(task.coordination_id) })));
      setPulls(statuses.filter(({ status }) => Boolean(status.pr_url)));
      if (!statuses.length) setMessage("No approved repository tasks yet. Complete a Code task, review its diff, then open a pull request.");
      else if (!statuses.some(({ status }) => status.pr_url)) setMessage("No pull requests have been opened through Memex yet.");
    } catch { setMessage("Could not load pull request history."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return <div className="flex-1 overflow-y-auto bg-canvas">
    <div className="max-w-5xl mx-auto p-6 sm:p-8">
      <div className="flex items-start justify-between gap-5 mb-7">
        <div><h1 className="text-2xl font-semibold text-text">Pull requests</h1><p className="mt-1 text-sm text-muted">Pull requests opened by Memex after you approved a task’s change set.</p></div>
        <button onClick={() => void load()} className="px-3 py-2 rounded-lg border border-border text-sm text-muted hover:text-text">Refresh</button>
      </div>
      {loading ? <p className="py-10 text-center text-sm text-muted">Loading pull requests…</p> : pulls.length ? <div className="space-y-3">
        {pulls.map(({ task, status }) => <a key={task.coordination_id} href={status.pr_url} target="_blank" rel="noreferrer" className="block rounded-2xl border border-border/60 bg-surface p-4 hover:bg-surface2 transition-colors">
          <div className="flex items-center justify-between gap-4"><span className="text-sm font-medium text-text truncate">{task.title || task.coordination_id}</span><span className="flex-shrink-0 text-xs text-accent">Open on GitHub ↗</span></div>
          <div className="mt-2 text-xs text-muted truncate">{status.target_repo ?? task.repo_url}</div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-faint"><span>#{status.pr_number ?? "—"}</span>{status.base_branch && <span>{status.target_branch ?? task.branch ?? "branch"} → {status.base_branch}</span>}{status.created_at && <span>{new Date(status.created_at).toLocaleDateString()}</span>}</div>
        </a>)}
      </div> : <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted">{message || "No pull requests found."}</div>}
    </div>
  </div>;
}

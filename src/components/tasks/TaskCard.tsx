import type { Task } from "../../types/memex";

const STATUS_STYLE: Record<string, string> = {
  running:     "text-yellow border-yellow/30 bg-yellow/10",
  completed:   "text-green border-green/30 bg-green/10",
  failed:      "text-red-400 border-red-400/30 bg-red-400/10",
  cancelled:   "text-muted border-border/40 bg-surface2/40",
  needs_input: "text-accent2 border-accent2/30 bg-accent2/10",
};

function timeAgo(sec?: number): string {
  if (!sec) return "";
  const d = Math.max(0, Math.floor(Date.now() / 1000) - sec);
  if (d < 60)    return `${d}s ago`;
  if (d < 3600)  return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

export function TaskCard({ task, active, onClick }: { task: Task; active: boolean; onClick: () => void }) {
  const pct = Math.min(100, (task.phase / 5) * 100);
  const running = task.status === "running";
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-3 border-b border-border/20 transition-colors
        ${active ? "bg-accent/10 border-l-2 border-l-accent" : "hover:bg-surface2/40"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm text-text/90 truncate">{task.title || task.coordination_id}</div>
          <div className="text-[10px] text-muted mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span>{task.phase_name || "—"} · {task.phase}/5</span>
            <span>·</span>
            <span>
              {task.workers_completed}/{task.workers_total} workers
              {task.workers_failed ? ` · ${task.workers_failed} failed` : ""}
            </span>
            {(task.ended_at || task.started_at) && (
              <>
                <span>·</span>
                <span>{timeAgo(task.ended_at || task.started_at)}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border inline-flex items-center ${STATUS_STYLE[task.status] ?? STATUS_STYLE.cancelled}`}>
            {running && <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow mr-1 status-dot-active" />}
            {task.status === "needs_input" ? "needs input" : task.status}
          </span>
          {task.approval_state === "approved" && <span className="text-[10px] text-green">✓ approved</span>}
          {task.approval_state === "denied"   && <span className="text-[10px] text-red-400">✕ denied</span>}
          {task.has_diff && task.approval_state === "none" && <span className="text-[10px] text-accent2">diff ready</span>}
        </div>
      </div>
      <div className="mt-2 h-1 rounded-full bg-surface2 overflow-hidden">
        <span
          className={`block h-full rounded-full ${
            task.status === "failed" ? "bg-red-400"
              : task.status === "needs_input" ? "bg-accent2"
              : running ? "bg-yellow" : "bg-green"
          }`}
          style={{ width: `${Math.max(4, pct)}%` }}
        />
      </div>
    </button>
  );
}

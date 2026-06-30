import { useCallback, useEffect, useState } from "react";
import type { Task, TaskWorker } from "../../types/memex";
import { getTask, getTaskDiff, setTaskApproval, type TaskDiff } from "../../lib/tasks-api";
import { WebDiffViewer } from "./WebDiffViewer";

const WORKER_DOT: Record<string, string> = {
  running: "bg-yellow", completed: "bg-green", failed: "bg-red-400", pending: "bg-muted",
};

export function TaskDetailPanel({ id, onClose, onChange }: {
  id: string; onClose: () => void; onChange?: () => void;
}) {
  const [run,      setRun]      = useState<Task | null>(null);
  const [workers,  setWorkers]  = useState<TaskWorker[]>([]);
  const [diff,     setDiff]     = useState<TaskDiff | null>(null);
  const [diffMsg,  setDiffMsg]  = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  const load = useCallback(async () => {
    const res = await getTask(id);
    if (res) { setRun(res.run); setWorkers(res.workers); }
  }, [id]);

  useEffect(() => { setRun(null); setDiff(null); setDiffMsg(null); load(); }, [load]);

  // Poll detail while the run is still in flight.
  useEffect(() => {
    if (run?.status !== "running") return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [run?.status, load]);

  // Fetch the diff once the run is done.
  useEffect(() => {
    if (!run || run.status === "running") return;
    if (!run.has_diff) { setDiffMsg("No file changes recorded for this run."); return; }
    let alive = true;
    (async () => {
      const { diff, status } = await getTaskDiff(id);
      if (!alive) return;
      if (diff) setDiff(diff);
      else if (status === 409) setDiffMsg("Diff still being prepared…");
      else setDiffMsg("No diff available.");
    })();
    return () => { alive = false; };
  }, [run?.status, run?.has_diff, id]);

  const decide = async (decision: "approve" | "deny") => {
    setApproving(true);
    if (await setTaskApproval(id, decision)) { await load(); onChange?.(); }
    setApproving(false);
  };

  if (!run) {
    return (
      <div className="fixed inset-0 z-40 bg-canvas flex items-center justify-center text-muted text-sm md:static md:z-auto md:flex-1">
        Loading…
      </div>
    );
  }

  const done = run.status !== "running";
  const decided = run.approval_state === "approved" || run.approval_state === "denied";

  return (
    <div className="fixed inset-0 z-40 bg-canvas flex flex-col overflow-hidden md:static md:z-auto md:flex-1">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 flex-shrink-0">
        <div className="min-w-0">
          <div className="text-sm font-medium text-text truncate">{run.title || run.coordination_id}</div>
          <div className="text-[10px] text-muted">
            {run.status} · {run.phase_name || "—"} {run.phase}/5 · {run.workers_completed}/{run.workers_total} workers
            {run.workers_failed ? ` · ${run.workers_failed} failed` : ""}
          </div>
        </div>
        <button onClick={onClose} className="text-muted hover:text-text p-1 flex-shrink-0">
          <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M2 2l8 8M10 2L2 10" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <div className="text-[10px] text-muted uppercase tracking-wide mb-1.5">Pioneers</div>
          <div className="space-y-1.5">
            {workers.map((w) => (
              <div key={w.worker_id} className="flex items-center gap-2 text-xs min-w-0">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${WORKER_DOT[w.status] ?? "bg-muted"}`} />
                <span className="text-text/80 font-medium flex-shrink-0">{w.pioneer_name || w.role}</span>
                <span className="text-muted truncate">· {w.role} · {w.task}</span>
              </div>
            ))}
            {workers.length === 0 && <div className="text-xs text-muted">No workers yet.</div>}
          </div>
        </div>

        {run.summary && (
          <div>
            <div className="text-[10px] text-muted uppercase tracking-wide mb-1">Summary</div>
            <p className="text-xs text-text/80 whitespace-pre-wrap leading-relaxed">{run.summary}</p>
          </div>
        )}
        {run.error && (
          <div>
            <div className="text-[10px] text-red-400 uppercase tracking-wide mb-1">Error</div>
            <p className="text-xs text-red-400/90 whitespace-pre-wrap">{run.error}</p>
          </div>
        )}

        {done && (
          <div>
            <div className="text-[10px] text-muted uppercase tracking-wide mb-1">
              Changes{diff?.truncated ? " (truncated)" : ""}
            </div>
            {diff ? <WebDiffViewer diff={diff.diff_text} /> : <div className="text-xs text-muted">{diffMsg ?? "Loading diff…"}</div>}
          </div>
        )}
      </div>

      {done && (
        <div className="flex-shrink-0 border-t border-border/40 p-3">
          {decided ? (
            <div className={`text-center text-xs ${run.approval_state === "approved" ? "text-green" : "text-red-400"}`}>
              {run.approval_state === "approved" ? "✓ Approved" : "✕ Denied"}
            </div>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => decide("deny")} disabled={approving}
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-red-400/40 text-red-400 hover:bg-red-400/10 disabled:opacity-50">
                Deny
              </button>
              <button onClick={() => decide("approve")} disabled={approving}
                className="flex-1 px-3 py-2 text-sm rounded-lg bg-accent text-canvas hover:bg-accentdim disabled:opacity-50">
                {approving ? "…" : "Approve"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

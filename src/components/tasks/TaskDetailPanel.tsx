import { useCallback, useEffect, useState } from "react";
import type { Task, TaskWorker } from "../../types/memex";
import { getTask, getTaskDiff, getTaskEvents, retryTask, setTaskApproval, stopTask, type TaskDiff, type TaskEvent } from "../../lib/tasks-api";
import { WebDiffViewer } from "./WebDiffViewer";
import { PushPreviewModal } from "./PushPreviewModal";

const WORKER_DOT: Record<string, string> = {
  running: "bg-yellow", completed: "bg-green", failed: "bg-red-400", pending: "bg-muted",
};

function eventLabel(event: TaskEvent): string {
  const payload = event.payload ?? {};
  const detail = [payload.message, payload.status, payload.phase_name, payload.tool]
    .find((value): value is string => typeof value === "string" && value.length > 0);
  return detail ? `${event.type.replace(/_/g, " ")} · ${detail}` : event.type.replace(/_/g, " ");
}

export function TaskDetailPanel({ id, onClose, onChange, onRetry }: {
  id: string; onClose: () => void; onChange?: () => void; onRetry?: (id: string) => void;
}) {
  const [run,      setRun]      = useState<Task | null>(null);
  const [workers,  setWorkers]  = useState<TaskWorker[]>([]);
  const [events,   setEvents]   = useState<TaskEvent[]>([]);
  const [diff,     setDiff]     = useState<TaskDiff | null>(null);
  const [diffMsg,  setDiffMsg]  = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryMsg, setRetryMsg] = useState<string | null>(null);

  // Gated GitHub push/PR (Phase F). Local-only: a page refresh losing the
  // shown PR link is acceptable — push/status exists for a defensive re-fetch
  // but isn't needed for the core flow since confirmPush's own response
  // already carries pr_url.
  const [pushModalOpen, setPushModalOpen] = useState(false);
  const [pushedPrUrl,   setPushedPrUrl]   = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await getTask(id);
    if (res) {
      setRun(res.run);
      setWorkers(res.workers);
      setEvents((await getTaskEvents(id)).slice(-40));
    }
  }, [id]);

  useEffect(() => {
    setRun(null); setDiff(null); setDiffMsg(null); setEvents([]);
    setPushModalOpen(false); setPushedPrUrl(null);
    load();
  }, [load]);

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

  const stop = async () => {
    if (!run || run.status !== "running") return;
    setStopping(true);
    if (await stopTask(id)) { await load(); onChange?.(); }
    setStopping(false);
  };
  const decide = async (decision: "approve" | "deny") => {
    setApproving(true);
    if (await setTaskApproval(id, decision)) { await load(); onChange?.(); }
    setApproving(false);
  };
  const retry = async () => {
    setRetrying(true); setRetryMsg(null);
    const result = await retryTask(id);
    if (result.coordination_id) { onRetry?.(result.coordination_id); onChange?.(); }
    else setRetryMsg(result.error || "Retry could not be started.");
    setRetrying(false);
  };

  if (!run) {
    return (
      <div className="fixed inset-0 z-40 bg-canvas flex items-center justify-center text-muted text-sm md:static md:z-auto md:flex-1">
        Loading…
      </div>
    );
  }

  const needsInput = run.status === "needs_input";
  const done = run.status === "completed" || run.status === "failed" || run.status === "cancelled";
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

      {run.status === "running" && (
        <div className="flex-shrink-0 border-b border-border/40 px-4 py-3">
          <button onClick={stop} disabled={stopping}
            className="w-full px-3 py-2 text-xs rounded-lg border border-red-400/40 text-red-400 hover:bg-red-400/10 disabled:opacity-50">
            {stopping ? "Stopping…" : "Stop task"}
          </button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {needsInput && (
          <div className="rounded-lg border border-accent2/40 bg-accent2/10 px-3 py-2.5 text-xs text-text/90 leading-relaxed">
            ⏳ <span className="font-medium">Waiting for your input.</span> This build asked a clarifying
            question — open the <span className="text-accent2">Chat</span> tab and answer the card to let it proceed.
          </div>
        )}
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

        {events.length > 0 && (
          <div>
            <div className="text-[10px] text-muted uppercase tracking-wide mb-1.5">Activity</div>
            <div className="space-y-1.5 border-l border-border/60 pl-3">
              {events.map((event) => (
                <div key={`${event.run_id}-${event.seq}`} className="text-xs text-text/75 leading-relaxed">
                  <span className="text-muted/70 mr-1.5">#{event.seq + 1}</span>
                  {eventLabel(event)}
                </div>
              ))}
            </div>
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
          <button onClick={retry} disabled={retrying}
            className="w-full mb-2 px-3 py-2 text-sm rounded-lg border border-accent2/40 text-accent2 hover:bg-accent2/10 disabled:opacity-50">
            {retrying ? "Starting retry…" : "Retry task"}
          </button>
          {retryMsg && <div className="text-center text-xs text-red-400 mb-2">{retryMsg}</div>}
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

      {/* Gated push/PR — only for tasks created against a linked repo
         (New Task composer). Chat-originated tasks have no repo_url and this
         renders nothing, gracefully. */}
      {run.approval_state === "approved" && run.repo_url && (
        <div className="flex-shrink-0 border-t border-border/40 p-3">
          {pushedPrUrl ? (
            <a
              href={pushedPrUrl}
              target="_blank"
              rel="noreferrer"
              className="block text-center text-xs text-accent2 hover:text-accent2/80 underline truncate"
            >
              ✓ Pull request opened — {pushedPrUrl}
            </a>
          ) : (
            <button
              onClick={() => setPushModalOpen(true)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-accent2/40 text-accent2 hover:bg-accent2/10 transition-colors"
            >
              Open Pull Request →
            </button>
          )}
        </div>
      )}

      {pushModalOpen && (
        <PushPreviewModal
          coordinationId={id}
          diff={diff}
          onClose={() => setPushModalOpen(false)}
          onPushed={(prUrl) => { setPushedPrUrl(prUrl); setPushModalOpen(false); }}
        />
      )}
    </div>
  );
}

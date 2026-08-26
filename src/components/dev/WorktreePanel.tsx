import { useCallback, useEffect, useState } from "react";
import { desktop, type WorktreeRecord } from "../../lib/desktop";

export function WorktreePanel({ repoPath, onSelect }: { repoPath: string; onSelect: (path: string) => void }) {
  const bridge = desktop();
  const [records, setRecords] = useState<WorktreeRecord[]>([]);
  const [label, setLabel] = useState("task");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!bridge || !repoPath) return;
    setRecords(await bridge.worktrees.list(repoPath));
  }, [bridge, repoPath]);

  useEffect(() => { void load(); }, [load]);

  const enter = async () => {
    if (!bridge || !repoPath || busy) return;
    setBusy(true); setError(null);
    try {
      const record = await bridge.worktrees.enter(repoPath, "HEAD", label);
      setRecords((previous) => [...previous, record]);
      onSelect(record.path);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create worktree");
    } finally { setBusy(false); }
  };

  const exit = async (record: WorktreeRecord, force = false) => {
    if (!bridge || busy) return;
    setBusy(true); setError(null);
    try {
      await bridge.worktrees.exit(record.id, force);
      setRecords((previous) => previous.filter((item) => item.id !== record.id));
      if (repoPath === record.path) onSelect(record.repoPath);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove worktree");
    } finally { setBusy(false); }
  };

  const merge = async (record: WorktreeRecord) => {
    if (!bridge || busy || !window.confirm(`Merge ${record.branch} into ${record.baseRef}?`)) return;
    setBusy(true); setError(null);
    try {
      await bridge.worktrees.merge(record.id);
      setRecords((previous) => previous.filter((item) => item.id !== record.id));
      onSelect(record.repoPath);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not merge worktree");
    } finally { setBusy(false); }
  };

  return (
    <div className="absolute right-3 top-10 z-40 w-80 rounded-xl border border-border/60 bg-canvas p-3 shadow-2xl">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-text">Isolated worktrees</span>
        <button onClick={() => void load()} className="text-[10px] text-muted hover:text-text">Refresh</button>
      </div>
      <div className="flex gap-1.5 mb-3">
        <input value={label} onChange={(event) => setLabel(event.target.value)} className="min-w-0 flex-1 rounded-md border border-border/60 bg-surface2 px-2 py-1.5 text-xs text-text" placeholder="Task label" />
        <button onClick={() => void enter()} disabled={busy} className="rounded-md bg-accent px-2.5 py-1.5 text-xs text-canvas disabled:opacity-50">New</button>
      </div>
      {error && <p className="mb-2 text-[10px] leading-relaxed text-red-400">{error}</p>}
      {records.length === 0 ? <p className="text-[10px] text-muted">No isolated worktrees for this repository.</p> : (
        <div className="space-y-1.5">
          {records.map((record) => (
            <div key={record.id} className="rounded-lg border border-border/40 bg-surface2/30 p-2">
              <button onClick={() => onSelect(record.path)} className="block w-full text-left">
                <div className="truncate text-xs text-text">{record.branch}</div>
                <div className="truncate text-[10px] text-muted">{record.path}</div>
              </button>
              <div className="mt-1.5 flex gap-2">
                <button onClick={() => void merge(record)} disabled={busy} className="text-[10px] text-accent2 hover:underline disabled:opacity-50">Merge</button>
                <button onClick={() => void exit(record)} disabled={busy} className="text-[10px] text-red-400 hover:underline disabled:opacity-50">Remove</button>
                <button onClick={() => void exit(record, true)} disabled={busy} className="text-[10px] text-muted hover:text-red-400 disabled:opacity-50">Force remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

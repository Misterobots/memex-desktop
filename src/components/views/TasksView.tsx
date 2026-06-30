/**
 * TasksView — the mobile Codex task board. Polls GET /v1/tasks (every 5s while
 * any run is in flight), renders a card per run, and opens a detail panel
 * (workers + diff + one-tap approve). Responsive: full-width list on mobile with
 * a full-screen detail overlay; list rail + side detail on desktop.
 */
import { useCallback, useEffect, useState } from "react";
import type { Task } from "../../types/memex";
import { listTasks } from "../../lib/tasks-api";
import { TaskCard } from "../tasks/TaskCard";
import { TaskDetailPanel } from "../tasks/TaskDetailPanel";

export function TasksView() {
  const [tasks,    setTasks]    = useState<Task[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState<"all" | "running">("all");

  const load = useCallback(async () => {
    const list = await listTasks(filter);
    setTasks(list);
    setLoading(false);
  }, [filter]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  // Poll every 5s while any task is running so the board updates live.
  const anyRunning = tasks.some((t) => t.status === "running");
  useEffect(() => {
    if (!anyRunning) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [anyRunning, load]);

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-full md:w-96 flex flex-col border-r border-border/40 flex-shrink-0">
        <div className="p-3 border-b border-border/40 flex items-center justify-between">
          <span className="text-sm font-semibold text-text">Tasks</span>
          <div className="flex items-center gap-1 text-xs">
            {(["all", "running"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2 py-1 rounded-md capitalize transition-colors ${
                  filter === f ? "bg-surface2 text-text" : "text-muted hover:text-text"
                }`}
              >{f}</button>
            ))}
            <button onClick={load} title="Refresh" className="px-2 py-1 rounded-md text-muted hover:text-text">↻</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && tasks.length === 0 && (
            <div className="flex justify-center py-8 text-muted text-sm">Loading…</div>
          )}
          {tasks.map((t) => (
            <TaskCard
              key={t.coordination_id}
              task={t}
              active={selected === t.coordination_id}
              onClick={() => setSelected(t.coordination_id)}
            />
          ))}
          {!loading && tasks.length === 0 && (
            <div className="px-4 py-10 text-center text-xs text-muted leading-relaxed">
              No {filter === "running" ? "running " : ""}tasks yet.<br />
              Start a build in <span className="text-text/70">Swarm</span> mode and it'll appear here.
            </div>
          )}
        </div>
      </div>

      {selected ? (
        <TaskDetailPanel id={selected} onClose={() => setSelected(null)} onChange={load} />
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center text-muted text-sm">
          Select a task to inspect
        </div>
      )}
    </div>
  );
}

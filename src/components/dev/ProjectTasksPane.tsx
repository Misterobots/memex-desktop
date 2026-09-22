import { useCallback, useEffect, useState } from "react";
import type { Task } from "../../types/memex";
import type { DevProject } from "../../lib/dev-projects-api";
import { listDevProjectsDetailed } from "../../lib/dev-projects-api";
import { filterTasks, listTasksDetailed, type TaskFilter } from "../../lib/tasks-api";
import { TaskCard } from "../tasks/TaskCard";
import { TaskDetailPanel } from "../tasks/TaskDetailPanel";
import { NewTaskComposer } from "../tasks/NewTaskComposer";
import { PublishProjectDialog } from "./PublishProjectDialog";

/**
 * The Tasks board, scoped to whichever DevProject the open folder (`cwd`) matches
 * — a compact variant of the old top-level TasksView for DevView's "Tasks" pane
 * rather than a global tab.
 *
 * Scoping matches on `task.dev_project_id === project.id` — the backend now
 * returns dev_project_id for every task with a linked project (git_url-backed or
 * blank/local alike; blank projects are git-initialized at creation and can run
 * tasks against their own local files — see docker_exec.provision_project_dir /
 * coordination/workspace_ops.checkout_local_project on the backend). Earlier this
 * matched `task.repo_url === project.git_url`, which silently returned nothing
 * for every blank project since they have no git_url — that's what this replaces.
 */
export function ProjectTasksPane({ cwd }: { cwd: string | null }) {
  const [projects, setProjects] = useState<DevProject[]>([]);
  const [tasks,     setTasks]    = useState<Task[]>([]);
  const [loading,   setLoading]  = useState(true);
  const [selected,  setSelected] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [loadError, setLoadError] = useState<string | null>(null);

  const activeProject = cwd
    ? projects.find((p) => cwd === p.path || cwd.startsWith(p.path + "/") || cwd.startsWith(p.path + "\\"))
    : undefined;

  useEffect(() => { setFilter("all"); }, [cwd]);

  const load = useCallback(async () => {
    setLoading(true);
    const [projectsResult, tasksResult] = await Promise.all([listDevProjectsDetailed(), listTasksDetailed("all")]);
    if (!projectsResult.ok || !tasksResult.ok) {
      setLoadError("Could not load the Code task board. Check the runtime connection and retry.");
      setLoading(false);
      return;
    }
    setProjects(projectsResult.projects);
    setTasks(tasksResult.tasks);
    setLoadError(null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const scopedTasks = activeProject
    ? tasks.filter((t) => t.dev_project_id === activeProject.id)
    : [];
  const visibleTasks = filterTasks(scopedTasks, filter);

  // Poll while any scoped task is running.
  const anyRunning = scopedTasks.some((t) => t.status === "running");
  useEffect(() => {
    if (!anyRunning) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [anyRunning, load]);

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-full md:w-96 flex flex-col border-r border-border/40 flex-shrink-0">
        <div className="p-3 border-b border-border/40 flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-text">Tasks</div>
            <div className="text-[10px] text-muted truncate">
              {activeProject ? activeProject.name : cwd ? "Not a recognized dev project" : "No folder open"}
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs flex-shrink-0">
            {activeProject?.source === "blank" && (
              <button
                onClick={() => setPublishOpen(true)}
                className="px-2 py-1 rounded-md text-accent hover:bg-accent/10"
              >Publish</button>
            )}
            <button
              onClick={() => { setComposerOpen(true); setSelected(null); }}
              className="px-2 py-1 rounded-md text-accent hover:bg-accent/10"
            >+ New Task</button>
            <button onClick={load} title="Refresh" className="px-2 py-1 rounded-md text-muted hover:text-text">↻</button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1 border-b border-border/40 px-3 py-2" role="group" aria-label="Task filters">
          {(["all", "active", "attention", "completed"] as TaskFilter[]).map((item) => (
            <button key={item} type="button" onClick={() => setFilter(item)} aria-pressed={filter === item} className={`rounded-md px-2 py-1 text-[10px] capitalize ${filter === item ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface2 hover:text-text"}`}>
              {item === "all" ? "All" : item === "attention" ? "Needs attention" : item}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {!loading && loadError && (
            <div className="m-3 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-3 text-xs text-red-200" role="alert">
              <p>{loadError}</p>
              <button type="button" onClick={load} className="mt-2 rounded-md border border-red-300/30 px-2 py-1 text-red-100 hover:bg-red-300/10">Retry</button>
            </div>
          )}
          {loading && (
            <div className="flex justify-center py-8 text-muted text-sm">Loading…</div>
          )}
          {!loading && !loadError && visibleTasks.map((t) => (
            <TaskCard
              key={t.coordination_id}
              task={t}
              active={selected === t.coordination_id}
              onClick={() => { setSelected(t.coordination_id); setComposerOpen(false); }}
            />
          ))}
          {!loading && !loadError && scopedTasks.length > 0 && visibleTasks.length === 0 && (
            <div className="px-4 py-10 text-center text-xs text-muted">No tasks match this filter.</div>
          )}
          {!loading && !loadError && scopedTasks.length === 0 && (
            <div className="px-4 py-10 text-center text-xs text-muted leading-relaxed">
              {!cwd
                ? "Open a folder to see its tasks."
                : !activeProject
                ? "This folder isn't a recognized dev project yet. Create a task against it below and it'll register one."
                : "No tasks yet for this project."}
            </div>
          )}
        </div>
      </div>

      {composerOpen ? (
        <NewTaskComposer
          defaultProjectId={activeProject?.id}
          onClose={() => setComposerOpen(false)}
          onCreated={(coordinationId) => {
            setComposerOpen(false);
            setSelected(coordinationId);
            load();
          }}
        />
      ) : selected ? (
        <TaskDetailPanel id={selected} onClose={() => setSelected(null)} onChange={load} />
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center text-muted text-sm">
          Select a task to inspect
        </div>
      )}

      {publishOpen && activeProject && (
        <PublishProjectDialog
          projectId={activeProject.id}
          projectName={activeProject.name}
          onClose={() => setPublishOpen(false)}
          onPublished={() => load()} // refreshes projects — activeProject.source flips to "git_url"
        />
      )}
    </div>
  );
}

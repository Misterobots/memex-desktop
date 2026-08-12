import { useEffect, useState } from "react";
import type { DevProject } from "../../lib/dev-projects-api";
import { createDevProject, listDevProjects } from "../../lib/dev-projects-api";
import { createTask } from "../../lib/tasks-api";

/**
 * "New Task" composer — the dedicated repo + branch + prompt → go entry
 * point for the Codex-style task board, replacing "start a Swarm-mode chat"
 * as the way a task comes into existence. Deliberately standalone: does not
 * touch InputBar.tsx or any chat-session submit path.
 *
 * Renders in the same right-pane slot TaskDetailPanel occupies in ProjectTasksPane
 * (the project-scoped Tasks pane inside DevView).
 */
export function NewTaskComposer({ onCreated, onClose, defaultProjectId }: {
  onCreated: (coordinationId: string) => void;
  onClose: () => void;
  /** Pre-selects a repo — used when opened from a project-scoped context (DevView's
   *  Tasks pane) so the composer already knows which project this task belongs to. */
  defaultProjectId?: string;
}) {
  const [projects,        setProjects]        = useState<DevProject[]>([]);
  const [loadingProjects, setLoadingProjects]  = useState(true);
  const [projectId,       setProjectId]        = useState<string>(defaultProjectId ?? "");
  const [branch,          setBranch]           = useState("");
  const [prompt,          setPrompt]           = useState("");

  const [showNewRepo, setShowNewRepo] = useState(false);
  const [newRepoName, setNewRepoName] = useState("");
  const [newRepoUrl,  setNewRepoUrl]  = useState("");
  const [newRepoRef,  setNewRepoRef]  = useState("main");
  const [creatingRepo, setCreatingRepo] = useState(false);
  const [newRepoError, setNewRepoError] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState("");

  useEffect(() => {
    (async () => {
      setLoadingProjects(true);
      const loaded = await listDevProjects();
      setProjects(loaded);
      setLoadingProjects(false);
      if (defaultProjectId) {
        const proj = loaded.find((p) => p.id === defaultProjectId);
        if (proj) setBranch(proj.git_ref || "main");
      }
    })();
  }, [defaultProjectId]);

  const selectProject = (id: string) => {
    setProjectId(id);
    const proj = projects.find((p) => p.id === id);
    if (proj) setBranch(proj.git_ref || "main");
  };

  const handleCreateRepo = async () => {
    const name = newRepoName.trim();
    if (!name) { setNewRepoError("Name is required"); return; }
    if (!newRepoUrl.trim()) { setNewRepoError("git_url is required"); return; }
    setNewRepoError("");
    setCreatingRepo(true);
    const project = await createDevProject({
      name,
      source: "git_url",
      git_url: newRepoUrl.trim(),
      git_ref: newRepoRef.trim() || "main",
    });
    setCreatingRepo(false);
    if (!project) { setNewRepoError("Could not create repo — check the git_url and try again."); return; }
    setProjects((prev) => [...prev, project]);
    // Not selectProject(project.id) — `projects` in that closure is still last
    // render's array (setProjects above hasn't re-rendered yet), so the lookup
    // would miss the repo we just created and skip pre-filling the branch.
    // We already have the object right here; use it directly.
    setProjectId(project.id);
    setBranch(project.git_ref || "main");
    setShowNewRepo(false);
    setNewRepoName("");
    setNewRepoUrl("");
    setNewRepoRef("main");
  };

  const handleSubmit = async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) { setError("Describe what you want the task to do."); return; }
    setError("");
    setSubmitting(true);
    const result = await createTask({
      prompt: trimmedPrompt,
      dev_project_id: projectId || undefined,
      branch: projectId ? (branch.trim() || undefined) : undefined,
    });
    setSubmitting(false);
    if (result.coordination_id) {
      onCreated(result.coordination_id);
      return;
    }
    if (result.status === 404) {
      setError("Direct task creation isn't enabled on this server yet.");
    } else {
      setError("Could not create the task. Check your connection and try again.");
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-canvas flex flex-col overflow-hidden md:static md:z-auto md:flex-1">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 flex-shrink-0">
        <div className="text-sm font-medium text-text">New Task</div>
        <button onClick={onClose} className="text-muted hover:text-text p-1 flex-shrink-0">
          <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M2 2l8 8M10 2L2 10" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <div className="text-[10px] text-muted uppercase tracking-wide mb-1.5">Repo</div>
          {loadingProjects ? (
            <div className="text-xs text-muted">Loading repos…</div>
          ) : (
            <select
              value={projectId}
              onChange={(e) => selectProject(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface2 border border-border/60 text-sm text-text
                focus:outline-none focus:ring-1 focus:ring-accent/60"
            >
              <option value="">No repo (unlinked task)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}

          {!showNewRepo ? (
            <button
              onClick={() => setShowNewRepo(true)}
              className="mt-1.5 text-xs text-accent hover:text-accent/80"
            >
              + New repo
            </button>
          ) : (
            <div className="mt-2 space-y-2 rounded-lg border border-border/40 bg-surface2/30 p-3">
              <input
                value={newRepoName}
                onChange={(e) => { setNewRepoName(e.target.value); setNewRepoError(""); }}
                placeholder="Name"
                disabled={creatingRepo}
                className="w-full px-2.5 py-1.5 rounded-md bg-surface2 border border-border/60 text-xs text-text
                  focus:outline-none focus:ring-1 focus:ring-accent/60 disabled:opacity-60"
              />
              <input
                value={newRepoUrl}
                onChange={(e) => { setNewRepoUrl(e.target.value); setNewRepoError(""); }}
                placeholder="https://github.com/owner/repo.git"
                disabled={creatingRepo}
                className="w-full px-2.5 py-1.5 rounded-md bg-surface2 border border-border/60 text-xs text-text font-mono
                  focus:outline-none focus:ring-1 focus:ring-accent/60 disabled:opacity-60"
              />
              <input
                value={newRepoRef}
                onChange={(e) => setNewRepoRef(e.target.value)}
                placeholder="main"
                disabled={creatingRepo}
                className="w-full px-2.5 py-1.5 rounded-md bg-surface2 border border-border/60 text-xs text-text font-mono
                  focus:outline-none focus:ring-1 focus:ring-accent/60 disabled:opacity-60"
              />
              {newRepoError && <p className="text-[10px] text-red-400">{newRepoError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowNewRepo(false); setNewRepoError(""); }}
                  disabled={creatingRepo}
                  className="flex-1 px-2.5 py-1.5 text-xs rounded-md border border-border/60 text-muted hover:text-text disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateRepo}
                  disabled={creatingRepo}
                  className="flex-1 px-2.5 py-1.5 text-xs rounded-md bg-accent text-canvas hover:bg-accentdim disabled:opacity-50"
                >
                  {creatingRepo ? "Creating…" : "Create"}
                </button>
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="text-[10px] text-muted uppercase tracking-wide mb-1.5">Branch</div>
          <input
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="main"
            disabled={!projectId}
            className="w-full px-3 py-2 rounded-lg bg-surface2 border border-border/60 text-sm text-text font-mono
              focus:outline-none focus:ring-1 focus:ring-accent/60 disabled:opacity-40"
          />
        </div>

        <div>
          <div className="text-[10px] text-muted uppercase tracking-wide mb-1.5">Prompt</div>
          <textarea
            value={prompt}
            onChange={(e) => { setPrompt(e.target.value); setError(""); }}
            placeholder="Describe the task…"
            rows={6}
            disabled={submitting}
            className="w-full px-3 py-2 rounded-lg bg-surface2 border border-border/60 text-sm text-text resize-none
              focus:outline-none focus:ring-1 focus:ring-accent/60 disabled:opacity-60"
          />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>

      <div className="flex-shrink-0 border-t border-border/40 p-3">
        <button
          onClick={handleSubmit}
          disabled={submitting || !prompt.trim()}
          className="w-full px-3 py-2 text-sm rounded-lg bg-accent text-canvas hover:bg-accentdim disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create Task"}
        </button>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { desktop } from "../../lib/desktop";
import { ipc } from "../../lib/ipc";

type ProjectFolder = { path: string; name: string; kind: "root" | "folder" };

const IGNORED_FOLDERS = new Set(["node_modules", ".git", "dist", "build", ".next", "__pycache__"]);
const GENERATED_FOLDERS = new Set([
  ".claude", ".pytest_cache", ".venv", "$out", "release", "release-0.1.43", "release-0.1.44",
  "dist-electron", "review-artifacts",
]);

function basename(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

export function WorkspaceProjectsPanel({ cwd, onOpen }: { cwd: string | null; onOpen: (path: string) => void }) {
  const [projects, setProjects] = useState<ProjectFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");

  const load = async () => {
    const bridge = desktop();
    if (!bridge) { setMessage("Projects are available in the desktop app."); setLoading(false); return; }
    setLoading(true); setMessage("");
    try {
      const policy = await bridge.workspace.getPolicy();
      const roots = policy.roots.filter(Boolean);
      const items: ProjectFolder[] = roots.map((path) => ({ path, name: basename(path), kind: "root" }));
      for (const root of roots) {
        try {
          const children = await bridge.fs.readDir(root);
          for (const child of children) {
            if (child.isDir && !IGNORED_FOLDERS.has(child.name.toLowerCase()) && !GENERATED_FOLDERS.has(child.name.toLowerCase())) {
              items.push({ path: child.path, name: child.name, kind: "folder" });
            }
          }
        } catch { /* A missing or protected root stays visible but is not expanded. */ }
      }
      const unique = [...new Map(items.map((item) => [item.path.toLowerCase(), item])).values()]
        .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
      setProjects(unique);
      if (unique.length === 0) setMessage("Add a workspace root or choose a project folder to begin.");
    } catch { setMessage("Could not read your workspace roots."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const chooseFolder = async () => {
    const path = await ipc.openFolder();
    if (!path) return;
    const bridge = desktop();
    try { await bridge?.workspace.addRoot(path); } catch { /* Opening the selected folder still works. */ }
    onOpen(path);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-canvas">
      <div className="max-w-5xl mx-auto p-6 sm:p-8">
        <div className="flex items-start justify-between gap-5 mb-7">
          <div>
            <h1 className="text-2xl font-semibold text-text">Projects</h1>
            <p className="mt-1 text-sm text-muted">Open a workspace project, pick up its threads, files, terminal, and tasks.</p>
          </div>
          <button onClick={() => void chooseFolder()} className="flex-shrink-0 px-3.5 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90">Open folder</button>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="mr-auto text-xs text-muted">Workspace projects</span>
          <label className="sr-only" htmlFor="project-search">Search projects</label>
          <input id="project-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects" className="w-48 rounded-md border border-border/60 bg-surface px-2.5 py-1.5 text-xs text-text placeholder-faint focus:border-accent focus:outline-none" />
          <button onClick={() => void load()} className="text-xs text-accent hover:underline">Refresh</button>
        </div>
        {loading ? <p className="py-10 text-center text-sm text-muted">Loading projects…</p> : projects.filter((project) => {
          const normalized = query.trim().toLowerCase();
          return !normalized || project.name.toLowerCase().includes(normalized) || project.path.toLowerCase().includes(normalized);
        }).length > 0 ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {projects.filter((project) => {
              const normalized = query.trim().toLowerCase();
              return !normalized || project.name.toLowerCase().includes(normalized) || project.path.toLowerCase().includes(normalized);
            }).map((project) => {
              const selected = cwd?.toLowerCase() === project.path.toLowerCase();
              return <button key={project.path} onClick={() => onOpen(project.path)}
                className={`group min-h-28 text-left rounded-2xl border p-4 transition-colors ${selected ? "border-accent/60 bg-accent/5" : "border-border/60 bg-surface hover:bg-surface2 hover:border-border"}`}>
                <div className="flex items-center gap-2 text-text"><span className="text-accent">⌁</span><span className="font-medium truncate">{project.name}</span></div>
                <p className="mt-3 font-mono text-[11px] text-muted truncate" title={project.path}>{project.path}</p>
                <p className="mt-1 text-[11px] text-faint">{project.kind === "root" ? "Workspace root" : "Project folder"}</p>
              </button>;
            })}
          </div>
        ) : <div className="rounded-2xl border border-dashed border-border p-10 text-center"><p className="text-sm text-muted">{query.trim() ? "No projects match that search." : message}</p><button onClick={() => void chooseFolder()} className="mt-4 text-sm text-accent hover:underline">Choose a folder</button></div>}
      </div>
    </div>
  );
}

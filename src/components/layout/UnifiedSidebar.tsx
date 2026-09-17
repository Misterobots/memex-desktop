import { useEffect, useState } from "react";
import { useStore, sessionMatches } from "../../lib/store";
import { desktop } from "../../lib/desktop";
import { SessionList } from "../sidebar/SessionList";

function basename(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

type ProjectFolder = { path: string; name: string; kind: "root" | "folder" };
const IGNORED_FOLDERS = new Set(["node_modules", ".git", "dist", "build", ".next", "__pycache__"]);
const GENERATED_FOLDERS = new Set([
  ".claude", ".pytest_cache", ".venv", "$out", "release", "release-0.1.43", "release-0.1.44",
  "dist-electron", "review-artifacts",
]);

export function UnifiedSidebar() {
  const { sidebarOpen, cwd, setCwd, activeTab, setActiveTab, createSession, sessions, activeSession } = useStore();
  const [projects, setProjects] = useState<ProjectFolder[]>([]);
  const [recentsOpen, setRecentsOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const bridge = desktop();
      if (!bridge) return;
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
          } catch { /* ignore */ }
        }
        const unique = [...new Map(items.map((item) => [item.path.toLowerCase(), item])).values()]
          .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
        if (alive) setProjects(unique);
      } catch { /* ignore */ }
    };
    void load();
    return () => { alive = false; };
  }, []);

  if (!sidebarOpen) return null;

  const topLinks = [
    {
      id: "pulls",
      label: "Pull requests",
      icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="4" cy="3.5" r="1.5" /><circle cx="12" cy="12.5" r="1.5" /><path d="M4 5v5a2.5 2.5 0 002.5 2.5H10M4 5l4 3M8 8h3" /></svg>
    },
    {
      id: "sites",
      label: "Sites",
      icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2.5" width="12" height="11" rx="1.5" /><path d="M2.5 6h11M5 4.25h.01M7 4.25h.01M9 4.25h.01M5 9h6M5 11h3" /></svg>
    },
    {
      id: "schedules",
      label: "Scheduled",
      icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="5.5" /><path d="M8 4.5V8l2.5 1.5" /></svg>
    },
    {
      id: "plugins",
      label: "Plugins",
      icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2a6 6 0 100 12A6 6 0 008 2zM8 5v3l2 2"/></svg> // placeholder
    }
  ];

  const pinnedSessions = sessions.filter(s => s.pinned);

  return (
    <aside className="relative flex w-[248px] flex-shrink-0 flex-col border-r border-border/60 bg-surface text-sm overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      
      {/* Top Links */}
      <nav aria-label="Main navigation" className="px-2 py-3 space-y-0.5">
        <div className="flex items-center justify-between group rounded-md px-3 py-2 hover:bg-surface2 transition-colors cursor-pointer" onClick={() => { setCwd(null); setActiveTab("chat"); createSession("chat"); }}>
          <div className="flex items-center gap-2.5 text-text">
            <span className="text-faint">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 4.5A1.5 1.5 0 013.5 3h9A1.5 1.5 0 0114 4.5v6a1.5 1.5 0 01-1.5 1.5H6l-3 2.5v-2.5H3.5A1.5 1.5 0 012 10.5v-6z" />
              </svg>
            </span>
            <span>New chat</span>
          </div>
          <button className="text-faint hover:text-text opacity-0 group-hover:opacity-100">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 5v6M5 8h6"/></svg>
          </button>
        </div>

        {topLinks.map(link => (
          <button
            key={link.id}
            onClick={() => { setCwd(null); setActiveTab(link.id as any); }}
            className={`w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors ${
              activeTab === link.id && !cwd ? "bg-surface2 text-text" : "text-muted hover:bg-surface2 hover:text-text"
            }`}
          >
            <span className={activeTab === link.id && !cwd ? "text-accent" : "text-faint"}>{link.icon}</span>
            <span>{link.label}</span>
          </button>
        ))}
      </nav>

      {/* Pinned */}
      <div className="px-2 pb-2">
        <h3 className="px-3 py-1.5 text-xs font-semibold text-faint">Pinned</h3>
        <div className="space-y-0.5 mt-0.5">
          {pinnedSessions.length > 0 ? pinnedSessions.map(s => (
            <button key={s.id} onClick={() => { setCwd(s.workspaceKey || null); setActiveTab("chat"); }} className="w-full text-left px-3 py-1.5 rounded-md text-text hover:bg-surface2 truncate text-sm">
              {s.title}
            </button>
          )) : (
            <div className="px-3 py-1.5 text-xs text-muted">No pinned items</div>
          )}
        </div>
      </div>

      {/* Projects */}
      <div className="px-2 pb-2">
        <h3 className="px-3 py-1.5 text-xs font-semibold text-faint">Projects</h3>
        <div className="space-y-0.5 mt-0.5">
          {projects.map(p => {
            const isSelected = cwd === p.path;
            const projectSessions = sessions.filter(s => sessionMatches(s, "code", p.path) && !s.pinned);
            
            return (
              <div key={p.path} className="flex flex-col">
                <div className={`group relative flex items-center justify-between rounded-md px-3 py-1.5 transition-colors cursor-pointer ${isSelected ? "bg-surface2 text-text" : "text-muted hover:bg-surface2 hover:text-text"}`} onClick={() => { setCwd(p.path); setActiveTab("dev"); }}>
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <span className={isSelected ? "text-accent" : "text-faint"}>
                      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M2 3a1 1 0 011-1h3.5l1.5 1.5H13a1 1 0 011 1v8a1 1 0 01-1 1H3a1 1 0 01-1-1V3z"/>
                      </svg>
                    </span>
                    <span className="truncate">{p.name}</span>
                  </div>
                  {isSelected && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                      <button className="p-0.5 text-faint hover:text-text">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M3 8a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm6 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm6 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"/></svg>
                      </button>
                      <button className="p-0.5 text-faint hover:text-text">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12.5 3.5l-9 9M10.5 2.5h3v3M5.5 13.5h-3v-3"/></svg>
                      </button>
                    </div>
                  )}
                </div>
                
                {/* Nested sessions if project is selected or has active items (for now just if selected) */}
                {isSelected && projectSessions.length > 0 && (
                  <div className="ml-6 mt-0.5 space-y-0.5 border-l border-border/60 pl-2">
                    {projectSessions.slice(0, 5).map(s => (
                      <button key={s.id} onClick={() => { activeSession("code", p.path); }} className="w-full text-left px-2 py-1.5 text-xs text-muted hover:text-text hover:bg-surface2 rounded-md truncate">
                        {s.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Recents */}
      <div className="mt-auto px-2 pb-3">
        <button onClick={() => setRecentsOpen(!recentsOpen)} className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-faint hover:text-text rounded-md hover:bg-surface2 transition-colors">
          <span>Recents</span>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={`transition-transform ${recentsOpen ? "rotate-90" : ""}`}>
            <path d="M6 4l4 4-4 4"/>
          </svg>
        </button>
        {recentsOpen && (
          <div className="mt-1">
            <SessionList experience="chat" />
          </div>
        )}
      </div>

    </aside>
  );
}

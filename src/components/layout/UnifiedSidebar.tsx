import { useEffect, useState } from "react";
import { useStore, sessionMatches } from "../../lib/store";
import { desktop } from "../../lib/desktop";
import { SessionList } from "../sidebar/SessionList";
import { CodeUtilityMenu } from "../dev/CodeUtilityMenu";
import { CreateProjectModal } from "./CreateProjectModal";

function basename(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

export interface UserProject {
  id: string;
  name: string;
  path: string;
}

export function UnifiedSidebar() {
  const { sidebarOpen, cwd, setCwd, activeTab, setActiveTab, createSession, sessions, activeSession, setActiveSession, deleteSession } = useStore();
  const [recentsOpen, setRecentsOpen] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [projectMenuOpen, setProjectMenuOpen] = useState<string | null>(null);
  const [sessionMenuOpen, setSessionMenuOpen] = useState<string | null>(null);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);

  const [projects, setProjects] = useState<UserProject[]>(() => {
    try {
      const stored = localStorage.getItem("memex.projects");
      if (stored) return JSON.parse(stored);
      // Migrate from customProjects if any exists
      const legacy = localStorage.getItem("memex.layout.customProjects");
      if (legacy) {
        const parsed = JSON.parse(legacy);
        return parsed.map((p: any) => ({
          id: p.id || `proj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: p.name,
          path: p.path,
        }));
      }
      return [];
    } catch {
      return [];
    }
  });

  const [archivedProjects, setArchivedProjects] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("memex.layout.archivedProjects");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const archiveProject = (projectKey: string) => {
    setArchivedProjects(prev => {
      const next = new Set(prev);
      next.add(projectKey);
      try { localStorage.setItem("memex.layout.archivedProjects", JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  };

  const removeProject = (project: UserProject) => {
    setProjects(prev => {
      const next = prev.filter(p => p.id !== project.id && p.path.toLowerCase() !== project.path.toLowerCase());
      try { localStorage.setItem("memex.projects", JSON.stringify(next)); } catch {}
      return next;
    });
    if (cwd === project.path) {
      setCwd(null);
      setActiveTab("chat");
    }
  };

  const handleCreateProject = (name: string, folderPath: string) => {
    const newProj: UserProject = {
      id: `proj-${Date.now()}`,
      name: name.trim() || basename(folderPath),
      path: folderPath,
    };
    setProjects(prev => {
      const next = [...prev.filter(p => p.path.toLowerCase() !== folderPath.toLowerCase()), newProj];
      try { localStorage.setItem("memex.projects", JSON.stringify(next)); } catch {}
      return next;
    });
    setArchivedProjects(prev => {
      if (!prev.has(newProj.id) && !prev.has(folderPath)) return prev;
      const next = new Set(prev);
      next.delete(newProj.id);
      next.delete(folderPath);
      try { localStorage.setItem("memex.layout.archivedProjects", JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
    desktop()?.workspace.addRoot(folderPath);
    setCwd(folderPath);
    createSession("code", folderPath);
    setActiveTab("dev");
    setExpandedProjects(prev => new Set(prev).add(folderPath));
  };

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try { return Math.min(420, Math.max(180, Number(localStorage.getItem("memex.layout.unifiedSidebarWidth")) || 248)); } catch { return 248; }
  });
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    if (!resizing) {
      try { localStorage.setItem("memex.layout.unifiedSidebarWidth", String(sidebarWidth)); } catch {}
      return;
    }
    const onMove = (e: PointerEvent) => {
      // The left sidebar width matches the pointer's X coordinate (bounded)
      const newWidth = Math.max(180, Math.min(420, e.clientX));
      setSidebarWidth(newWidth);
    };
    const onUp = () => setResizing(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [resizing, sidebarWidth]);

  // Close menus on click outside
  useEffect(() => {
    const handler = () => {
      setProjectMenuOpen(null);
      setSessionMenuOpen(null);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  const toggleProject = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };



  if (!sidebarOpen) return null;


  const pinnedSessions = sessions.filter(s => s.pinned);
  const visibleProjects = projects.filter(p => !archivedProjects.has(p.id) && !archivedProjects.has(p.path));

  return (
    <aside style={{ width: sidebarWidth }} className="relative flex flex-shrink-0 flex-col border-r border-border/60 bg-surface text-sm overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      
      {/* App Toggle and More Menu */}
      <div className="px-3 pt-3 pb-2 flex items-center gap-2">
        <div className="flex bg-surface2 rounded-lg p-1 flex-1">
          <button
            onClick={() => { setCwd(null); setActiveTab("chat"); }}
            className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${activeTab !== "dev" ? "bg-surface text-text shadow-sm" : "text-faint hover:text-text"}`}
          >
            Chat
          </button>
          <button
            onClick={() => { setActiveTab("dev"); }}
            className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${activeTab === "dev" ? "bg-surface text-text shadow-sm" : "text-faint hover:text-text"}`}
          >
            Code
          </button>
        </div>
        <CodeUtilityMenu onNavigate={(tab) => { setCwd(null); setActiveTab(tab); }} />
      </div>

      {/* Top Links (excluding Pull Requests) */}
      <nav aria-label="Main navigation" className="px-2 py-2 space-y-0.5">
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

        <button
          onClick={() => { setCwd(null); setActiveTab("sites"); }}
          className={`w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors ${activeTab === "sites" && !cwd ? "bg-surface2 text-text" : "text-muted hover:bg-surface2 hover:text-text"}`}
        >
          <span className={activeTab === "sites" && !cwd ? "text-accent" : "text-faint"}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2.5" width="12" height="11" rx="1.5" /><path d="M2.5 6h11M5 4.25h.01M7 4.25h.01M9 4.25h.01M5 9h6M5 11h3" /></svg>
          </span>
          <span>Sites</span>
        </button>

        <button
          onClick={() => { setCwd(null); setActiveTab("schedules"); }}
          className={`w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors ${activeTab === "schedules" && !cwd ? "bg-surface2 text-text" : "text-muted hover:bg-surface2 hover:text-text"}`}
        >
          <span className={activeTab === "schedules" && !cwd ? "text-accent" : "text-faint"}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="5.5" /><path d="M8 4.5V8l2.5 1.5" /></svg>
          </span>
          <span>Scheduled</span>
        </button>

        <button
          onClick={() => { setCwd(null); setActiveTab("skills"); }}
          className={`w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors ${activeTab === "skills" && !cwd ? "bg-surface2 text-text" : "text-muted hover:bg-surface2 hover:text-text"}`}
        >
          <span className={activeTab === "skills" && !cwd ? "text-accent" : "text-faint"}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2a6 6 0 100 12A6 6 0 008 2zM8 5v3l2 2"/></svg>
          </span>
          <span>Plugins</span>
        </button>
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
        <div className="flex items-center justify-between px-3 py-1.5">
          <h3 className="text-xs font-semibold text-faint">Projects</h3>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {}}
              className="p-1 text-faint hover:text-text rounded-md hover:bg-surface2 transition-colors"
              title="Project settings"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3 8a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm6 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm6 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"/>
              </svg>
            </button>
            <button
              onClick={() => setCreateProjectOpen(true)}
              className="p-1 text-faint hover:text-text rounded-md hover:bg-surface2 transition-colors"
              title="Create project"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M8 3v10M3 8h10"/>
              </svg>
            </button>
          </div>
        </div>
        <div className="space-y-0.5 mt-0.5">
          {visibleProjects.length === 0 ? (
            <div className="px-3 py-2.5 text-xs text-muted">
              No projects yet. Click <span className="text-accent cursor-pointer hover:underline" onClick={() => setCreateProjectOpen(true)}>+</span> to create one.
            </div>
          ) : (
            visibleProjects.map(p => {
              const isSelected = cwd === p.path;
              const projectSessions = sessions.filter(s => sessionMatches(s, "code", p.path) && !s.pinned);
              const isExpanded = expandedProjects.has(p.path);
              
              return (
                <div key={p.id || p.path} className="flex flex-col">
                  <div
                    className={`group relative flex items-center justify-between rounded-lg px-3 py-1.5 transition-colors cursor-pointer ${
                      isSelected ? "bg-surface2 text-text font-medium" : "text-muted hover:bg-surface2 hover:text-text"
                    }`}
                    onClick={() => {
                      setCwd(p.path);
                      setActiveTab("dev");
                      setExpandedProjects(prev => new Set(prev).add(p.path));
                    }}
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <span className={isSelected ? "text-accent" : "text-faint"}>
                        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M2 3a1 1 0 011-1h3.5l1.5 1.5H13a1 1 0 011 1v8a1 1 0 01-1 1H3a1 1 0 01-1-1V3z"/>
                        </svg>
                      </span>
                      <span className="truncate">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                      <button
                        className="p-1 text-faint hover:text-text hover:bg-surface3 rounded-md transition-colors"
                        title="New chat"
                        onClick={(e) => {
                          e.stopPropagation();
                          createSession("code", p.path);
                          setCwd(p.path);
                          setActiveTab("dev");
                          setExpandedProjects(prev => new Set(prev).add(p.path));
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M8 3v10M3 8h10"/>
                        </svg>
                      </button>
                      <div className="relative">
                        <button
                          className="p-1 text-faint hover:text-text hover:bg-surface3 rounded-md transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            setProjectMenuOpen(projectMenuOpen === (p.id || p.path) ? null : (p.id || p.path));
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M3 8a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm6 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm6 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"/>
                          </svg>
                        </button>
                        {projectMenuOpen === (p.id || p.path) && (
                          <div
                            className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-border/60 bg-surface/95 shadow-xl z-50 py-1 text-xs text-text backdrop-blur-md"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => {
                                createSession("code", p.path);
                                setCwd(p.path);
                                setActiveTab("dev");
                                setProjectMenuOpen(null);
                                setExpandedProjects(prev => new Set(prev).add(p.path));
                              }}
                              className="w-full text-left px-3 py-1.5 hover:bg-surface2"
                            >
                              New chat
                            </button>
                            <button
                              onClick={() => {
                                desktop()?.shell?.openExternal('file:///' + p.path.replace(/\\/g, '/'));
                                setProjectMenuOpen(null);
                              }}
                              className="w-full text-left px-3 py-1.5 hover:bg-surface2"
                            >
                              Open in File Explorer
                            </button>
                            <button
                              onClick={() => {
                                archiveProject(p.id);
                                archiveProject(p.path);
                                setProjectMenuOpen(null);
                                if (cwd === p.path) {
                                  setCwd(null);
                                  setActiveTab("chat");
                                }
                              }}
                              className="w-full text-left px-3 py-1.5 hover:bg-red-500/10 text-red-400"
                            >
                              Archive
                            </button>
                            <button
                              onClick={() => {
                                removeProject(p);
                                setProjectMenuOpen(null);
                              }}
                              className="w-full text-left px-3 py-1.5 hover:bg-red-500/10 text-red-400"
                            >
                              Remove from Projects
                            </button>
                          </div>
                        )}
                      </div>
                      {projectSessions.length > 0 && (
                        <button
                          className="p-1 text-faint hover:text-text hover:bg-surface3 rounded-md transition-colors"
                          onClick={(e) => toggleProject(p.path, e)}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}
                          >
                            <path d="M6 4l4 4-4 4"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                
                {/* Nested sessions */}
                {isExpanded && projectSessions.length > 0 && (
                  <div className="ml-6 mt-0.5 space-y-0.5 border-l border-border/60 pl-2">
                    {projectSessions.map(s => {
                      const isSessionActive = activeSession("code", p.path)?.id === s.id && cwd === p.path && activeTab === "dev";
                      return (
                        <div key={s.id} className="group relative flex items-center justify-between">
                          <button
                            onClick={() => {
                              setCwd(p.path);
                              setActiveSession(s.id);
                              setActiveTab("dev");
                            }}
                            className={`w-full text-left px-2 py-1.5 text-xs rounded-md truncate transition-colors ${
                              isSessionActive ? "text-accent bg-accent/5 font-medium" : "text-muted hover:text-text hover:bg-surface2"
                            }`}
                          >
                            {s.title}
                          </button>
                          <div className="absolute right-1 opacity-0 group-hover:opacity-100 flex items-center gap-0.5 bg-surface2 px-1 rounded-md shadow-sm">
                            <button
                              className="p-1 text-faint hover:text-red-400 rounded-sm"
                              title="Archive"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteSession(s.id);
                              }}
                            >
                              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M3 4l10 0M4 4v10h8V4M6 4V2h4v2"/>
                              </svg>
                            </button>
                            <div className="relative">
                              <button
                                className="p-1 text-faint hover:text-text rounded-sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSessionMenuOpen(sessionMenuOpen === s.id ? null : s.id);
                                }}
                              >
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                  <path d="M3 8a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm6 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm6 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"/>
                                </svg>
                              </button>
                              {sessionMenuOpen === s.id && (
                                <div
                                  className="absolute right-0 top-full mt-1 w-36 rounded-lg border border-border/60 bg-surface/95 shadow-xl z-50 py-1 text-xs text-text backdrop-blur-md"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button onClick={() => { setSessionMenuOpen(null); }} className="w-full text-left px-3 py-1.5 hover:bg-surface2">Duplicate</button>
                                  <button onClick={() => { setSessionMenuOpen(null); }} className="w-full text-left px-3 py-1.5 hover:bg-surface2">Branch</button>
                                  <button onClick={() => { setSessionMenuOpen(null); }} className="w-full text-left px-3 py-1.5 hover:bg-surface2">Pin</button>
                                  <button onClick={() => { deleteSession(s.id); setSessionMenuOpen(null); }} className="w-full text-left px-3 py-1.5 hover:bg-red-500/10 text-red-400">Archive</button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }))}
        </div>
      </div>

      {/* Context-aware sessions for the active experience */}
      {(() => {
        type SessionExp = { experience: import("../../types/memex").ExperienceId; label: string; newLabel: string };
        const EXPERIENCE_MAP: Partial<Record<string, SessionExp>> = {
          chat:     { experience: "chat",           label: "Recents",       newLabel: "New chat" },
          research: { experience: "research",       label: "Research threads", newLabel: "New research" },
          goals:    { experience: "goals",          label: "Routines",      newLabel: "New routine" },
          art:      { experience: "design",         label: "Art sessions",  newLabel: "New session" },
          design:   { experience: "product_design", label: "Design threads",newLabel: "New design" },
          sites:    { experience: "sites",          label: "Site threads",  newLabel: "New site" },
        };
        const exp = EXPERIENCE_MAP[activeTab];
        const sectionLabel = exp?.label ?? "Recents";
        return (
          <div className="mt-auto px-2 pb-3">
            <button onClick={() => setRecentsOpen(!recentsOpen)} className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-faint hover:text-text rounded-md hover:bg-surface2 transition-colors">
              <span>{sectionLabel}</span>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={`transition-transform ${recentsOpen ? "rotate-90" : ""}`}>
                <path d="M6 4l4 4-4 4"/>
              </svg>
            </button>
            {recentsOpen && (
              <div className="mt-1">
                <SessionList
                  experience={exp?.experience ?? "chat"}
                  newLabel={exp?.newLabel ?? "New chat"}
                />
              </div>
            )}
          </div>
        );
      })()}

      <button
        type="button"
        aria-label="Resize sidebar"
        title="Drag to resize sidebar"
        onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setResizing(true); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") { event.preventDefault(); setSidebarWidth((value) => Math.max(180, value - 16)); }
          if (event.key === "ArrowRight") { event.preventDefault(); setSidebarWidth((value) => Math.min(420, value + 16)); }
          if (event.key === "Home") { event.preventDefault(); setSidebarWidth(180); }
          if (event.key === "End") { event.preventDefault(); setSidebarWidth(420); }
        }}
        role="separator"
        aria-orientation="vertical"
        aria-valuemin={180}
        aria-valuemax={420}
        aria-valuenow={sidebarWidth}
        className="absolute -right-1 top-0 z-10 h-full w-2 touch-none cursor-col-resize hover:bg-accent/20 focus:outline-none focus:bg-accent/20"
      />
      <CreateProjectModal
        isOpen={createProjectOpen}
        onClose={() => setCreateProjectOpen(false)}
        onCreate={handleCreateProject}
      />
    </aside>
  );
}

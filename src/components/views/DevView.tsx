import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../../lib/store";
import { FileTree } from "../sidebar/FileTree";
import { ConversationPane } from "../chat/ConversationPane";
import { CODE_MODES, InputBar } from "../layout/InputBar";
import { TerminalPane } from "../dev/TerminalPane";
import { FileEditor } from "../dev/FileEditor";
import { NotebookEditor } from "../dev/NotebookEditor";
import { WorkspaceSafetyBadge } from "../dev/WorkspaceSafetyBadge";
import { ProjectTasksPane } from "../dev/ProjectTasksPane";
import { BrowserView } from "./BrowserView";
import { ipc } from "../../lib/ipc";
import { desktop } from "../../lib/desktop";
import { SessionList } from "../sidebar/SessionList";
import { PrintWorkflowPanel } from "../dev/PrintWorkflowPanel";
import { WorktreePanel } from "../dev/WorktreePanel";
import { CodeUtilityMenu } from "../dev/CodeUtilityMenu";
import { PioneersView } from "../swarm/PioneersView";
import { ReviewPanel } from "../dev/ReviewPanel";

type PrimaryPane = "chat" | "editor" | "tasks" | "print";
type SidePane = "files" | "terminal" | "browser" | "worktrees" | "pioneers" | "review";

export function DevView() {
  const { cwd, setCwd, activeSession, setActiveTab, streamingSessions } = useStore();
  const session    = activeSession("code", cwd || undefined);
  const empty      = !session || session.messages.length === 0;
  const folderName = cwd ? cwd.split(/[/\\]/).filter(Boolean).pop() : null;

  const [primary, setPrimary]       = useState<PrimaryPane>("chat");
  const [sidePane, setSidePane]     = useState<SidePane>("files");
  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const [terminalOpened, setTerminalOpened] = useState(false);
  const [openFile, setOpenFile]     = useState<string | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const [explorerWidth, setExplorerWidth] = useState(() => {
    try { return Math.min(420, Math.max(180, Number(localStorage.getItem("memex.layout.explorerWidth:unselected")) || 240)); } catch { return 240; }
  });
  const [resizingExplorer, setResizingExplorer] = useState(false);
  const explorerRef = useRef<HTMLElement>(null);
  const explorerScopeRef = useRef(cwd || "unselected");
  const workspaceRef = useRef<HTMLDivElement>(null);
  const sideMenuRef = useRef<HTMLDivElement>(null);

  const termId = `term-${session?.id ?? `project-${cwd || "unselected"}`}`;

  useEffect(() => {
    if (!sideMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!sideMenuRef.current?.contains(e.target as Node)) setSideMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [sideMenuOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmd = isMac ? e.metaKey : e.ctrlKey;
      if (cmd && e.key === "`") { e.preventDefault(); if (!rightSidebarOpen) setRightSidebarOpen(true); setSidePane("terminal"); setTerminalOpened(true); }
      if (cmd && e.key.toLowerCase() === "t") { e.preventDefault(); if (!rightSidebarOpen) setRightSidebarOpen(true); setSidePane("browser"); }
      if (cmd && e.key.toLowerCase() === "p") { e.preventDefault(); if (!rightSidebarOpen) setRightSidebarOpen(true); setSidePane("files"); }
      if (cmd && e.shiftKey && e.key.toLowerCase() === "g") { e.preventDefault(); if (!rightSidebarOpen) setRightSidebarOpen(true); setSidePane("review"); }
      if (cmd && e.altKey && e.key.toLowerCase() === "s") { e.preventDefault(); if (!rightSidebarOpen) setRightSidebarOpen(true); setSidePane("pioneers"); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [rightSidebarOpen]);

  const confirmNavigation = useCallback(() => {
    if (!editorDirty) return true;
    return window.confirm("This editor has unsaved changes. Continue navigation? Your in-memory draft will remain available if you return to the file.");
  }, [editorDirty]);
  const changePrimary = useCallback((next: PrimaryPane) => {
    if (next === primary || confirmNavigation()) setPrimary(next);
  }, [confirmNavigation, primary]);
  const changeProject = useCallback((next: string) => {
    if (next === cwd || confirmNavigation()) {
      setEditorDirty(false);
      setCwd(next);
    }
  }, [confirmNavigation, cwd, setCwd]);
  const openFileFromTree = useCallback((path: string) => {
    if (path === openFile || confirmNavigation()) {
      setOpenFile(path);
      setEditorDirty(false);
      setPrimary("editor");
    }
  }, [confirmNavigation, openFile]);
  const stopTerminal = () => {
    // Hiding/switching the terminal preserves its PTY. This is the explicit
    // user action that terminates the process and clears the retained mount.
    void desktop()?.pty.kill(termId);
    setTerminalOpened(false);
    setSidePane((pane) => pane === "terminal" ? "files" : pane);
  };

  // The composer moves when the primary or side pane changes even
  // though its own height may stay the same. Let the floating AgentDock
  // recompute its viewport-safe clearance immediately after those layout
  // transitions.
  useEffect(() => {
    window.dispatchEvent(new Event("memex:layout-change"));
  }, [primary, sidePane]);
  useEffect(() => {
    const scope = cwd || "unselected";
    if (explorerScopeRef.current !== scope) {
      explorerScopeRef.current = scope;
      try {
        const saved = Number(localStorage.getItem(`memex.layout.explorerWidth:${scope}`));
        if (saved) setExplorerWidth(Math.min(420, Math.max(180, saved)));
      } catch { /* storage unavailable */ }
      return;
    }
    try {
      localStorage.setItem(`memex.layout.explorerWidth:${scope}`, String(explorerWidth));
    } catch { /* storage unavailable */ }
  }, [cwd, explorerWidth]);
  useEffect(() => {
    if (!resizingExplorer) return;
    const resize = (event: PointerEvent) => {
      const bounds = explorerRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const newWidth = bounds.right - event.clientX;
      setExplorerWidth(Math.round(Math.min(420, Math.max(180, newWidth))));
    };
    const stop = () => setResizingExplorer(false);
    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stop);
    return () => { window.removeEventListener("pointermove", resize); window.removeEventListener("pointerup", stop); };
  }, [resizingExplorer]);


  return (
    <div className="flex flex-1 min-h-0">
      {/* File explorer moved to the right */}

      {/* Main workspace */}
      <div className="relative flex flex-col flex-1 min-w-0">
        {/* Top toolbar */}
        <div className="flex items-center px-3 h-9 border-b border-border/60 bg-surface flex-shrink-0">
          <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden flex-1">
            {(["chat", "editor", "tasks", "print"] as PrimaryPane[]).map((p) => (
              <button
                key={p}
                onClick={() => changePrimary(p)}
                className={`shrink-0 px-2.5 py-1 text-xs rounded-md transition-colors capitalize ${
                  primary === p ? "bg-surface2 text-text" : "text-faint hover:text-text"
                }`}
              >
                {p === "editor" ? (openFile ? openFile.split(/[/\\]/).pop() : "Editor") : p === "tasks" ? "Tasks" : p === "print" ? "Print" : "Workspace"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 relative pl-2">
            {/* Side Panel Toggle */}
            <div className="flex items-center gap-0.5 mr-2 border-r border-border/60 pr-2">
              <button
                onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
                className={`p-1.5 rounded-md transition-colors ${rightSidebarOpen ? "text-accent bg-accent/10" : "text-faint hover:text-text hover:bg-surface2"}`}
                title="Toggle Side Panel"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="2" y="3" width="12" height="10" rx="1.5" />
                  <path d="M10 3v10" />
                </svg>
              </button>
            </div>
            <CodeUtilityMenu onNavigate={(tab) => { if (confirmNavigation()) setActiveTab(tab); }} />
            <WorkspaceSafetyBadge />
          </div>
        </div>

        {/* Pane area */}
        <div ref={workspaceRef} className="flex flex-col flex-1 min-h-0 relative">
          {/* Primary pane */}
          <div className="flex flex-col flex-1 min-h-0 h-full">
            {primary === "print" ? (
              <PrintWorkflowPanel />
            ) : primary === "tasks" ? (
              <ProjectTasksPane cwd={cwd} />
            ) : primary === "editor" ? (
              openFile ? (
                openFile.toLowerCase().endsWith(".ipynb") ? (
                  <NotebookEditor path={openFile} onDirtyChange={setEditorDirty} onClose={() => { setOpenFile(null); setEditorDirty(false); setPrimary("chat"); }} />
                ) : (
                  <FileEditor path={openFile} onDirtyChange={setEditorDirty} onClose={() => { setOpenFile(null); setEditorDirty(false); setPrimary("chat"); }} />
                )
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center px-6 select-none text-center">
                  <div className="text-4xl text-accent/30 mb-4 font-mono">{"{ }"}</div>
                  <h2 className="text-lg text-text font-medium mb-1">No file open</h2>
                  <p className="text-muted text-sm max-w-sm">
                    Select a file from the Files side panel to start editing.
                  </p>
                </div>
              )
            ) : (
              <div className="flex flex-col flex-1 min-h-0">
                {empty ? (
                  <div className="flex-1 flex flex-col items-center justify-center px-6 select-none">
                    <div className="max-w-conversation w-full text-center">
                      <div className="text-4xl text-accent mb-4 font-mono opacity-80">{"</>"}</div>
                      <h1 className="text-xl text-text font-medium mb-2">Code with the Collective</h1>
                      <p className="text-muted text-sm max-w-sm mx-auto">
                        {cwd
                          ? `Working in ${folderName}. Ask the agent to read, edit, and run code in this folder.`
                          : "Open a folder, then describe what you want to build or change."}
                      </p>
                    </div>
                  </div>
                ) : (
                  <ConversationPane experience="code" workspaceKey={cwd || undefined} />
                )}
                {/* Floating Activity Status */}
                {session?.id && streamingSessions[session.id] && (
                  <div className="absolute bottom-[80px] left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-surface/90 backdrop-blur border border-accent/40 text-text px-4 py-1.5 rounded-full shadow-lg pointer-events-none">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-accent">Working</span>
                  </div>
                )}

                <InputBar
                  experience="code"
                  workspaceKey={cwd || undefined}
                  modeOptions={CODE_MODES}
                  defaultMode="swarm"
                  extraFlags={{ dev_mode: true }}
                  disabledReason={cwd ? undefined : "Open a project folder to start coding"}
                  placeholder={cwd ? `Ask the agent to change ${folderName}…` : "Open a folder to start…"}
                />
              </div>
            )}
          </div>
          {/* Keep an opened terminal mounted while it is not active.
              Terminal visibility is a layout choice; unmounting here would terminate the user's PTY. */}
          {terminalOpened && sidePane !== "terminal" && (
            <div className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0" aria-hidden="true">
              <TerminalPane id={termId} cwd={cwd || undefined} />
            </div>
          )}
        </div>
      </div>
      
      {/* File explorer / Side panel */}
      {rightSidebarOpen && (
        <aside ref={explorerRef} style={{ width: explorerWidth }} className="relative flex-shrink-0 border-l border-border/60 bg-surface flex flex-col">
          <div className="flex items-center justify-between px-3 h-9 border-b border-border/60 bg-surface flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-xs text-text font-medium bg-surface2 px-2.5 py-1 rounded-md border border-border/40">
                <span className="capitalize">{sidePane === "files" ? (folderName ?? "Explorer") : sidePane}</span>
                <button
                  onClick={() => setRightSidebarOpen(false)}
                  className="ml-1 text-faint hover:text-text"
                  title="Close side panel"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4.28 3.22a.75.75 0 00-1.06 1.06L6.94 8l-3.72 3.72a.75.75 0 101.06 1.06L8 9.06l3.72 3.72a.75.75 0 101.06-1.06L9.06 8l3.72-3.72a.75.75 0 00-1.06-1.06L8 6.94 4.28 3.22z"/></svg>
                </button>
              </div>
              <div className="relative" ref={sideMenuRef}>
                <button
                  onClick={() => setSideMenuOpen(!sideMenuOpen)}
                  className="text-faint hover:text-text transition-colors p-1 rounded-md hover:bg-surface2"
                  title="Open view..."
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 3v10M3 8h10"/></svg>
                </button>
                {sideMenuOpen && (
                  <div className="absolute top-full left-0 mt-1 w-48 rounded-lg border border-border/60 bg-surface/95 shadow-xl z-50 py-1 text-xs text-text backdrop-blur-md">
                    <button onClick={() => { setSidePane("review"); setSideMenuOpen(false); }} className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-surface2 transition-colors">
                      <span className="flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2a6 6 0 100 12A6 6 0 008 2zM8 5v3l2 2"/></svg> Review</span>
                      <span className="text-faint">Ctrl+Shift+G</span>
                    </button>
                    <button onClick={() => { setSidePane("terminal"); setSideMenuOpen(false); setTerminalOpened(true); }} className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-surface2 transition-colors">
                      <span className="flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 4l4 4-4 4M8 12h5"/></svg> Terminal</span>
                      <span className="text-faint">Ctrl+`</span>
                    </button>
                    <button onClick={() => { setSidePane("browser"); setSideMenuOpen(false); }} className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-surface2 transition-colors">
                      <span className="flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="5"/><path d="M3 8h10M8 3v10"/></svg> Browser</span>
                      <span className="text-faint">Ctrl+T</span>
                    </button>
                    <button onClick={() => { setSidePane("files"); setSideMenuOpen(false); }} className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-surface2 transition-colors">
                      <span className="flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M2 3h12a1 1 0 011 1v8a1 1 0 01-1 1H2a1 1 0 01-1-1V4a1 1 0 011-1zm1 1v8h3V4H3zm4 8h7V4H7v8z"/></svg> Files</span>
                      <span className="text-faint">Ctrl+P</span>
                    </button>
                    <button onClick={() => { setSidePane("worktrees"); setSideMenuOpen(false); }} className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-surface2 transition-colors">
                      <span className="flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 3v10M12 3v10M4 8h8"/></svg> Worktrees</span>
                    </button>
                    <button onClick={() => { setSidePane("pioneers"); setSideMenuOpen(false); }} className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-surface2 transition-colors">
                      <span className="flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="5" r="2"/><path d="M4 14c0-2.2 2-4 4-4s4 1.8 4 4"/></svg> Pioneers</span>
                      <span className="text-faint">Ctrl+Alt+S</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {sidePane === "terminal" && (
                <button
                  type="button"
                  onClick={stopTerminal}
                  className="rounded px-2 py-1 text-[10px] font-medium text-red-300 hover:bg-red-400/10 hover:text-red-200"
                  title="Terminate the terminal process"
                >Stop process</button>
              )}
              {sidePane === "files" && (
                <button
                  onClick={() => ipc.openFolder().then((p) => p && changeProject(p))}
                  className="text-faint hover:text-accent transition-colors flex-shrink-0"
                  title="Open folder"
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25V5.75A1.75 1.75 0 0014.25 4H8.5L6.75 2.25A1.75 1.75 0 005.56 1.75H1.75z" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto flex flex-col min-h-0 relative">
            {sidePane === "files" && (
              <>
                {cwd && (
                  <div className="border-b border-border/60 max-h-[42%] overflow-y-auto">
                    <SessionList experience="code" workspaceKey={cwd} newLabel="New agent thread" />
                  </div>
                )}
                <div className="flex-1 overflow-y-auto py-1 min-h-0">
                  {cwd ? (
                    <FileTree root={cwd} onFileClick={openFileFromTree} />
                  ) : (
                    <div className="px-3 py-6 text-center">
                      <p className="text-faint text-xs mb-3">Open a folder to start</p>
                      <button
                        onClick={() => ipc.openFolder().then((p) => p && changeProject(p))}
                        className="px-3 py-1.5 text-xs text-accent border border-accent/40 rounded-lg hover:bg-accent/10 transition-colors"
                      >
                        Open folder
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
            
            {sidePane === "terminal" && (
              <TerminalPane id={termId} cwd={cwd || undefined} className="flex-1 min-h-0 h-full" />
            )}
            
            {sidePane === "browser" && (
              <BrowserView />
            )}
            
            {sidePane === "worktrees" && cwd && (
              <div className="flex-1 min-h-0 h-full overflow-y-auto relative p-3">
                <WorktreePanel repoPath={cwd} onSelect={(path) => { changeProject(path); }} />
              </div>
            )}
            
            {sidePane === "review" && (
              <ReviewPanel />
            )}

            {sidePane === "pioneers" && session && (
              <div className="flex-1 h-full min-h-0 overflow-hidden relative">
                <PioneersView
                  events={session.messages.flatMap((message) => message.events)}
                  active={Boolean(streamingSessions[session.id])}
                  workspaceKey={cwd || "unselected"}
                />
              </div>
            )}
          </div>
          <button
            type="button"
            aria-label="Resize explorer panel"
            title="Drag to resize explorer"
            onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setResizingExplorer(true); }}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") { event.preventDefault(); setExplorerWidth((value) => Math.min(420, value + 16)); }
              if (event.key === "ArrowRight") { event.preventDefault(); setExplorerWidth((value) => Math.max(180, value - 16)); }
              if (event.key === "Home") { event.preventDefault(); setExplorerWidth(180); }
              if (event.key === "End") { event.preventDefault(); setExplorerWidth(420); }
            }}
            role="separator"
            aria-orientation="vertical"
            aria-valuemin={180}
            aria-valuemax={420}
            aria-valuenow={explorerWidth}
            className="absolute -left-1 top-0 z-10 h-full w-2 touch-none cursor-col-resize hover:bg-accent/20 focus:outline-none focus:bg-accent/20"
          />
        </aside>
      )}

      {/* PioneersView moved to side panel */}
    </div>
  );
}

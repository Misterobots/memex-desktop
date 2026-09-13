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
import { WorkspaceProjectsPanel } from "../dev/WorkspaceProjectsPanel";
import { CodeUtilityMenu } from "../dev/CodeUtilityMenu";
import { PioneersView } from "../swarm/PioneersView";
import { explorerWidthForPointer } from "./dev-layout";

type PrimaryPane = "projects" | "chat" | "editor" | "tasks" | "print";
type BottomPane  = "terminal" | "browser" | "none";

export function DevView() {
  const { cwd, setCwd, sidebarOpen, activeSession, setActiveTab, streamingSessions } = useStore();
  const session    = activeSession("code", cwd);
  const empty      = !session || session.messages.length === 0;
  const folderName = cwd ? cwd.split(/[/\\]/).filter(Boolean).pop() : null;

  const [primary, setPrimary]       = useState<PrimaryPane>(cwd ? "chat" : "projects");
  const [bottomPane, setBottomPane] = useState<BottomPane>("none");
  const [terminalOpened, setTerminalOpened] = useState(false);
  const [openFile, setOpenFile]     = useState<string | null>(null);
  const [worktreesOpen, setWorktreesOpen] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const [bottomHeight, setBottomHeight] = useState(40);
  const [resizing, setResizing] = useState(false);
  const [explorerWidth, setExplorerWidth] = useState(() => {
    try { return Math.min(420, Math.max(180, Number(localStorage.getItem("memex.layout.explorerWidth:unselected")) || 240)); } catch { return 240; }
  });
  const [resizingExplorer, setResizingExplorer] = useState(false);
  const explorerRef = useRef<HTMLElement>(null);
  const explorerScopeRef = useRef(cwd || "unselected");
  const workspaceRef = useRef<HTMLDivElement>(null);

  const termId = `term-${session?.id ?? `project-${cwd || "unselected"}`}`;

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
  const openProject = useCallback((path: string) => {
    if (!confirmNavigation()) return;
    setEditorDirty(false);
    setCwd(path);
    setPrimary("chat");
  }, [confirmNavigation, setCwd]);

  const toggleTerminal = () => {
    setTerminalOpened(true);
    setBottomPane((p) => (p === "terminal" ? "none" : "terminal"));
  };
  const toggleBrowser = () =>
    setBottomPane((p) => (p === "browser" ? "none" : "browser"));
  const stopTerminal = () => {
    // Hiding/switching the terminal preserves its PTY. This is the explicit
    // user action that terminates the process and clears the retained mount.
    void desktop()?.pty.kill(termId);
    setTerminalOpened(false);
    setBottomPane((pane) => pane === "terminal" ? "none" : pane);
  };
  useEffect(() => {
    if (!resizing) return;
    const resize = (event: PointerEvent) => {
      const bounds = workspaceRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const next = ((bounds.bottom - event.clientY) / bounds.height) * 100;
      setBottomHeight(Math.round(Math.min(70, Math.max(25, next))));
    };
    const stop = () => setResizing(false);
    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stop);
    return () => {
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stop);
    };
  }, [resizing]);
  useEffect(() => {
    try { const saved = Number(localStorage.getItem(`memex.layout.bottomHeight:${cwd || "unselected"}`)); if (saved) setBottomHeight(Math.min(70, Math.max(25, saved))); } catch { /* storage unavailable */ }
  }, [cwd]);
  useEffect(() => {
    try { localStorage.setItem(`memex.layout.bottomHeight:${cwd || "unselected"}`, String(bottomHeight)); } catch { /* storage unavailable */ }
  }, [bottomHeight, cwd]);
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
      // The explorer is nested after the app navigation. Use its own left edge
      // instead of viewport X so resizing does not jump when the app sidebar is
      // visible, hidden, or rendered at a different scale.
      setExplorerWidth(explorerWidthForPointer(event.clientX, bounds.left, window.innerWidth));
    };
    const stop = () => setResizingExplorer(false);
    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stop);
    return () => { window.removeEventListener("pointermove", resize); window.removeEventListener("pointerup", stop); };
  }, [resizingExplorer]);


  return (
    <div className="flex flex-1 min-h-0">
      {/* File explorer */}
      {sidebarOpen && (
        <aside ref={explorerRef} style={{ width: explorerWidth }} className="relative flex-shrink-0 border-r border-border/60 bg-surface flex flex-col">
          <div className="flex items-center justify-between px-3 h-9 border-b border-border/60">
            <span className="text-xs text-faint font-medium truncate">
              {folderName ?? "Explorer"}
            </span>
            <button
              onClick={() => ipc.openFolder().then((p) => p && changeProject(p))}
              className="text-faint hover:text-accent transition-colors flex-shrink-0"
              title="Open folder"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25V5.75A1.75 1.75 0 0014.25 4H8.5L6.75 2.25A1.75 1.75 0 005.56 1.75H1.75z" />
              </svg>
            </button>
          </div>
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
          <button
            type="button"
            aria-label="Resize explorer panel"
            title="Drag to resize explorer"
            onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setResizingExplorer(true); }}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") { event.preventDefault(); setExplorerWidth((value) => Math.max(180, value - 16)); }
              if (event.key === "ArrowRight") { event.preventDefault(); setExplorerWidth((value) => Math.min(420, value + 16)); }
              if (event.key === "Home") { event.preventDefault(); setExplorerWidth(180); }
              if (event.key === "End") { event.preventDefault(); setExplorerWidth(420); }
            }}
            role="separator"
            aria-orientation="vertical"
            aria-valuemin={180}
            aria-valuemax={420}
            aria-valuenow={explorerWidth}
            className="absolute -right-1 top-0 z-10 h-full w-2 touch-none cursor-col-resize hover:bg-accent/20 focus:outline-none focus:bg-accent/20"
          />
        </aside>
      )}

      {/* Main workspace */}
      <div className="relative flex flex-col flex-1 min-w-0">
        {/* Top toolbar */}
        <div className="flex min-w-0 flex-nowrap items-center gap-1 overflow-x-auto px-3 h-9 border-b border-border/60 bg-surface flex-shrink-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(["projects", "chat", "editor", "tasks", "print"] as PrimaryPane[]).map((p) => (
            <button
              key={p}
              onClick={() => changePrimary(p)}
              className={`shrink-0 px-2.5 py-1 text-xs rounded-md transition-colors capitalize ${
                primary === p ? "bg-surface2 text-text" : "text-faint hover:text-text"
              }`}
            >
              {p === "projects" ? "Projects" : p === "editor" ? (openFile ? openFile.split(/[/\\]/).pop() : "Editor") : p === "tasks" ? "Tasks" : p === "print" ? "Print" : "Agent"}
            </button>
          ))}
          <div className="flex-1" />
          <CodeUtilityMenu onProjects={() => changePrimary("projects")} onNavigate={(tab) => { if (confirmNavigation()) setActiveTab(tab); }} />
          <WorkspaceSafetyBadge />
          {cwd && <button
            onClick={() => setWorktreesOpen((open) => !open)}
            className={`px-2.5 py-1 text-xs rounded-md transition-colors ${worktreesOpen ? "text-accent bg-accent/10" : "text-faint hover:text-text"}`}
            title="Create and switch isolated Git worktrees"
          >Worktrees</button>}
          <button
            onClick={toggleTerminal}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md transition-colors ${
              bottomPane === "terminal" ? "text-accent bg-accent/10" : "text-faint hover:text-text"
            }`}
            title="Toggle terminal"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="1.5" y="2" width="13" height="12" rx="1.5" />
              <path d="M4 6l3 2-3 2M8 10h4" />
            </svg>
            Terminal
          </button>
          <button
            onClick={toggleBrowser}
            disabled={!cwd}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              bottomPane === "browser" ? "text-accent bg-accent/10" : "text-faint hover:text-text"
            }`}
            title={cwd ? "Toggle project browser" : "Open a project folder to use Browser"}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="8" cy="8" r="5.5" />
              <path d="M2.5 8h11M8 2.5a8.5 8.5 0 010 11M8 2.5a8.5 8.5 0 000 11" />
            </svg>
            Browser
          </button>
        </div>

        {worktreesOpen && cwd && <WorktreePanel repoPath={cwd} onSelect={(path) => { changeProject(path); setWorktreesOpen(false); }} />}

        {/* Pane area */}
        <div ref={workspaceRef} className={`flex flex-col flex-1 min-h-0 ${resizing ? "select-none cursor-row-resize" : ""}`}>
          {/* Primary pane */}
          <div className={`flex flex-col flex-1 min-h-0 ${bottomPane !== "none" ? "border-b border-border/60" : ""}`}
               style={{ height: bottomPane !== "none" ? `${100 - bottomHeight}%` : "100%" }}>
            {primary === "projects" ? (
              <WorkspaceProjectsPanel cwd={cwd} onOpen={openProject} />
            ) : primary === "print" ? (
              <PrintWorkflowPanel />
            ) : primary === "tasks" ? (
              <ProjectTasksPane cwd={cwd} />
            ) : primary === "editor" && openFile ? (
              openFile.toLowerCase().endsWith(".ipynb") ? (
                <NotebookEditor path={openFile} onDirtyChange={setEditorDirty} onClose={() => { setOpenFile(null); setEditorDirty(false); setPrimary("chat"); }} />
              ) : (
                <FileEditor path={openFile} onDirtyChange={setEditorDirty} onClose={() => { setOpenFile(null); setEditorDirty(false); setPrimary("chat"); }} />
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
                  <ConversationPane experience="code" workspaceKey={cwd} />
                )}
                <InputBar
                  experience="code"
                  workspaceKey={cwd}
                  modeOptions={CODE_MODES}
                  defaultMode="swarm"
                  extraFlags={{ dev_mode: true }}
                  disabledReason={cwd ? undefined : "Open a project folder to start coding"}
                  placeholder={cwd ? `Ask the agent to change ${folderName}…` : "Open a folder to start…"}
                />
              </div>
            )}
          </div>

          {/* Project tools live alongside the work, rather than as app-wide
              destinations: terminal, browser, files, and task review all
              describe the same open project. */}
          {bottomPane !== "none" && (
            <div style={{ height: `${bottomHeight}%` }} className="flex flex-col min-h-0">
              <div className="flex items-center px-3 h-8 bg-surface border-b border-border/60 flex-shrink-0">
                <button
                  role="separator"
                  aria-label="Resize project tool pane"
                  aria-orientation="horizontal"
                  aria-valuemin={25}
                  aria-valuemax={70}
                  aria-valuenow={bottomHeight}
                  onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setResizing(true); }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowUp") { event.preventDefault(); setBottomHeight((value) => Math.min(70, value + 5)); }
                    if (event.key === "ArrowDown") { event.preventDefault(); setBottomHeight((value) => Math.max(25, value - 5)); }
                    if (event.key === "Home") { event.preventDefault(); setBottomHeight(25); }
                    if (event.key === "End") { event.preventDefault(); setBottomHeight(70); }
                  }}
                  className="h-5 w-4 -ml-2 mr-1 touch-none cursor-row-resize rounded hover:bg-accent/20 focus:outline-none focus:bg-accent/20"
                  title="Drag to resize project tools"
                />
                <span className="text-xs text-faint font-medium">{bottomPane === "terminal" ? "Terminal" : `Browser · ${folderName ?? "Project"}`}</span>
                <div className="flex-1" />
                {bottomPane === "terminal" && <button
                  type="button"
                  onClick={stopTerminal}
                  className="mr-2 rounded px-2 py-1 text-[10px] font-medium text-red-300 hover:bg-red-400/10 hover:text-red-200"
                  title="Terminate the terminal process"
                >Stop process</button>}
                <button
                  onClick={() => setBottomPane("none")}
                  aria-label={`Hide ${bottomPane}`}
                  title={`Hide ${bottomPane}`}
                  className="text-faint hover:text-text transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M2 2l12 12M14 2L2 14" />
                  </svg>
                </button>
              </div>
              {bottomPane === "terminal" ? (
                <TerminalPane id={termId} cwd={cwd || undefined} className="flex-1 min-h-0" />
              ) : (
                <BrowserView />
              )}
            </div>
          )}
          {/* Keep an opened terminal mounted while another bottom tool is
              visible (or the split is hidden). Terminal visibility is a layout
              choice; unmounting here would terminate the user's PTY. */}
          {terminalOpened && bottomPane !== "terminal" && (
            <div className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0" aria-hidden="true">
              <TerminalPane id={termId} cwd={cwd || undefined} />
            </div>
          )}
        </div>
      </div>
      {session && <PioneersView
        events={session.messages.flatMap((message) => message.events)}
        active={Boolean(streamingSessions[session.id])}
        workspaceKey={cwd || "unselected"}
      />}
    </div>
  );
}

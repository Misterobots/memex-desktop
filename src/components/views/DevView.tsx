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
import { SessionList } from "../sidebar/SessionList";
import { PrintWorkflowPanel } from "../dev/PrintWorkflowPanel";
import { WorktreePanel } from "../dev/WorktreePanel";

import { PioneersView } from "../swarm/PioneersView";
import { ReviewPanel } from "../dev/ReviewPanel";

type PrimaryPane = "chat" | "editor" | "tasks" | "print";

export function DevView() {
  const { cwd, setCwd, activeSession, streamingSessions, sidePanelTabs, activeSideTabId, sidePanelOpen, setSidePanelTabs, setActiveSideTabId, setSidePanelOpen } = useStore();
  const session    = activeSession("code", cwd || undefined);
  const empty      = !session || session.messages.length === 0;
  const folderName = cwd ? cwd.split(/[/\\]/).filter(Boolean).pop() : null;

  const [primary, setPrimary]       = useState<PrimaryPane>("chat");
  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const [terminalOpened, setTerminalOpened] = useState(false);
  const [openFile, setOpenFile]     = useState<string | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const [explorerWidth, setExplorerWidth] = useState(() => {
    try { return Math.min(720, Math.max(200, Number(localStorage.getItem("memex.layout.explorerWidth:unselected")) || 340)); } catch { return 340; }
  });
  const [resizingExplorer, setResizingExplorer] = useState(false);
  const explorerRef = useRef<HTMLElement>(null);
  const explorerScopeRef = useRef(cwd || "unselected");
  const workspaceRef = useRef<HTMLDivElement>(null);
  const sideMenuRef = useRef<HTMLDivElement>(null);
  const poppedForMessageRef = useRef<string | null>(null);

  const termId = `term-${session?.id ?? `project-${cwd || "unselected"}`}`;

  useEffect(() => {
    if (!resizingExplorer) {
      try { localStorage.setItem(`memex.layout.explorerWidth:${explorerScopeRef.current}`, String(explorerWidth)); } catch {}
      return;
    }
    const onMove = (e: PointerEvent) => {
      const maxWidth = Math.max(380, window.innerWidth - 300);
      const newWidth = Math.max(200, Math.min(maxWidth, window.innerWidth - e.clientX));
      setExplorerWidth(newWidth);
    };
    const onUp = () => setResizingExplorer(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [resizingExplorer, explorerWidth]);

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
      if (cmd && e.key === 'b') {
        e.preventDefault();
        setSidePanelOpen(!sidePanelOpen);
      }
      if (cmd && e.key === '`') { e.preventDefault(); if (!sidePanelOpen) setSidePanelOpen(true); openSideTab("terminal", "Terminal"); setTerminalOpened(true); }
      if (cmd && e.key.toLowerCase() === "t") { e.preventDefault(); if (!sidePanelOpen) setSidePanelOpen(true); openSideTab("browser", "Browser"); }
      if (cmd && e.key.toLowerCase() === "p") { e.preventDefault(); if (!sidePanelOpen) setSidePanelOpen(true); openSideTab("files", "Files"); }
      if (cmd && e.shiftKey && e.key.toLowerCase() === "g") { e.preventDefault(); if (!sidePanelOpen) setSidePanelOpen(true); openSideTab("review", "Review"); }
      if (cmd && e.altKey && e.key.toLowerCase() === "s") { e.preventDefault(); if (!sidePanelOpen) setSidePanelOpen(true); openSideTab("pioneers", "Pioneers"); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [sidePanelOpen, sidePanelTabs, setActiveSideTabId, setSidePanelTabs]);

  const openSideTab = useCallback((type: "editor"|"terminal"|"browser"|"files"|"review"|"chat"|"pioneers"|"worktrees", title: string, path?: string) => {
    if (type === "pioneers" || type === "browser") {
      setExplorerWidth((w) => Math.max(w, 380));
    }
    const existing = sidePanelTabs.find(t => t.type === type && t.path === path);
    if (existing) {
      setActiveSideTabId(existing.id);
    } else {
      const id = `tab-${type}-${Date.now()}`;
      setSidePanelTabs([...sidePanelTabs, { id, type, title, path }]);
      setActiveSideTabId(id);
    }
  }, [sidePanelTabs, setActiveSideTabId, setSidePanelTabs]);

  const closeSideTab = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newTabs = sidePanelTabs.filter(t => t.id !== id);
    setSidePanelTabs(newTabs);
    if (activeSideTabId === id) {
      setActiveSideTabId(newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null);
    }
    if (newTabs.length === 0) {
      setSidePanelOpen(false);
    }
  }, [sidePanelTabs, activeSideTabId, setSidePanelTabs, setActiveSideTabId, setSidePanelOpen]);

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

  // Auto-open Pioneers panel when the collective is engaged
  useEffect(() => {
    if (!session) return;
    const lastMsg = session.messages[session.messages.length - 1];
    const isStreaming = streamingSessions[session.id];
    if (lastMsg && lastMsg.role === "assistant" && isStreaming) {
       const msgId = lastMsg.id || session.messages.length.toString();
       if (poppedForMessageRef.current !== msgId) {
          const hasSwarmEvents = lastMsg.events?.some(e => {
            const t = e.type as string;
            return t === "agent_event" || t === "swarm_event" || t === "swarm_phase" || t === "agent_start" || t === "tool_call_start" || t === "tool_start";
          });
         if (hasSwarmEvents) {
            poppedForMessageRef.current = msgId;
            if (!sidePanelOpen) setSidePanelOpen(true);
            openSideTab("pioneers", "Pioneers");
            setExplorerWidth((w) => Math.max(w, 380));
         }
       }
    }
  }, [session, streamingSessions, sidePanelOpen, openSideTab]);

  // The composer moves when the primary or side pane changes even
  // though its own height may stay the same. Let the floating AgentDock
  // recompute its viewport-safe clearance immediately after those layout
  // transitions.
  useEffect(() => {
    window.dispatchEvent(new Event("memex:layout-change"));
  }, [primary, sidePanelOpen, activeSideTabId]);
  useEffect(() => {
    const scope = cwd || "unselected";
    if (explorerScopeRef.current !== scope) {
      explorerScopeRef.current = scope;
      try {
        const saved = Number(localStorage.getItem(`memex.layout.explorerWidth:${scope}`));
        if (saved) setExplorerWidth(Math.min(720, Math.max(200, saved)));
      } catch { /* storage unavailable */ }
      return;
    }
    try {
      localStorage.setItem(`memex.layout.explorerWidth:${scope}`, String(explorerWidth));
    } catch { /* storage unavailable */ }
  }, [cwd, explorerWidth]);


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
                onClick={() => setSidePanelOpen(!sidePanelOpen)}
                className={`p-1.5 rounded-md transition-colors ${sidePanelOpen ? "text-accent bg-accent/10" : "text-faint hover:text-text hover:bg-surface2"}`}
                title="Toggle Side Panel"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="2" y="3" width="12" height="10" rx="1.5" />
                  <path d="M10 3v10" />
                </svg>
              </button>
            </div>
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
                      <h1 className="text-xl text-text font-medium mb-2">Code with Memex</h1>
                      <p className="text-muted text-sm max-w-sm mx-auto">
                        {cwd
                          ? `Working in ${folderName}. One agent reads, edits, and runs the project, calling in Pioneers where the scope needs them.`
                          : "Open a folder, then describe what you want to build or change."}
                      </p>
                    </div>
                  </div>
                ) : (
                  <ConversationPane experience="code" workspaceKey={cwd || undefined} />
                )}

                <InputBar
                  experience="code"
                  workspaceKey={cwd || undefined}
                  modeOptions={CODE_MODES}
                  defaultMode="code"
                  extraFlags={{ dev_mode: true }}
                  disabledReason={cwd ? undefined : "Open a project folder to start coding"}
                  placeholder={cwd ? `Ask the agent to change ${folderName}…` : "Open a folder to start…"}
                />
              </div>
            )}
          </div>
          {/* Keep an opened terminal mounted while it is not active.
              Terminal visibility is a layout choice; unmounting here would terminate the user's PTY. */}
          {terminalOpened && sidePanelTabs.find(t => t.type === "terminal")?.id !== activeSideTabId && (
            <div className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0" aria-hidden="true">
              <TerminalPane id={termId} cwd={cwd || undefined} />
            </div>
          )}
        </div>
      </div>
      
      {/* File explorer / Side panel */}
      {sidePanelOpen && (
        <aside ref={explorerRef} style={{ width: explorerWidth }} className="relative flex-shrink-0 border-l border-border/60 bg-surface flex flex-col">
          <button
            type="button"
            aria-label="Resize panel"
            title="Drag to resize panel"
            onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setResizingExplorer(true); }}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") { event.preventDefault(); setExplorerWidth((value) => Math.min(720, value + 16)); }
              if (event.key === "ArrowRight") { event.preventDefault(); setExplorerWidth((value) => Math.max(200, value - 16)); }
              if (event.key === "Home") { event.preventDefault(); setExplorerWidth(200); }
              if (event.key === "End") { event.preventDefault(); setExplorerWidth(720); }
            }}
            role="separator"
            aria-orientation="vertical"
            aria-valuemin={200}
            aria-valuemax={720}
            aria-valuenow={explorerWidth}
            className="absolute -left-1 top-0 z-10 h-full w-2 touch-none cursor-col-resize hover:bg-accent/20 focus:outline-none focus:bg-accent/20"
          />
          <div className="flex items-center px-2 h-9 border-b border-border/60 bg-surface flex-shrink-0 overflow-x-auto no-scrollbar">
            {sidePanelTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveSideTabId(tab.id)}
                className={`group flex items-center gap-1.5 px-3 h-full text-xs font-medium border-b-2 transition-colors ${activeSideTabId === tab.id ? "border-accent text-accent bg-accent/5" : "border-transparent text-faint hover:text-text hover:bg-surface2"}`}
              >
                <span>{tab.title}</span>
                <div onClick={(e) => closeSideTab(tab.id, e)} className="p-0.5 rounded-sm opacity-0 group-hover:opacity-100 hover:bg-surface3 hover:text-text">
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M4.28 3.22a.75.75 0 00-1.06 1.06L6.94 8l-3.72 3.72a.75.75 0 101.06 1.06L8 9.06l3.72 3.72a.75.75 0 101.06-1.06L9.06 8l3.72-3.72a.75.75 0 00-1.06-1.06L8 6.94 4.28 3.22z"/></svg>
                </div>
              </button>
            ))}
            
            <div className="relative ml-1" ref={sideMenuRef}>
              <button
                onClick={() => setSideMenuOpen(!sideMenuOpen)}
                className="text-faint hover:text-text transition-colors p-1 rounded-md hover:bg-surface2"
                title="New tab..."
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 3v10M3 8h10"/></svg>
              </button>
              {sideMenuOpen && (
                <div className="absolute top-full right-0 mt-1 w-48 rounded-lg border border-border/60 bg-surface/95 shadow-xl z-50 py-1 text-xs text-text backdrop-blur-md">
                  <button onClick={() => { openSideTab("review", "Review"); setSideMenuOpen(false); }} className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-surface2 transition-colors">
                    <span className="flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2a6 6 0 100 12A6 6 0 008 2zM8 5v3l2 2"/></svg> Review</span>
                    <span className="text-faint">Ctrl+Shift+G</span>
                  </button>
                  <button onClick={() => { openSideTab("terminal", "Terminal"); setSideMenuOpen(false); setTerminalOpened(true); }} className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-surface2 transition-colors">
                    <span className="flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 4l4 4-4 4M8 12h5"/></svg> Terminal</span>
                    <span className="text-faint">Ctrl+`</span>
                  </button>
                  <button onClick={() => { openSideTab("browser", "Browser"); setSideMenuOpen(false); }} className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-surface2 transition-colors">
                    <span className="flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="5"/><path d="M3 8h10M8 3v10"/></svg> Browser</span>
                    <span className="text-faint">Ctrl+T</span>
                  </button>
                  <button onClick={() => { openSideTab("files", "Files"); setSideMenuOpen(false); }} className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-surface2 transition-colors">
                    <span className="flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M2 3h12a1 1 0 011 1v8a1 1 0 01-1 1H2a1 1 0 01-1-1V4a1 1 0 011-1zm1 1v8h3V4H3zm4 8h7V4H7v8z"/></svg> Files</span>
                    <span className="text-faint">Ctrl+P</span>
                  </button>
                  <button onClick={() => { openSideTab("worktrees", "Worktrees"); setSideMenuOpen(false); }} className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-surface2 transition-colors">
                    <span className="flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 3v10M12 3v10M4 8h8"/></svg> Worktrees</span>
                  </button>
                  <button onClick={() => { openSideTab("pioneers", "Pioneers"); setSideMenuOpen(false); }} className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-surface2 transition-colors">
                    <span className="flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="5" r="2"/><path d="M4 14c0-2.2 2-4 4-4s4 1.8 4 4"/></svg> Pioneers</span>
                    <span className="text-faint">Ctrl+Alt+S</span>
                  </button>
                </div>
              )}
            </div>
            
            <div className="flex-1" />
            <button
              onClick={() => setSidePanelOpen(false)}
              className="p-1.5 mr-1 text-faint hover:text-text rounded-md hover:bg-surface2 transition-colors"
              title="Close panel (Ctrl+B)"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4.28 3.22a.75.75 0 00-1.06 1.06L6.94 8l-3.72 3.72a.75.75 0 101.06 1.06L8 9.06l3.72 3.72a.75.75 0 101.06-1.06L9.06 8l3.72-3.72a.75.75 0 00-1.06-1.06L8 6.94 4.28 3.22z"/></svg>
            </button>
          </div>
          
          <div className="flex flex-col flex-1 min-h-0 relative">
            {(() => {
              const activeTab = sidePanelTabs.find(t => t.id === activeSideTabId);
              if (!activeTab) {
                return (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 text-center overflow-y-auto">
                    <div className="text-faint/50 mb-4">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="9" y1="3" x2="9" y2="21"></line>
                      </svg>
                    </div>
                    <h3 className="text-text font-medium mb-2">Workspace Tools</h3>
                    <p className="text-muted text-xs mb-6 max-w-[200px]">Launch a tool to assist with development.</p>
                    
                    <div className="flex flex-col gap-2 w-full max-w-[200px]">
                      <button onClick={() => openSideTab("terminal", "Terminal")} className="flex items-center gap-2 px-3 py-2 bg-surface2 hover:bg-surface3 rounded-lg border border-border/40 text-xs text-text transition-colors">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 4l4 4-4 4M8 12h5"/></svg>
                        Terminal
                      </button>
                      <button onClick={() => openSideTab("files", "Files")} className="flex items-center gap-2 px-3 py-2 bg-surface2 hover:bg-surface3 rounded-lg border border-border/40 text-xs text-text transition-colors">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M2 3h12a1 1 0 011 1v8a1 1 0 01-1 1H2a1 1 0 01-1-1V4a1 1 0 011-1zm1 1v8h3V4H3zm4 8h7V4H7v8z"/></svg>
                        Files
                      </button>
                      <button onClick={() => openSideTab("browser", "Browser")} className="flex items-center gap-2 px-3 py-2 bg-surface2 hover:bg-surface3 rounded-lg border border-border/40 text-xs text-text transition-colors">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="5"/><path d="M3 8h10M8 3v10"/></svg>
                        Browser
                      </button>
                      <button onClick={() => openSideTab("review", "Review")} className="flex items-center gap-2 px-3 py-2 bg-surface2 hover:bg-surface3 rounded-lg border border-border/40 text-xs text-text transition-colors">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2a6 6 0 100 12A6 6 0 008 2zM8 5v3l2 2"/></svg>
                        Review
                      </button>
                      <button onClick={() => openSideTab("worktrees", "Worktrees")} className="flex items-center gap-2 px-3 py-2 bg-surface2 hover:bg-surface3 rounded-lg border border-border/40 text-xs text-text transition-colors">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 3v10M12 3v10M4 8h8"/></svg>
                        Worktrees
                      </button>
                      <button onClick={() => openSideTab("pioneers", "Pioneers")} className="flex items-center gap-2 px-3 py-2 bg-surface2 hover:bg-surface3 rounded-lg border border-border/40 text-xs text-text transition-colors">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="5" r="2"/><path d="M4 14c0-2.2 2-4 4-4s4 1.8 4 4"/></svg>
                        Pioneers
                      </button>
                    </div>
                  </div>
                );
              }

              if (activeTab.type === "files") {
                return (
                  <>
                    {cwd && (
                      <div className="border-b border-border/60 max-h-[42%] overflow-y-auto">
                        <SessionList experience="code" workspaceKey={cwd} newLabel="New agent thread" />
                      </div>
                    )}
                    <div className="flex-1 overflow-y-auto py-1">
                      {cwd ? (
                        <FileTree root={cwd} onFileClick={openFileFromTree} />
                      ) : (
                        <div className="px-3 py-6 text-center">
                          <p className="text-faint text-xs mb-3">Open a folder to start</p>
                          <button
                            onClick={() => ipc.openFolder().then((p) => p && changeProject(p))}
                            className="px-3 py-1.5 text-xs text-accent border border-accent/40 rounded-lg hover:bg-accent/10 transition-colors"
                          >
                            Open Folder...
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                );
              }
              
              if (activeTab.type === "terminal") {
                return (
                  <div className="flex-1 relative flex flex-col min-h-0">
                    <TerminalPane id={termId} cwd={cwd || undefined} className="flex-1 min-h-0 h-full" />
                  </div>
                );
              }
              
              if (activeTab.type === "browser") {
                return (
                  <div className="flex-1 min-h-0">
                    <BrowserView />
                  </div>
                );
              }
              
              if (activeTab.type === "pioneers") {
                return (
                  <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                    {session ? (
                      <PioneersView
                        events={session.messages.flatMap((message) => message.events)}
                        active={Boolean(streamingSessions[session.id])}
                        workspaceKey={cwd || "unselected"}
                        embedded={true}
                      />
                    ) : (
                      <div className="px-3 py-6 text-center text-xs text-faint">Start a chat session to see pioneers.</div>
                    )}
                  </div>
                );
              }

              if (activeTab.type === "review") {
                return (
                  <div className="flex-1 overflow-y-auto no-scrollbar">
                    <ReviewPanel />
                  </div>
                );
              }

              if (activeTab.type === "worktrees") {
                return (
                  <div className="flex-1 min-h-0 h-full overflow-y-auto relative p-3">
                    {cwd ? (
                      <WorktreePanel repoPath={cwd} onSelect={(path) => { changeProject(path); }} />
                    ) : (
                      <div className="px-3 py-6 text-center text-xs text-faint">Open a folder to manage worktrees.</div>
                    )}
                  </div>
                );
              }

              return null;
            })()}
          </div>
        </aside>
      )}
      {/* Reopen pill when side panel is closed but swarm is actively streaming */}
      {!sidePanelOpen && session && Boolean(streamingSessions[session.id]) && (
        <button
          onClick={() => {
            setSidePanelOpen(true);
            openSideTab("pioneers", "Pioneers");
          }}
          className="fixed bottom-[calc(var(--memex-composer-clearance,112px)+0.75rem)] right-3 z-30 flex items-center gap-2 rounded-full border border-accent/40 bg-surface/95 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-accent shadow-xl backdrop-blur hover:bg-accent/10 transition-colors"
        >
          <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
          Pioneers Working
        </button>
      )}
    </div>
  );
}

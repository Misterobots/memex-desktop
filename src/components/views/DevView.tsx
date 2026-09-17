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

import { PrintWorkflowPanel } from "../dev/PrintWorkflowPanel";
import { WorktreePanel } from "../dev/WorktreePanel";

import { PioneersView } from "../swarm/PioneersView";
import { ReviewPanel } from "../dev/ReviewPanel";

export type DevTabType = "chat" | "editor" | "tasks" | "print" | "files" | "terminal" | "browser" | "worktrees" | "pioneers" | "review";

export interface DevTab {
  id: string;
  type: DevTabType;
  title: string;
  path?: string;
}

export function DevView() {
  const { cwd, setCwd, activeSession, streamingSessions } = useStore();
  const session    = activeSession("code", cwd || undefined);
  const empty      = !session || session.messages.length === 0;
  const folderName = cwd ? cwd.split(/[/\\]/).filter(Boolean).pop() : null;

  const [tabs, setTabs] = useState<DevTab[]>([{ id: "chat", type: "chat", title: "Chat" }]);
  const [activeTabId, setActiveTabId] = useState<string>("chat");
  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const [terminalOpened, setTerminalOpened] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  
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
      if (cmd && e.key === "`") { e.preventDefault(); openTab("terminal", "terminal"); }
      if (cmd && e.key.toLowerCase() === "t") { e.preventDefault(); openTab("browser", "browser"); }
      if (cmd && e.key.toLowerCase() === "p") { e.preventDefault(); openTab("files", "files"); }
      if (cmd && e.shiftKey && e.key.toLowerCase() === "g") { e.preventDefault(); openTab("review", "review"); }
      if (cmd && e.altKey && e.key.toLowerCase() === "s") { e.preventDefault(); openTab("pioneers", "pioneers"); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const openTab = useCallback((type: DevTabType, id: string, title?: string, path?: string) => {
    setTabs((current) => {
      if (current.find((t) => t.id === id)) return current;
      return [...current, { id, type, title: title || type, path }];
    });
    setActiveTabId(id);
    if (type === "terminal") setTerminalOpened(true);
  }, []);

  const closeTab = useCallback((id: string) => {
    setTabs((current) => {
      const next = current.filter((t) => t.id !== id);
      if (activeTabId === id && next.length > 0) {
        setActiveTabId(next[next.length - 1].id);
      } else if (next.length === 0) {
        // Fallback
        setActiveTabId("chat");
        return [{ id: "chat", type: "chat", title: "Chat" }];
      }
      return next;
    });
  }, [activeTabId]);

  const confirmNavigation = useCallback(() => {
    if (!editorDirty) return true;
    return window.confirm("This editor has unsaved changes. Continue navigation? Your in-memory draft will remain available if you return to the file.");
  }, [editorDirty]);

  const changeProject = useCallback((next: string) => {
    if (next === cwd || confirmNavigation()) {
      setEditorDirty(false);
      setCwd(next);
      setActiveTabId("chat");
    }
  }, [confirmNavigation, cwd, setCwd]);

  const openFileFromTree = useCallback((path: string) => {
    const fileName = path.split(/[/\\]/).pop() || "Editor";
    openTab("editor", path, fileName, path);
  }, [openTab]);

  const stopTerminal = () => {
    void desktop()?.pty.kill(termId);
    setTerminalOpened(false);
    closeTab("terminal");
  };

  // Notify layout changes
  useEffect(() => {
    window.dispatchEvent(new Event("memex:layout-change"));
  }, [activeTabId]);


  const activeTab = tabs.find(t => t.id === activeTabId);

  return (
    <div className="flex flex-1 min-h-0">
      <div className="relative flex flex-col flex-1 min-w-0">
        {/* Top Tab Bar */}
        <div className="flex items-center px-3 h-9 border-b border-border/60 bg-surface flex-shrink-0">
          <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden flex-1">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`group flex items-center gap-2 shrink-0 px-2.5 py-1 text-xs rounded-md transition-colors cursor-pointer select-none ${
                  activeTabId === tab.id ? "bg-surface2 text-text" : "text-faint hover:text-text hover:bg-surface2/50"
                }`}
                onClick={() => setActiveTabId(tab.id)}
              >
                <span className="capitalize truncate max-w-[120px]">
                  {tab.title}
                </span>
                {tab.id !== "chat" && (
                  <button onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }} className="opacity-0 group-hover:opacity-100 text-muted hover:text-red-400 p-0.5 rounded-sm hover:bg-surface">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4.28 3.22a.75.75 0 00-1.06 1.06L6.94 8l-3.72 3.72a.75.75 0 101.06 1.06L8 9.06l3.72 3.72a.75.75 0 101.06-1.06L9.06 8l3.72-3.72a.75.75 0 00-1.06-1.06L8 6.94 4.28 3.22z"/></svg>
                  </button>
                )}
              </div>
            ))}
            
            {/* The + Button */}
            <div className="relative ml-1" ref={sideMenuRef}>
              <button
                onClick={() => setSideMenuOpen(!sideMenuOpen)}
                className="text-faint hover:text-text transition-colors p-1 rounded-md hover:bg-surface2"
                title="New tab..."
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 3v10M3 8h10"/></svg>
              </button>
              {sideMenuOpen && (
                <div className="absolute top-full left-0 mt-1 w-48 rounded-lg border border-border/60 bg-surface/95 shadow-xl z-50 py-1 text-xs text-text backdrop-blur-md">
                  <button onClick={() => { openTab("terminal", "terminal", "Terminal"); setSideMenuOpen(false); }} className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-surface2 transition-colors">
                    <span className="flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 4l4 4-4 4M8 12h5"/></svg> Terminal</span>
                    <span className="text-faint">Ctrl+`</span>
                  </button>
                  <button onClick={() => { openTab("pioneers", "pioneers", "Side chat"); setSideMenuOpen(false); }} className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-surface2 transition-colors">
                    <span className="flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="5" r="2"/><path d="M4 14c0-2.2 2-4 4-4s4 1.8 4 4"/></svg> Side chat</span>
                    <span className="text-faint">Ctrl+Alt+S</span>
                  </button>
                  <button onClick={() => { openTab("browser", "browser", "Browser"); setSideMenuOpen(false); }} className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-surface2 transition-colors">
                    <span className="flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="5"/><path d="M3 8h10M8 3v10"/></svg> Browser</span>
                    <span className="text-faint">Ctrl+T</span>
                  </button>
                  <button onClick={() => { openTab("files", "files", "Files"); setSideMenuOpen(false); }} className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-surface2 transition-colors">
                    <span className="flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M2 3h12a1 1 0 011 1v8a1 1 0 01-1 1H2a1 1 0 01-1-1V4a1 1 0 011-1zm1 1v8h3V4H3zm4 8h7V4H7v8z"/></svg> Files</span>
                    <span className="text-faint">Ctrl+P</span>
                  </button>
                  <button onClick={() => { openTab("review", "review", "Review"); setSideMenuOpen(false); }} className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-surface2 transition-colors">
                    <span className="flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2a6 6 0 100 12A6 6 0 008 2zM8 5v3l2 2"/></svg> Review</span>
                    <span className="text-faint">Ctrl+Shift+G</span>
                  </button>
                  <button onClick={() => { openTab("worktrees", "worktrees", "Worktrees"); setSideMenuOpen(false); }} className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-surface2 transition-colors">
                    <span className="flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 3v10M12 3v10M4 8h8"/></svg> Worktrees</span>
                  </button>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-1 flex-shrink-0 relative pl-2 border-l border-border/60 ml-2">
            <WorkspaceSafetyBadge />
          </div>
        </div>

        {/* Tab Content Area */}
        <div ref={workspaceRef} className="flex flex-col flex-1 min-h-0 relative">
          {activeTab?.type === "chat" && (
            <div className="flex flex-col flex-1 min-h-0 h-full">
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
          
          {activeTab?.type === "editor" && (
            <div className="flex flex-col flex-1 min-h-0 h-full">
              {activeTab.path?.toLowerCase().endsWith(".ipynb") ? (
                <NotebookEditor path={activeTab.path} onDirtyChange={setEditorDirty} onClose={() => closeTab(activeTab.id)} />
              ) : activeTab.path ? (
                <FileEditor path={activeTab.path} onDirtyChange={setEditorDirty} onClose={() => closeTab(activeTab.id)} />
              ) : null}
            </div>
          )}

          {activeTab?.type === "files" && (
            <div className="flex flex-col flex-1 min-h-0 h-full overflow-y-auto py-1">
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
          )}

          {activeTab?.type === "terminal" && (
            <div className="flex flex-col flex-1 min-h-0 h-full">
              <div className="flex items-center justify-end px-3 py-1 border-b border-border/60 bg-surface2">
                <button type="button" onClick={stopTerminal} className="rounded px-2 py-1 text-[10px] font-medium text-red-300 hover:bg-red-400/10 hover:text-red-200">Stop process</button>
              </div>
              <TerminalPane id={termId} cwd={cwd || undefined} className="flex-1 min-h-0 h-full" />
            </div>
          )}

          {activeTab?.type === "browser" && (
            <div className="flex flex-col flex-1 min-h-0 h-full">
              <BrowserView />
            </div>
          )}

          {activeTab?.type === "review" && (
            <div className="flex flex-col flex-1 min-h-0 h-full">
              <ReviewPanel />
            </div>
          )}

          {activeTab?.type === "worktrees" && cwd && (
            <div className="flex flex-col flex-1 min-h-0 h-full overflow-y-auto relative p-3">
              <WorktreePanel repoPath={cwd} onSelect={(path) => { changeProject(path); }} />
            </div>
          )}

          {activeTab?.type === "pioneers" && session && (
            <div className="flex flex-col flex-1 min-h-0 h-full overflow-hidden relative">
              <PioneersView events={session.messages.flatMap((message) => message.events)} active={Boolean(streamingSessions[session.id])} workspaceKey={cwd || "unselected"} />
            </div>
          )}
          
          {activeTab?.type === "tasks" && (
            <div className="flex flex-col flex-1 min-h-0 h-full">
              <ProjectTasksPane cwd={cwd} />
            </div>
          )}

          {activeTab?.type === "print" && (
            <div className="flex flex-col flex-1 min-h-0 h-full">
              <PrintWorkflowPanel />
            </div>
          )}

          {/* Background Terminal */}
          {terminalOpened && activeTabId !== "terminal" && (
            <div className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0" aria-hidden="true">
              <TerminalPane id={termId} cwd={cwd || undefined} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

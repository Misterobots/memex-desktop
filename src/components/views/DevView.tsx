import { useState } from "react";
import { useStore } from "../../lib/store";
import { FileTree } from "../sidebar/FileTree";
import { ConversationPane } from "../chat/ConversationPane";
import { InputBar } from "../layout/InputBar";
import { TerminalPane } from "../dev/TerminalPane";
import { FileEditor } from "../dev/FileEditor";
import { WorkspaceSafetyBadge } from "../dev/WorkspaceSafetyBadge";
import { ProjectTasksPane } from "../dev/ProjectTasksPane";
import { ipc } from "../../lib/ipc";

type PrimaryPane = "chat" | "editor" | "tasks";
type BottomPane  = "terminal" | "none";

export function DevView() {
  const { cwd, setCwd, sidebarOpen, activeSession, activeSessionId } = useStore();
  const session    = activeSession();
  const empty      = !session || session.messages.length === 0;
  const folderName = cwd ? cwd.split(/[/\\]/).filter(Boolean).pop() : null;

  const [primary, setPrimary]       = useState<PrimaryPane>("chat");
  const [bottomPane, setBottomPane] = useState<BottomPane>("none");
  const [openFile, setOpenFile]     = useState<string | null>(null);

  const termId = `term-${activeSessionId ?? "default"}`;

  const toggleTerminal = () =>
    setBottomPane((p) => (p === "terminal" ? "none" : "terminal"));

  return (
    <div className="flex flex-1 min-h-0">
      {/* File explorer */}
      {sidebarOpen && (
        <aside className="w-[240px] flex-shrink-0 border-r border-border/60 bg-surface flex flex-col">
          <div className="flex items-center justify-between px-3 h-9 border-b border-border/60">
            <span className="text-xs text-faint font-medium truncate">
              {folderName ?? "Explorer"}
            </span>
            <button
              onClick={() => ipc.openFolder().then((p) => p && setCwd(p))}
              className="text-faint hover:text-accent transition-colors flex-shrink-0"
              title="Open folder"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25V5.75A1.75 1.75 0 0014.25 4H8.5L6.75 2.25A1.75 1.75 0 005.56 1.75H1.75z" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {cwd ? (
              <FileTree root={cwd} onFileClick={(path) => { setOpenFile(path); setPrimary("editor"); }} />
            ) : (
              <div className="px-3 py-6 text-center">
                <p className="text-faint text-xs mb-3">Open a folder to start</p>
                <button
                  onClick={() => ipc.openFolder().then((p) => p && setCwd(p))}
                  className="px-3 py-1.5 text-xs text-accent border border-accent/40 rounded-lg hover:bg-accent/10 transition-colors"
                >
                  Open folder
                </button>
              </div>
            )}
          </div>
        </aside>
      )}

      {/* Main workspace */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top toolbar */}
        <div className="flex items-center gap-1 px-3 h-9 border-b border-border/60 bg-surface flex-shrink-0">
          {(["chat", "editor", "tasks"] as PrimaryPane[]).map((p) => (
            <button
              key={p}
              onClick={() => setPrimary(p)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors capitalize ${
                primary === p ? "bg-surface2 text-text" : "text-faint hover:text-text"
              }`}
            >
              {p === "editor" ? (openFile ? openFile.split(/[/\\]/).pop() : "Editor") : p === "tasks" ? "Tasks" : "Agent"}
            </button>
          ))}
          <div className="flex-1" />
          <WorkspaceSafetyBadge />
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
        </div>

        {/* Pane area */}
        <div className="flex flex-col flex-1 min-h-0">
          {/* Primary pane */}
          <div className={`flex flex-col flex-1 min-h-0 ${bottomPane !== "none" ? "border-b border-border/60" : ""}`}
               style={{ height: bottomPane !== "none" ? "60%" : "100%" }}>
            {primary === "tasks" ? (
              <ProjectTasksPane cwd={cwd} />
            ) : primary === "editor" && openFile ? (
              <FileEditor
                path={openFile}
                onClose={() => { setOpenFile(null); setPrimary("chat"); }}
              />
            ) : (
              <div className="flex flex-col flex-1 min-h-0">
                {empty ? (
                  <div className="flex-1 flex flex-col items-center justify-center px-6 select-none">
                    <div className="max-w-conversation w-full text-center">
                      <div className="text-4xl text-accent mb-4 font-mono opacity-80">{"</>"}</div>
                      <h1 className="text-xl text-text font-medium mb-2">Code with the swarm</h1>
                      <p className="text-muted text-sm max-w-sm mx-auto">
                        {cwd
                          ? `Working in ${folderName}. Ask the agent to read, edit, and run code in this folder.`
                          : "Open a folder, then describe what you want to build or change."}
                      </p>
                    </div>
                  </div>
                ) : (
                  <ConversationPane />
                )}
                <InputBar
                  extraFlags={{ dev_mode: true }}
                  placeholder={cwd ? `Ask the agent to change ${folderName}…` : "Open a folder to start…"}
                />
              </div>
            )}
          </div>

          {/* Terminal pane */}
          {bottomPane === "terminal" && (
            <div style={{ height: "40%" }} className="flex flex-col min-h-0">
              <div className="flex items-center px-3 h-8 bg-surface border-b border-border/60 flex-shrink-0">
                <span className="text-xs text-faint font-medium">Terminal</span>
                <div className="flex-1" />
                <button
                  onClick={() => setBottomPane("none")}
                  className="text-faint hover:text-text transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M2 2l12 12M14 2L2 14" />
                  </svg>
                </button>
              </div>
              <TerminalPane id={termId} cwd={cwd || undefined} className="flex-1 min-h-0" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

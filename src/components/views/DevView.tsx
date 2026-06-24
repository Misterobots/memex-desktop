import { useStore } from "../../lib/store";
import { FileTree } from "../sidebar/FileTree";
import { ConversationPane } from "../chat/ConversationPane";
import { InputBar } from "../layout/InputBar";
import { ipc } from "../../lib/ipc";

export function DevView() {
  const { cwd, setCwd, sidebarOpen, activeSession } = useStore();
  const session = activeSession();
  const empty = !session || session.messages.length === 0;

  const folderName = cwd ? cwd.split(/[/\\]/).filter(Boolean).pop() : null;

  return (
    <div className="flex flex-1 min-h-0">
      {/* File explorer */}
      {sidebarOpen && (
        <aside className="w-[260px] flex-shrink-0 border-r border-border/60 bg-surface flex flex-col">
          <div className="flex items-center justify-between px-4 h-10 border-b border-border/60">
            <span className="text-xs text-muted font-medium uppercase tracking-wide truncate">
              {folderName ?? "No folder"}
            </span>
            <button
              onClick={() => ipc.openFolder().then((p) => p && setCwd(p))}
              className="text-faint hover:text-accent transition-colors flex-shrink-0"
              title="Open folder"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25V5.75A1.75 1.75 0 0014.25 4H8.5L6.75 2.25A1.75 1.75 0 005.56 1.75H1.75z" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {cwd ? (
              <FileTree root={cwd} />
            ) : (
              <div className="px-4 py-6 text-center">
                <p className="text-faint text-xs mb-3">Open a folder to start coding</p>
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

      {/* Agent workspace */}
      <main className="flex flex-col flex-1 min-w-0">
        {empty ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 select-none">
            <div className="max-w-conversation w-full text-center">
              <div className="text-5xl text-accent mb-5 opacity-90 font-mono">{"</>"}</div>
              <h1 className="text-2xl text-text font-medium mb-2">Code with the swarm</h1>
              <p className="text-muted text-sm max-w-md mx-auto">
                {cwd
                  ? `Working in ${folderName}. Describe a change and the agent will read, edit, and run code directly in this folder.`
                  : "Open a folder, then describe what you want to build or change. The agent reads and writes files locally."}
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
      </main>
    </div>
  );
}

import { useStore } from "../../lib/store";
import { ipc } from "../../lib/ipc";

const DOT: Record<string, string> = {
  connected:    "bg-green",
  disconnected: "bg-red",
  checking:     "bg-yellow status-dot-active",
};

export function StatusBar() {
  const { connections, selectedModel, cwd, toggleSidebar, sidebarOpen } = useStore();

  return (
    <div className="drag-region flex items-center justify-between h-9 px-3 bg-surface border-b border-border text-muted text-xs flex-shrink-0">
      <div className="no-drag flex items-center gap-3">
        {/* Sidebar toggle */}
        <button
          onClick={toggleSidebar}
          className="hover:text-text transition-colors"
          title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 2.75A.75.75 0 011.75 2h12.5a.75.75 0 010 1.5H1.75A.75.75 0 011 2.75zm0 5A.75.75 0 011.75 7h12.5a.75.75 0 010 1.5H1.75A.75.75 0 011 7.75zm0 5a.75.75 0 01.75-.75h12.5a.75.75 0 010 1.5H1.75a.75.75 0 01-.75-.75z" />
          </svg>
        </button>

        <span className="text-muted">Memex Desktop</span>

        {/* CWD */}
        {cwd && (
          <>
            <span className="text-border">·</span>
            <button
              className="no-drag hover:text-text transition-colors truncate max-w-xs"
              onClick={() => ipc.openFolder().then((p) => p && useStore.getState().setCwd(p))}
              title={cwd}
            >
              {cwd.split(/[/\\]/).slice(-2).join("/")}
            </button>
          </>
        )}
      </div>

      <div className="no-drag flex items-center gap-4">
        {/* Connection dots */}
        <div className="flex items-center gap-2">
          {(["agentRuntime", "mempalace", "ollama"] as const).map((key) => (
            <div key={key} className="flex items-center gap-1" title={key}>
              <span className={`w-1.5 h-1.5 rounded-full ${DOT[connections[key]]}`} />
              <span className="text-muted text-xs">
                {key === "agentRuntime" ? "runtime" : key === "mempalace" ? "memory" : "ollama"}
              </span>
            </div>
          ))}
        </div>

        <span className="text-border">|</span>
        <span className="text-accent">{selectedModel}</span>
      </div>
    </div>
  );
}

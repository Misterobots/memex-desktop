import { useStore } from "../../lib/store";

const DOT: Record<string, string> = {
  connected:    "bg-green",
  disconnected: "bg-red",
  checking:     "bg-yellow status-dot-active",
};

export function StatusBar() {
  const { connections, selectedModel, toggleSidebar, sidebarOpen } = useStore();

  const allConnected = Object.values(connections).every((c) => c === "connected");

  return (
    <div className="drag-region flex items-center justify-between h-11 px-4 bg-canvas border-b border-border/60 flex-shrink-0">
      <div className="no-drag flex items-center gap-3">
        <button
          onClick={toggleSidebar}
          className="text-faint hover:text-text transition-colors p-1 -ml-1 rounded hover:bg-surface"
          title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="2.5" width="12" height="11" rx="2" />
            <line x1="6" y1="2.5" x2="6" y2="13.5" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <span className="text-accent text-base">◈</span>
          <span className="text-text font-medium text-sm">Memex</span>
        </div>
      </div>

      <div className="no-drag flex items-center gap-3">
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-surface transition-colors cursor-default"
          title={`runtime: ${connections.agentRuntime} · memory: ${connections.mempalace} · ollama: ${connections.ollama}`}
        >
          <span className={`w-2 h-2 rounded-full ${allConnected ? DOT.connected : connections.agentRuntime === "checking" ? DOT.checking : DOT.disconnected}`} />
          <span className="text-muted text-xs">{allConnected ? "Connected" : "Degraded"}</span>
        </div>
        <span className="text-xs text-faint px-2 py-1 rounded-md bg-surface border border-border/60">
          {selectedModel}
        </span>
        <button
          onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "e", ctrlKey: true, shiftKey: true, bubbles: true }))}
          title="Export session (Ctrl+Shift+E)"
          className="p-1.5 rounded-md text-faint hover:text-text hover:bg-surface transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M7 1v8M4 6l3 3 3-3M1 10v1.5A1.5 1.5 0 002.5 13h9a1.5 1.5 0 001.5-1.5V10" />
          </svg>
        </button>
      </div>
    </div>
  );
}

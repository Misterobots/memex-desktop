import { useStore } from "../../lib/store";

export function SessionList() {
  const { sessions, activeSessionId, setActiveSession, createSession } = useStore();

  return (
    <div className="py-3">
      {/* New chat button */}
      <div className="px-3 mb-2">
        <button
          onClick={() => createSession()}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text bg-surface2 hover:bg-border/60 transition-colors"
        >
          <span className="text-accent text-base leading-none">+</span>
          New chat
        </button>
      </div>

      <div className="px-3 pt-1 pb-1">
        <span className="text-xs text-faint font-medium uppercase tracking-wide">Recents</span>
      </div>

      <div className="px-2">
        {sessions.slice(0, 20).map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSession(s.id)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm truncate transition-colors mb-0.5 ${
              s.id === activeSessionId
                ? "text-text bg-surface2"
                : "text-muted hover:text-text hover:bg-surface2/60"
            }`}
          >
            {s.title}
          </button>
        ))}
        {sessions.length === 0 && (
          <p className="px-3 py-2 text-xs text-faint">No conversations yet</p>
        )}
      </div>
    </div>
  );
}

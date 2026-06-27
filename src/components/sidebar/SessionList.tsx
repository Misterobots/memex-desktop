import { useStore } from "../../lib/store";
import { deleteRemoteSession } from "../../lib/conv-sync";

export function SessionList() {
  const { sessions, activeSessionId, setActiveSession, createSession, deleteSession } = useStore();

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
          <div
            key={s.id}
            className={`group relative flex items-center rounded-lg mb-0.5 transition-colors ${
              s.id === activeSessionId ? "bg-surface2" : "hover:bg-surface2/60"
            }`}
          >
            <button
              onClick={() => setActiveSession(s.id)}
              className={`flex-1 min-w-0 text-left pl-3 pr-7 py-2 text-sm truncate ${
                s.id === activeSessionId ? "text-text" : "text-muted group-hover:text-text"
              }`}
            >
              {s.title}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); deleteSession(s.id); deleteRemoteSession(s.id); }}
              title="Delete conversation"
              className="absolute right-1 p-1 rounded opacity-0 group-hover:opacity-100 text-faint hover:text-red hover:bg-red/10 transition-opacity"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2.5 4h11M6 4V2.5h4V4M5 4l.5 9a1 1 0 001 1h3a1 1 0 001-1L11 4" />
              </svg>
            </button>
          </div>
        ))}
        {sessions.length === 0 && (
          <p className="px-3 py-2 text-xs text-faint">No conversations yet</p>
        )}
      </div>
    </div>
  );
}

import { useStore } from "../../lib/store";

export function SessionList() {
  const { sessions, activeSessionId, setActiveSession, createSession } = useStore();
  const recent = sessions.slice(0, 10);

  return (
    <div>
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs text-muted font-mono uppercase tracking-wider">Sessions</span>
        <button
          onClick={() => createSession()}
          className="text-muted hover:text-text transition-colors text-lg leading-none"
          title="New session"
        >
          +
        </button>
      </div>
      <div className="pb-2">
        {recent.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSession(s.id)}
            className={`w-full text-left px-3 py-1.5 text-xs truncate transition-colors ${
              s.id === activeSessionId
                ? "text-text bg-canvas"
                : "text-muted hover:text-text hover:bg-canvas"
            }`}
          >
            {s.title}
          </button>
        ))}
        {recent.length === 0 && (
          <p className="px-3 py-1.5 text-xs text-muted opacity-50">No sessions yet</p>
        )}
      </div>
    </div>
  );
}

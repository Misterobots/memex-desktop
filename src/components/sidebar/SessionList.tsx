import { useEffect, useState } from "react";
import { useStore } from "../../lib/store";
import { archiveRemoteSession } from "../../lib/conv-sync";
import { sessionMatches } from "../../lib/store";
import type { ExperienceId } from "../../types/memex";

interface Props {
  experience?: ExperienceId;
  workspaceKey?: string;
  newLabel?: string;
}

export function SessionList({ experience = "chat", workspaceKey, newLabel = "New chat" }: Props) {
  const { sessions, activeSession, setActiveSession, createSession, deleteSession } = useStore();
  const scoped = sessions.filter((session) => sessionMatches(session, experience, workspaceKey));
  const activeSessionId = activeSession(experience, workspaceKey)?.id;
  const [visibleCount, setVisibleCount] = useState(20);
  const [query, setQuery] = useState("");
  useEffect(() => { setVisibleCount(20); setQuery(""); }, [experience, workspaceKey]);
  const filtered = query.trim()
    ? scoped.filter((session) => session.title.toLowerCase().includes(query.trim().toLowerCase()))
    : scoped;

  return (
    <div className="py-3">
      {/* New chat button */}
      <div className="px-3 mb-2">
        <button
          onClick={() => createSession(experience, workspaceKey)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text bg-surface2 hover:bg-border/60 transition-colors"
        >
          <span className="text-accent text-base leading-none">+</span>
          {newLabel}
        </button>
      </div>

      <div className="px-3 pt-1 pb-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-faint font-medium uppercase tracking-wide">Recents</span>
          {scoped.length > 0 && <span className="text-[10px] text-faint">{scoped.length}</span>}
        </div>
      </div>

      {scoped.length > 0 && <div className="px-2 pb-2">
        <label className="sr-only" htmlFor={`session-search-${experience}-${workspaceKey ?? "global"}`}>Search conversations</label>
        <input
          id={`session-search-${experience}-${workspaceKey ?? "global"}`}
          value={query}
          onChange={(event) => { setQuery(event.target.value); setVisibleCount(20); }}
          placeholder="Search conversations"
          className="w-full rounded-md border border-border/60 bg-canvas/40 px-2.5 py-1.5 text-xs text-text placeholder-faint focus:border-accent/60 focus:outline-none"
        />
      </div>}

      <div className="px-2">
        {filtered.slice(0, visibleCount).map((s) => (
          <div
            key={s.id}
            className={`group relative flex items-center rounded-lg mb-0.5 transition-colors ${
              s.id === activeSessionId ? "bg-surface2" : "hover:bg-surface2/60"
            }`}
          >
            <button
              onClick={() => setActiveSession(s.id, experience)}
              className={`flex-1 min-w-0 text-left pl-3 pr-7 py-2 text-sm truncate ${
                s.id === activeSessionId ? "text-text" : "text-muted group-hover:text-text"
              }`}
            >
              {s.title}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!window.confirm(`Archive “${s.title}”? This removes it from recents on this device and Memex sync.`)) return;
                deleteSession(s.id); archiveRemoteSession(s.id);
              }}
              title="Archive conversation"
              aria-label={`Archive conversation: ${s.title}`}
              className="absolute right-1 p-1 rounded opacity-0 group-hover:opacity-100 text-faint hover:text-red hover:bg-red/10 transition-opacity"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2.5 4h11M6 4V2.5h4V4M5 4l.5 9a1 1 0 001 1h3a1 1 0 001-1L11 4" />
              </svg>
            </button>
          </div>
        ))}
        {scoped.length === 0 && (
          <p className="px-3 py-2 text-xs text-faint">No conversations yet</p>
        )}
        {scoped.length > 0 && filtered.length === 0 && (
          <p className="px-3 py-2 text-xs text-faint">No conversations match “{query}”.</p>
        )}
        {filtered.length > visibleCount && (
          <button onClick={() => setVisibleCount((count) => Math.min(filtered.length, count + 20))} className="mx-2 mt-2 w-[calc(100%-1rem)] rounded-md px-3 py-2 text-left text-xs text-accent hover:bg-surface2">
            Show older · {filtered.length - visibleCount} remaining
          </button>
        )}
      </div>
    </div>
  );
}

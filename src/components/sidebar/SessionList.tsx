import { useState } from "react";
import { useStore } from "../../lib/store";
import { deleteRemoteSession, pushSession } from "../../lib/conv-sync";
import { sessionMatches } from "../../lib/store";
import type { ExperienceId } from "../../types/memex";

interface Props {
  experience?: ExperienceId;
  workspaceKey?: string;
  newLabel?: string;
}

export function SessionList({ experience = "chat", workspaceKey, newLabel = "New chat" }: Props) {
  const { sessions, activeSession, setActiveSession, createSession, renameSession, deleteSession } = useStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const scoped = sessions.filter((session) => sessionMatches(session, experience, workspaceKey));
  const activeSessionId = activeSession(experience, workspaceKey)?.id;

  const beginRename = (id: string, title: string) => {
    setEditingId(id);
    setDraftTitle(title);
  };

  const commitRename = () => {
    if (!editingId) return;
    renameSession(editingId, draftTitle);
    const updated = useStore.getState().sessions.find((session) => session.id === editingId);
    if (updated) pushSession(updated);
    setEditingId(null);
  };

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
        <span className="text-xs text-faint font-medium uppercase tracking-wide">Recents</span>
      </div>

      <div className="px-2">
        {scoped.slice(0, 20).map((s) => (
          <div
            key={s.id}
            className={`group relative flex items-center rounded-lg mb-0.5 transition-colors ${
              s.id === activeSessionId ? "bg-surface2" : "hover:bg-surface2/60"
            }`}
          >
            {editingId === s.id ? (
              <div className="flex-1 min-w-0 pl-3 pr-7 py-2">
                <input
                  autoFocus
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") { event.preventDefault(); commitRename(); }
                    if (event.key === "Escape") setEditingId(null);
                  }}
                  onBlur={commitRename}
                  aria-label="Session title"
                  className="w-full bg-transparent text-sm text-text outline-none border-b border-accent/60"
                />
              </div>
            ) : <button
              onClick={() => setActiveSession(s.id, experience)}
              className={`flex-1 min-w-0 text-left pl-3 pr-7 py-2 text-sm truncate ${
                s.id === activeSessionId ? "text-text" : "text-muted group-hover:text-text"
              }`}
            >{s.title}</button>}
            {editingId !== s.id && <button
              onClick={(e) => { e.stopPropagation(); beginRename(s.id, s.title); }}
              title="Rename session"
              aria-label={`Rename ${s.title}`}
              className="absolute right-7 p-1 rounded opacity-0 group-hover:opacity-100 text-faint hover:text-text hover:bg-surface transition-opacity"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M10.8 2.2a1.7 1.7 0 012.4 2.4L5.3 12.5l-3.1.7.7-3.1 7.9-7.9z" />
              </svg>
            </button>}
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
        {scoped.length === 0 && (
          <p className="px-3 py-2 text-xs text-faint">No conversations yet</p>
        )}
      </div>
    </div>
  );
}

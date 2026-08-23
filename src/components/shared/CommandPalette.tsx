import { useState, useEffect, useRef } from "react";
import { useStore } from "../../lib/store";

interface Command {
  id: string;
  label: string;
  description?: string;
  action: () => void;
}

export function CommandPalette() {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { setCommandPalette, setActiveTab, createSession, toggleSidebar } = useStore();

  useEffect(() => { inputRef.current?.focus(); }, []);

  const close = () => setCommandPalette(false);

  const COMMANDS: Command[] = [
    { id: "open-chat", label: "Open Chat", action: () => { setActiveTab("chat"); close(); } },
    { id: "open-code", label: "Open Code", action: () => { setActiveTab("dev"); close(); } },
    { id: "open-research", label: "Open Research", action: () => { setActiveTab("research"); close(); } },
    { id: "open-design", label: "Open Design", action: () => { setActiveTab("design"); close(); } },
    { id: "open-art", label: "Open Art & Print", action: () => { setActiveTab("art"); close(); } },
    { id: "open-routines", label: "Open Routines", action: () => { setActiveTab("goals"); close(); } },
    { id: "new-session", label: "New Chat thread", action: () => { createSession("chat"); setActiveTab("chat"); close(); } },
    { id: "toggle-sidebar", label: "Toggle sidebar",  action: () => { toggleSidebar(); close(); } },
  ];

  const filtered = query
    ? COMMANDS.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()))
    : COMMANDS;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20"
      onClick={close}
    >
      <div
        className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
            if (e.key === "Enter" && filtered.length > 0) filtered[0].action();
          }}
          placeholder="Type a command…"
          className="w-full px-4 py-3 bg-transparent text-text text-sm border-b border-border focus:outline-none placeholder-muted"
        />
        <div className="max-h-80 overflow-y-auto py-1">
          {filtered.map((cmd) => (
            <button
              key={cmd.id}
              onClick={cmd.action}
              className="w-full text-left px-4 py-2 text-sm hover:bg-canvas transition-colors flex items-center justify-between"
            >
              <span className="text-text">{cmd.label}</span>
              {cmd.description && <span className="text-muted text-xs">{cmd.description}</span>}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-4 py-3 text-sm text-muted">No commands found</p>
          )}
        </div>
      </div>
    </div>
  );
}

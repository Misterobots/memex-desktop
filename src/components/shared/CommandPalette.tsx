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
  const [activeIndex, setActiveIndex] = useState(0);
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

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(filtered.length - 1, 0)));
  }, [filtered.length]);

  const runActive = () => {
    if (filtered.length > 0) filtered[activeIndex]?.action();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20"
      onClick={close}
      role="presentation"
    >
      <div
        className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <input
          ref={inputRef}
          aria-label="Search commands"
          aria-controls="command-palette-options"
          aria-activedescendant={filtered[activeIndex] ? `command-option-${filtered[activeIndex].id}` : undefined}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIndex((index) => filtered.length ? (index + 1) % filtered.length : 0);
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((index) => filtered.length ? (index - 1 + filtered.length) % filtered.length : 0);
            }
            if (e.key === "Home") {
              e.preventDefault();
              setActiveIndex(0);
            }
            if (e.key === "End") {
              e.preventDefault();
              setActiveIndex(Math.max(filtered.length - 1, 0));
            }
            if (e.key === "Enter") runActive();
          }}
          placeholder="Type a command…"
          className="w-full px-4 py-3 bg-transparent text-text text-sm border-b border-border focus:outline-none placeholder-muted"
        />
        <div id="command-palette-options" className="max-h-80 overflow-y-auto py-1" role="listbox" aria-label="Commands">
          {filtered.map((cmd, index) => (
            <button
              key={cmd.id}
              id={`command-option-${cmd.id}`}
              onClick={cmd.action}
              role="option"
              aria-selected={index === activeIndex}
              className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center justify-between focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent ${index === activeIndex ? "bg-canvas" : "hover:bg-canvas"}`}
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

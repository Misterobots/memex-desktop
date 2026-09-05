import { useEffect, useRef, useState } from "react";
import { useStore } from "../../lib/store";
import { isDesktop } from "../../lib/desktop";
import type { AppTab } from "../../types/memex";
import { getMyPermissions, type FeatureKey } from "../../lib/user-permissions";
import { SessionList } from "../sidebar/SessionList";

// Tabs requiring the Electron native bridge (local terminal/editor/FS, local
// run store) — hidden when running as a web app.
const DESKTOP_ONLY: AppTab[] = ["dev", "eval"];

interface TabDef {
  id: AppTab;
  label: string;
  icon: JSX.Element;
  feature?: FeatureKey;
}

const CHAT_TABS: AppTab[] = ["chat", "research", "goals", "art", "design"];
const CODE_TABS: AppTab[] = ["dev", "skills", "goals", "eval", "pulls", "design"];

const TABS: TabDef[] = [
  {
    id: "chat",
    feature: "chat",
    label: "Chat",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2 4.5A1.5 1.5 0 013.5 3h9A1.5 1.5 0 0114 4.5v6a1.5 1.5 0 01-1.5 1.5H6l-3 2.5v-2.5H3.5A1.5 1.5 0 012 10.5v-6z" />
      </svg>
    ),
  },
  {
    id: "dev",
    feature: "code",
    label: "Code",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M5.5 5L2.5 8l3 3M10.5 5l3 3-3 3M9 3.5L7 12.5" />
      </svg>
    ),
  },
  {
    id: "research",
    feature: "research",
    label: "Research",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5L14 14M5 7h4M7 5v4" />
      </svg>
    ),
  },
  {
    id: "goals",
    feature: "routines",
    label: "Routines",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="8" r="6" />
        <circle cx="8" cy="8" r="3" />
        <circle cx="8" cy="8" r="0.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: "design",
    feature: "design",
    label: "Design",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
        <path d="M5 6h6M5 8.5h4M5 11h2" />
        <path d="M12.5 1.5v3M11 3h3" />
      </svg>
    ),
  },
  {
    id: "art",
    feature: "art",
    label: "Art",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
        <circle cx="5.5" cy="6" r="1.2" />
        <path d="M2.5 12l3.5-3.5 2.5 2.5 2-2 3 3" />
      </svg>
    ),
  },
  {
    id: "memory",
    feature: "memory",
    label: "Memory",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <ellipse cx="8" cy="4" rx="5.5" ry="2" />
        <path d="M2.5 4v8c0 1.1 2.46 2 5.5 2s5.5-.9 5.5-2V4" />
        <path d="M2.5 8c0 1.1 2.46 2 5.5 2s5.5-.9 5.5-2" />
      </svg>
    ),
  },
  {
    id: "eval",
    feature: "eval",
    label: "Eval",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2 2h4v4H2zM10 2h4v4h-4zM2 10h4v4H2zM10 10h4v4h-4z" />
      </svg>
    ),
  },
  {
    id: "sites",
    feature: "design",
    label: "Sites",
    icon: (<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2.5" width="12" height="11" rx="1.5" /><path d="M2.5 6h11M5 4.25h.01M7 4.25h.01M9 4.25h.01M5 9h6M5 11h3" /></svg>),
  },
  {
    id: "skills",
    label: "Skills",
    icon: (<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 2.5h7.5a2 2 0 012 2V13l-3-1.5L6.5 13V4.5a2 2 0 00-2-2z" /><path d="M10 6h3M11.5 4.5v3" /></svg>),
  },
  {
    id: "schedules",
    feature: "routines",
    label: "Scheduled",
    icon: (<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="5.5" /><path d="M8 4.5V8l2.5 1.5" /></svg>),
  },
  {
    id: "pulls",
    feature: "code",
    label: "Pull requests",
    icon: (<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="4" cy="3.5" r="1.5" /><circle cx="12" cy="12.5" r="1.5" /><path d="M4 5v5a2.5 2.5 0 002.5 2.5H10M4 5l4 3M8 8h3" /></svg>),
  },
  {
    id: "admin",
    label: "Admin",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="5" r="2.5" /><path d="M3 14c.4-3 2-4.5 5-4.5s4.6 1.5 5 4.5M12.5 2.5l1 1 1.5-1.5" />
      </svg>
    ),
  },
  {
    id: "settings",
    label: "Settings",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="8" r="2" />
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" />
      </svg>
    ),
  },
];

export function TabBar() {
  const { activeTab, setActiveTab, shellMode, setShellMode, sidebarOpen } = useStore();
  const [features, setFeatures] = useState<Partial<Record<FeatureKey, boolean>> | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const tabButtons = useRef<Partial<Record<AppTab, HTMLButtonElement | null>>>({});
  useEffect(() => {
    let alive = true;
    getMyPermissions().then((policy) => { if (alive) { setFeatures(policy.features); setIsAdmin(Boolean(policy.is_admin)); } }).catch(() => { if (alive) setFeatures(null); });
    return () => { alive = false; };
  }, []);
  const web = !isDesktop();
  const visibleTabs = shellMode === "chat" ? CHAT_TABS : CODE_TABS;
  const tabs = TABS.filter((tab) =>
    visibleTabs.includes(tab.id) &&
    !(web && DESKTOP_ONLY.includes(tab.id)) &&
    (tab.id !== "admin" || isAdmin) &&
    (!tab.feature || features?.[tab.feature] !== false));

  useEffect(() => {
    // Sites deliberately has no top-level tab: it is a Design subspace.
    // Treat it as valid whenever Design is available rather than redirecting
    // the user to the shell default after choosing it.
    const activeIsVisible = tabs.some((tab) => tab.id === activeTab || (activeTab === "sites" && tab.id === "design"));
    if (features && !activeIsVisible) setActiveTab(shellMode === "code" ? "dev" : "chat");
  }, [activeTab, features, shellMode, setActiveTab]);

  useEffect(() => {
    tabButtons.current[activeTab]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTab]);

  if (!sidebarOpen) return null;

  return (
    <aside className="relative flex w-[248px] flex-shrink-0 flex-col border-r border-border/60 bg-surface">
      <div className="relative border-b border-border/60 p-3">
        <button
          aria-expanded={workspaceMenuOpen}
          aria-haspopup="menu"
          onClick={() => setWorkspaceMenuOpen((open) => !open)}
          className="flex w-full items-center justify-between rounded-md px-1 py-1 text-left text-sm font-semibold text-text hover:bg-surface2"
        >
          <span>Memex {shellMode === "chat" ? "Chat" : "Code"}</span><span className="text-faint">⌄</span>
        </button>
        {workspaceMenuOpen && <div role="menu" className="absolute left-3 top-11 z-50 w-[220px] rounded-lg border border-border bg-canvas p-1 shadow-xl">
          {(["chat", "code"] as const).map((mode) => <button
            key={mode}
            role="menuitemradio"
            aria-checked={shellMode === mode}
            onClick={() => { setShellMode(mode); setWorkspaceMenuOpen(false); }}
            className={`flex w-full flex-col rounded-md px-3 py-2.5 text-left text-xs ${shellMode === mode ? "bg-surface2 text-text" : "text-muted hover:bg-surface2 hover:text-text"}`}
          >
            <span className="font-medium">Memex {mode === "chat" ? "Chat" : "Code"}</span>
            <span className="mt-0.5 text-[11px] text-faint">{mode === "chat" ? "Chat, Research, Routines, Art" : "Code, Skills, Routines, Eval"}</span>
          </button>)}
        </div>}
      </div>

      <nav aria-label="Workspace navigation" className="space-y-0.5 px-2 py-3">
        {tabs.map((tab) => {
          const active = activeTab === tab.id || (tab.id === "design" && activeTab === "sites");
          return <button
            key={tab.id}
            ref={(element) => { tabButtons.current[tab.id] = element; }}
            onClick={() => setActiveTab(tab.id)}
            aria-label={tab.label}
            className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors ${
              active ? "bg-surface2 text-text" : "text-muted hover:bg-surface2 hover:text-text"
            }`}
          >
            <span className={active ? "text-accent" : "text-faint"}>{tab.icon}</span><span>{tab.label}</span>
          </button>;
        })}
      </nav>

      {shellMode === "chat" && <div className="min-h-0 flex-1 overflow-y-auto border-t border-border/60">
        <SessionList />
      </div>}
      {shellMode === "code" && <div className="mt-auto border-t border-border/60 px-4 py-3 text-xs leading-relaxed text-faint">
        Open a project in Code to access its files, terminal, tasks, and agent threads.
      </div>}
    </aside>
  );
}

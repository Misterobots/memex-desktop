import { useEffect, useState } from "react";
import { useStore } from "../../lib/store";
import { isDesktop } from "../../lib/desktop";
import type { AppTab } from "../../types/memex";
import { getMyPermissions, type FeatureKey } from "../../lib/user-permissions";

// Tabs requiring the Electron native bridge (local terminal/editor/FS, local
// run store) — hidden when running as a web app.
const DESKTOP_ONLY: AppTab[] = ["dev", "eval"];

interface TabDef {
  id: AppTab;
  label: string;
  icon: JSX.Element;
  feature?: FeatureKey;
}

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
  const { activeTab, setActiveTab } = useStore();
  const [features, setFeatures] = useState<Partial<Record<FeatureKey, boolean>> | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let alive = true;
    getMyPermissions().then((policy) => { if (alive) { setFeatures(policy.features); setIsAdmin(Boolean(policy.is_admin)); } }).catch(() => { if (alive) setFeatures(null); });
    return () => { alive = false; };
  }, []);
  const web = !isDesktop();
  const tabs = TABS.filter((tab) =>
    !(web && DESKTOP_ONLY.includes(tab.id)) &&
    (tab.id !== "admin" || isAdmin) &&
    (!tab.feature || features?.[tab.feature] !== false));

  useEffect(() => {
    if (features && !tabs.some((tab) => tab.id === activeTab)) setActiveTab("chat");
  }, [activeTab, features, setActiveTab]);

  return (
    <div className="flex items-center gap-1 px-2 sm:px-3 h-12 bg-canvas border-b border-border/60 flex-shrink-0 overflow-x-auto no-scrollbar">
      {tabs.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            aria-label={tab.label}
            className={`flex items-center gap-2 px-3 sm:px-3.5 py-1.5 rounded-lg text-sm transition-colors flex-shrink-0 whitespace-nowrap ${
              active
                ? "bg-surface2 text-text"
                : "text-muted hover:text-text hover:bg-surface/60"
            }`}
          >
            <span className={active ? "text-accent" : ""}>{tab.icon}</span>
            <span className={active ? "" : "hidden sm:inline"}>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

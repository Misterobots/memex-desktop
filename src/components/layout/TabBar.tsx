import { useStore } from "../../lib/store";
import type { AppTab } from "../../types/memex";

interface TabDef {
  id: AppTab;
  label: string;
  icon: JSX.Element;
}

const TABS: TabDef[] = [
  {
    id: "chat",
    label: "Chat",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2 4.5A1.5 1.5 0 013.5 3h9A1.5 1.5 0 0114 4.5v6a1.5 1.5 0 01-1.5 1.5H6l-3 2.5v-2.5H3.5A1.5 1.5 0 012 10.5v-6z" />
      </svg>
    ),
  },
  {
    id: "goals",
    label: "Goals",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="8" r="6" />
        <circle cx="8" cy="8" r="3" />
        <circle cx="8" cy="8" r="0.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: "art",
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
    id: "dev",
    label: "Code",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M5.5 5L2.5 8l3 3M10.5 5l3 3-3 3M9 3.5L7 12.5" />
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

  return (
    <div className="flex items-center gap-1 px-3 h-12 bg-canvas border-b border-border/60 flex-shrink-0">
      {TABS.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm transition-colors ${
              active
                ? "bg-surface2 text-text"
                : "text-muted hover:text-text hover:bg-surface/60"
            }`}
          >
            <span className={active ? "text-accent" : ""}>{tab.icon}</span>
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

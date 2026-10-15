from pathlib import Path

root = Path(__file__).parent
changes = {
  root / "src/types/memex.ts": [
    ('"eval" | "pulls" | "admin" | "settings";', '"eval" | "pulls" | "schedules" | "admin" | "settings";'),
  ],
  root / "src/components/layout/AppShell.tsx": [
    ('import { PullRequestsView } from "../views/PullRequestsView";', 'import { PullRequestsView } from "../views/PullRequestsView";\nimport { SchedulesView } from "../views/SchedulesView";'),
    ('          {activeTab === "pulls"     && <PullRequestsView />}', '          {activeTab === "pulls"     && <PullRequestsView />}\n          {activeTab === "schedules" && <SchedulesView />}'),
  ],
  root / "src/components/layout/TabBar.tsx": [
    ('  {\n    id: "pulls",', '''  {
    id: "schedules",
    feature: "routines",
    label: "Scheduled",
    icon: (<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="5.5" /><path d="M8 4.5V8l2.5 1.5" /></svg>),
  },
  {
    id: "pulls",'''),
  ],
  root / "src/components/dev/CodeUtilityMenu.tsx": [
    ('onNavigate: (tab: "pulls" | "goals" | "design" | "settings") => void;', 'onNavigate: (tab: "pulls" | "schedules" | "design" | "settings") => void;'),
    ('else if (id === "schedules") onNavigate("goals");', 'else if (id === "schedules") onNavigate("schedules");'),
  ],
}
for path, replacements in changes.items():
  text = path.read_text(encoding="utf-8")
  for old, new in replacements:
    if old not in text:
      raise SystemExit(f"expected fragment missing in {path}: {old}")
    text = text.replace(old, new, 1)
  path.write_text(text, encoding="utf-8")

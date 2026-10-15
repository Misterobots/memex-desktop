from pathlib import Path

root = Path(__file__).parent
changes = {
  root / "src/types/memex.ts": [
    ('"eval" | "admin" | "settings";', '"eval" | "pulls" | "admin" | "settings";'),
  ],
  root / "src/components/layout/AppShell.tsx": [
    ('import { UserPermissionsView } from "../views/UserPermissionsView";', 'import { UserPermissionsView } from "../views/UserPermissionsView";\nimport { PullRequestsView } from "../views/PullRequestsView";'),
    ('          {activeTab === "admin"     && <UserPermissionsView />}', '          {activeTab === "pulls"     && <PullRequestsView />}\n          {activeTab === "admin"     && <UserPermissionsView />}'),
  ],
  root / "src/components/layout/TabBar.tsx": [
    ('  {\n    id: "admin",', '''  {
    id: "pulls",
    feature: "code",
    label: "Pull requests",
    icon: (<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="4" cy="3.5" r="1.5" /><circle cx="12" cy="12.5" r="1.5" /><path d="M4 5v5a2.5 2.5 0 002.5 2.5H10M4 5l4 3M8 8h3" /></svg>),
  },
  {
    id: "admin",'''),
  ],
  root / "src/components/dev/CodeUtilityMenu.tsx": [
    ('onNavigate: (tab: "goals" | "design" | "settings") => void;', 'onNavigate: (tab: "pulls" | "goals" | "design" | "settings") => void;'),
    ('else if (id === "pulls") onTasks();', 'else if (id === "pulls") onNavigate("pulls");'),
  ],
}
for path, replacements in changes.items():
  text = path.read_text(encoding="utf-8")
  for old, new in replacements:
    if old not in text:
      raise SystemExit(f"expected fragment missing in {path}: {old}")
    text = text.replace(old, new, 1)
  path.write_text(text, encoding="utf-8")

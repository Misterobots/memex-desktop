from pathlib import Path

root = Path(__file__).parent
changes = {
  root / "src/types/memex.ts": [
    ('"eval" | "pulls" | "schedules" | "admin" | "settings";', '"eval" | "pulls" | "schedules" | "skills" | "admin" | "settings";'),
  ],
  root / "src/components/layout/AppShell.tsx": [
    ('import { SchedulesView } from "../views/SchedulesView";', 'import { SchedulesView } from "../views/SchedulesView";\nimport { SkillsView } from "../views/SkillsView";'),
    ('          {activeTab === "schedules" && <SchedulesView />}', '          {activeTab === "schedules" && <SchedulesView />}\n          {activeTab === "skills"    && <SkillsView />}'),
  ],
  root / "src/components/layout/TabBar.tsx": [
    ('  {\n    id: "schedules",', '''  {
    id: "skills",
    label: "Skills",
    icon: (<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 2.5h7.5a2 2 0 012 2V13l-3-1.5L6.5 13V4.5a2 2 0 00-2-2z" /><path d="M10 6h3M11.5 4.5v3" /></svg>),
  },
  {
    id: "schedules",'''),
  ],
  root / "src/components/dev/CodeUtilityMenu.tsx": [
    ('onNavigate: (tab: "pulls" | "schedules" | "design" | "settings") => void;', 'onNavigate: (tab: "pulls" | "schedules" | "design" | "skills") => void;'),
    ('else onNavigate("settings");', 'else onNavigate("skills");'),
  ],
}
for path, replacements in changes.items():
  text = path.read_text(encoding="utf-8")
  for old, new in replacements:
    if old not in text:
      raise SystemExit(f"expected fragment missing in {path}: {old}")
    text = text.replace(old, new, 1)
  path.write_text(text, encoding="utf-8")

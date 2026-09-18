from pathlib import Path
root = Path(__file__).parent
changes = {
  root / "src/types/memex.ts": [
    ('"goals" | "product_design" | "design";', '"goals" | "product_design" | "sites" | "design";'),
    ('"eval" | "pulls" | "schedules" | "skills" | "admin" | "settings";', '"eval" | "pulls" | "schedules" | "skills" | "sites" | "admin" | "settings";'),
  ],
  root / "src/lib/store.ts": [
    ('  if (tab === "design") return "product_design";', '  if (tab === "design") return "product_design";\n  if (tab === "sites") return "sites";'),
  ],
  root / "src/components/layout/AppShell.tsx": [
    ('import { SkillsView } from "../views/SkillsView";', 'import { SkillsView } from "../views/SkillsView";\nimport { SitesView } from "../views/SitesView";'),
    ('          {activeTab === "skills"    && <SkillsView />}', '          {activeTab === "skills"    && <SkillsView />}\n          {activeTab === "sites"     && <SitesView />}'),
  ],
  root / "src/components/layout/TabBar.tsx": [
    ('  {\n    id: "skills",', '''  {
    id: "sites",
    feature: "design",
    label: "Sites",
    icon: (<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2.5" width="12" height="11" rx="1.5" /><path d="M2.5 6h11M5 4.25h.01M7 4.25h.01M9 4.25h.01M5 9h6M5 11h3" /></svg>),
  },
  {
    id: "skills",'''),
  ],
  root / "src/components/dev/CodeUtilityMenu.tsx": [
    ('onNavigate: (tab: "pulls" | "schedules" | "design" | "skills") => void;', 'onNavigate: (tab: "pulls" | "schedules" | "sites" | "skills") => void;'),
    ('else if (id === "sites") onNavigate("design");', 'else if (id === "sites") onNavigate("sites");'),
  ],
}
for path, replacements in changes.items():
    text = path.read_text(encoding="utf-8")
    for old, new in replacements:
        if old not in text: raise SystemExit(f"missing in {path}: {old}")
        text = text.replace(old, new, 1)
    path.write_text(text, encoding="utf-8")

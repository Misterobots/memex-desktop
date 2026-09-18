from pathlib import Path

root = Path(__file__).parent
for path, old, new in [
    (root / "src/components/dev/CodeUtilityMenu.tsx", '  onTasks: () => void;\n', ''),
    (root / "src/components/dev/CodeUtilityMenu.tsx", 'export function CodeUtilityMenu({ onProjects, onTasks, onNavigate }: Props) {', 'export function CodeUtilityMenu({ onProjects, onNavigate }: Props) {'),
    (root / "src/components/views/DevView.tsx", ' onProjects={() => setPrimary("projects")} onTasks={() => setPrimary("tasks")} onNavigate={setActiveTab}', ' onProjects={() => setPrimary("projects")} onNavigate={setActiveTab}'),
]:
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"fragment missing in {path}: {old}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")

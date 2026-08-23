import { useCallback, useEffect, useState } from "react";
import { desktop }  from "../../lib/desktop";
import type { SkillEntry } from "../../types/memex";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function parseFrontmatter(md: string): { name?: string; version?: string; description?: string } {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const [k, ...rest] = line.split(":");
    if (k && rest.length) out[k.trim()] = rest.join(":").trim();
  }
  return out;
}

// ---------------------------------------------------------------------------
// Scanner — walks common skill directories looking for SKILL.md
// ---------------------------------------------------------------------------
async function scanSkills(bridge: NonNullable<ReturnType<typeof desktop>>): Promise<SkillEntry[]> {
  const [cwd, home] = await Promise.all([bridge.cwd(), bridge.path("home")]);
  const roots: Array<{ path: string; scope: "project" | "user" }> = [
    { path: `${cwd}/.claude/skills`, scope: "project" },
    { path: `${cwd}/.claude`, scope: "project" },
    { path: `${home}/.claude/skills`, scope: "user" },
    { path: `${home}/.claude`, scope: "user" },
  ];
  const byName = new Map<string, SkillEntry>();

  for (const root of roots) {
    try {
      const entries = await bridge.fs.readDir(root.path);
      for (const e of entries) {
        if (!e.isDir) continue;
        try {
          const sourcePath = `${e.path}/SKILL.md`;
          const skillMd = await bridge.fs.readFile(sourcePath);
          const fm = parseFrontmatter(skillMd);
          const name = fm.name ?? e.name;
          const entry: SkillEntry = {
            id:          `${root.scope}:${e.path}`,
            name,
            version:     fm.version ?? "1.0",
            enabled:     true,
            sourcePath,
            scope:       root.scope,
            description: fm.description ?? skillMd.split(/\r?\n/).find((l) => l.trim() && !l.startsWith("#") && !l.startsWith("-")) ?? "",
            modifiedAt:  new Date().toISOString(),
          };
          const key = name.trim().toLowerCase();
          // Roots are ordered project-first, then user; first match wins.
          if (!byName.has(key)) byName.set(key, entry);
        } catch {
          // No readable SKILL.md in this directory — skip.
        }
      }
    } catch {
      // Root doesn't exist or is outside the current workspace policy — skip.
    }
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function SkillRegistry() {
  const bridge = desktop();
  const [skills,    setSkills]    = useState<SkillEntry[]>([]);
  const [enabled,   setEnabled]   = useState<Set<string>>(new Set());
  const [loading,   setLoading]   = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    if (!bridge) return;
    setLoading(true);
    const found = await scanSkills(bridge);
    setSkills(found);
    setEnabled(new Set(found.filter((s) => s.enabled).map((s) => s.id)));
    setLoading(false);
  }, [bridge]);

  useEffect(() => { load(); }, [load]);

  const toggle = (id: string) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExport = async () => {
    if (!bridge) return;
    setExporting(true);
    const payload = JSON.stringify(
      skills.map((s) => ({ ...s, enabled: enabled.has(s.id) })),
      null, 2
    );
    // Write to desktop
    const dest = `${await bridge.path("home")}/Desktop/memex-skills-export.json`;
    try {
      await bridge.fs.writeFile(dest, payload);
      alert(`Exported to ${dest}`);
    } catch (e: unknown) {
      alert(`Export failed: ${(e as Error).message}`);
    }
    setExporting(false);
  };

  if (!bridge) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          Project skills in <code className="font-mono">.claude/</code> override user skills in <code className="font-mono">~/.claude/</code>.
        </p>
        <div className="flex gap-2">
          <button onClick={load}
            className="text-xs px-2 py-1 rounded-lg border border-border/60 text-muted hover:text-text">
            Refresh
          </button>
          <button onClick={handleExport} disabled={exporting || skills.length === 0}
            className="text-xs px-2 py-1 rounded-lg border border-border/60 text-muted hover:text-text disabled:opacity-40">
            Export JSON
          </button>
        </div>
      </div>

      {loading && <p className="text-xs text-muted">Scanning…</p>}

      {!loading && skills.length === 0 && (
        <p className="text-xs text-muted">No skills found.</p>
      )}

      <div className="space-y-1.5">
        {skills.map((s) => (
          <div key={s.id}
            className="flex items-start gap-3 px-3 py-2 rounded-lg border border-border/40 bg-surface2/30">
            <button
              onClick={() => toggle(s.id)}
              role="switch"
              aria-checked={enabled.has(s.id)}
              className={`mt-0.5 flex-shrink-0 w-8 h-4.5 rounded-full transition-colors relative
                ${enabled.has(s.id) ? "bg-accent" : "bg-surface2 border border-border/60"}`}
            >
              <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all
                ${enabled.has(s.id) ? "left-[18px]" : "left-0.5"}`} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium text-text">{s.name}</span>
                <span className="text-[10px] text-muted">v{s.version}</span>
                {s.scope && <span className="text-[10px] text-accent2">{s.scope}</span>}
              </div>
              {s.description && (
                <p className="text-xs text-muted truncate mt-0.5">{s.description.slice(0, 80)}</p>
              )}
              <p className="text-[10px] font-mono text-muted/60 truncate mt-0.5">{s.sourcePath}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

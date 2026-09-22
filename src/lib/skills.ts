import type { SkillEntry } from "../types/memex";

export type SkillScope = "project" | "user";

export type SkillScanRoot = { path: string; scope: SkillScope };

/** Supported local conventions for Claude and Codex skills. */
export function skillScanRoots(cwd: string, home: string): SkillScanRoot[] {
  return [
    { path: `${cwd}/.claude/skills`, scope: "project" },
    { path: `${cwd}/.claude`, scope: "project" },
    { path: `${cwd}/.codex/skills`, scope: "project" },
    { path: `${home}/.claude/skills`, scope: "user" },
    { path: `${home}/.claude`, scope: "user" },
    { path: `${home}/.codex/skills`, scope: "user" },
  ];
}

export function parseSkillFrontmatter(md: string): { name?: string; version?: string; description?: string } {
  const match = md.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, (_, doubleQuoted, singleQuoted) => doubleQuoted ?? singleQuoted);
    if (key && value) result[key] = value;
  }
  return { name: result.name, version: result.version, description: result.description };
}

function scopeRank(scope: SkillScope | undefined): number {
  return scope === "project" ? 0 : 1;
}

/** Deterministically resolves duplicate skill names: project overrides user. */
export function mergeSkillsByPrecedence(entries: SkillEntry[]): SkillEntry[] {
  const sorted = [...entries].sort((a, b) =>
    scopeRank(a.scope) - scopeRank(b.scope)
    || a.name.trim().toLowerCase().localeCompare(b.name.trim().toLowerCase())
    || a.sourcePath.localeCompare(b.sourcePath),
  );
  const selected = new Map<string, SkillEntry>();
  for (const entry of sorted) {
    const key = entry.name.trim().toLowerCase();
    if (key && !selected.has(key)) selected.set(key, entry);
  }
  return [...selected.values()].sort((a, b) => a.name.localeCompare(b.name) || a.sourcePath.localeCompare(b.sourcePath));
}

/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { mergeSkillsByPrecedence, parseSkillFrontmatter, skillScanRoots } from "../skills";
import type { SkillEntry } from "../../types/memex";

// `.agents/skills` is the tracked, canonical location. The `.claude/skills` mirror
// exists on disk for vendor tools that only read their own directory, but it is not
// committed, so a fresh clone has nothing there to glob.
const files = import.meta.glob("../../../.agents/skills/*/SKILL.md", {
  eager: true, query: "?raw", import: "default",
}) as Record<string, string>;

describe("agent flow skills are registry-visible", () => {
  it("is scanned by the project root the registry uses", () => {
    expect(skillScanRoots("C:/repo", "C:/home")).toEqual(
      expect.arrayContaining([{ path: "C:/repo/.agents/skills", scope: "project" }]),
    );
  });

  it("every flow SKILL.md yields name + version + description via the real parser", () => {
    const parsed = Object.entries(files).map(([path, md]) => ({ path, ...parseSkillFrontmatter(md) }));
    expect(parsed.length).toBeGreaterThanOrEqual(6);
    for (const p of parsed) {
      expect(p.name, `${p.path} name`).toBeTruthy();
      expect(p.version, `${p.path} version`).toBeTruthy();
      expect((p.description ?? "").length, `${p.path} description`).toBeGreaterThan(40);
    }
    expect(parsed.map((p) => p.name)).toEqual(expect.arrayContaining([
      "agent-flows", "flow-audit", "flow-batch-edit", "flow-blockout", "flow-scaffold", "flow-variants",
    ]));
  });

  it("survives precedence merge without collisions", () => {
    const entries: SkillEntry[] = Object.entries(files).map(([path, md]) => {
      const fm = parseSkillFrontmatter(md);
      return {
        id: `project:${path}`, name: fm.name ?? "?", version: fm.version ?? "1.0", enabled: true,
        sourcePath: path, description: fm.description ?? "", modifiedAt: new Date().toISOString(),
        scope: "project" as const,
      };
    });
    expect(mergeSkillsByPrecedence(entries)).toHaveLength(entries.length);
  });
});

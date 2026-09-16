import { describe, expect, it } from "vitest";
import type { SkillEntry } from "../../types/memex";
import { mergeSkillsByPrecedence, parseSkillFrontmatter, skillScanRoots } from "../skills";

const entry = (name: string, scope: "project" | "user", sourcePath: string): SkillEntry => ({
  id: `${scope}:${sourcePath}`, name, version: "1", enabled: true, sourcePath, scope, description: "", modifiedAt: "now",
});

describe("markdown skill discovery", () => {
  it("parses CRLF frontmatter and values containing colons", () => {
    expect(parseSkillFrontmatter("---\r\nname: deploy\r\ndescription: \"Use: carefully\"\r\n---\r\n# Deploy")).toMatchObject({ name: "deploy", description: "Use: carefully" });
  });

  it("always lets project skills override user skills", () => {
    const result = mergeSkillsByPrecedence([
      entry("Deploy", "user", "C:/home/.claude/skills/deploy/SKILL.md"),
      entry("deploy", "project", "C:/repo/.claude/skills/deploy/SKILL.md"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].scope).toBe("project");
  });

  it("discovers both Claude and Codex user skill conventions", () => {
    expect(skillScanRoots("C:/repo", "C:/Users/memex")).toEqual(expect.arrayContaining([
      { path: "C:/repo/.codex/skills", scope: "project" },
      { path: "C:/Users/memex/.codex/skills", scope: "user" },
    ]));
  });

  it("discovers the vendor-neutral .agents convention at both scopes", () => {
    expect(skillScanRoots("C:/repo", "C:/Users/memex")).toEqual(expect.arrayContaining([
      { path: "C:/repo/.agents/skills", scope: "project" },
      { path: "C:/Users/memex/.agents/skills", scope: "user" },
    ]));
  });

  it("prefers .agents over the vendor mirrors within the same scope", () => {
    const result = mergeSkillsByPrecedence([
      entry("flow-audit", "project", "C:/repo/.codex/skills/flow-audit/SKILL.md"),
      entry("flow-audit", "project", "C:/repo/.claude/skills/flow-audit/SKILL.md"),
      entry("flow-audit", "project", "C:/repo/.agents/skills/flow-audit/SKILL.md"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].sourcePath).toBe("C:/repo/.agents/skills/flow-audit/SKILL.md");
  });

  it("still lets a project vendor mirror beat a user-scope .agents skill", () => {
    const result = mergeSkillsByPrecedence([
      entry("flow-audit", "user", "C:/home/.agents/skills/flow-audit/SKILL.md"),
      entry("flow-audit", "project", "C:/repo/.claude/skills/flow-audit/SKILL.md"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].scope).toBe("project");
  });

  it("ranks unrecognised skill directories last", () => {
    const result = mergeSkillsByPrecedence([
      entry("flow-audit", "project", "C:/repo/vendor/skills/flow-audit/SKILL.md"),
      entry("flow-audit", "project", "C:/repo/.codex/skills/flow-audit/SKILL.md"),
    ]);
    expect(result[0].sourcePath).toBe("C:/repo/.codex/skills/flow-audit/SKILL.md");
  });
});

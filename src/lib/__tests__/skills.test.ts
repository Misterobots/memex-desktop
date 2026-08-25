import { describe, expect, it } from "vitest";
import type { SkillEntry } from "../../types/memex";
import { mergeSkillsByPrecedence, parseSkillFrontmatter } from "../skills";

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
});

// @vitest-environment jsdom
/**
 * L0 tests for src/lib/buildsheet.ts (MEMEX_LOADOUT_PLAN.md).
 *
 * FIXTURE PROVENANCE: `fixtures/unfurl-generalist.json` is the CAPTURED Build Data
 * block of a sheet generated 2026-10-02 by running the fork's REAL exportProfile()
 * source against the page's REAL window.__DATA__ (real dataset ids:
 * deepseek-ai/DeepSeek-V3, multica-ai/andrej-karpathy-skills, revfactory/harness;
 * real profile "The Generalist"), via Agent_Builder/.qwen/tmp/capture_sheet.mjs.
 * It is NOT a browser download. The test re-wraps it in a ```json fence — byte-equal
 * to the generator because exportProfile emits exactly JSON.stringify(payload, null, 2).
 * It does NOT contain: the sheet's prose sections (the parser keys only on the fenced
 * block), real bisReason prose (the capture's "why" is the literal
 * "captured-fixture reason"), the mobile export variant (no dataVersion/exported
 * keys there), or custom-user profiles. The broken-input cases below are
 * deliberately synthetic — a malformed sheet cannot be captured from a working generator.
 */
import { describe, expect, it } from "vitest";
import capture from "./fixtures/unfurl-generalist.json";
import { parseBuildSheet, planApply, skillSlug } from "../buildsheet";
import { validateRouting, type RoutingConfig } from "../../../electron/routing-config";
import { parseSkillFrontmatter } from "../skills";

const FIXTURE = "```json\n" + JSON.stringify(capture, null, 2) + "\n```";

/** Shape mirrors the owner's live config.json (read-only probe 2026-10-01). */
const LIVE: RoutingConfig = {
  runStyle: "multi",
  engines: { ollama: { kind: "ollama", baseUrl: "http://[::1]:11434" } },
  routing: {
    default: { engine: "ollama", model: "qwen3:8b" },
    embedding: { engine: "ollama", model: "nomic-embed-text:latest" },
  },
};

function sheetMd(payload: unknown): string {
  return "# x\n\n## Build Data (JSON)\n```json\n" + JSON.stringify(payload, null, 2) + "\n```\n";
}

describe("parseBuildSheet — captured fixture", () => {
  it("parses the real generated sheet", () => {
    const r = parseBuildSheet(FIXTURE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sheet.items.length).toBe(13);
    expect(r.sheet.profile.name).toBe("The Generalist");
    expect(r.sheet.memex?.mode).toBe("chat");
    const weapon = r.sheet.items.find(i => i.slot === "weapon");
    expect(weapon?.repo).toBe("deepseek-ai/DeepSeek-V3");
  });
});

describe("parseBuildSheet — negatives (synthetic on purpose)", () => {
  it("rejects a missing fence", () => {
    const r = parseBuildSheet("# no data here");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("fenced");
  });
  it("rejects unparseable JSON", () => {
    const r = parseBuildSheet("```json\n{oops\n```");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("does not parse");
  });
  it("rejects a foreign format id", () => {
    const r = parseBuildSheet(sheetMd({ format: "agent-build-sheet/999", profile: { name: "x" }, items: [] }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("agent-build-sheet/999");
  });
  it("names the exact broken item path", () => {
    const r = parseBuildSheet(sheetMd({
      format: "agent-build-sheet/1",
      profile: { name: "x" },
      items: [{ slot: "weapon", category: "MODEL", name: "n", url: "u" }],
    }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("items[0].repo");
  });
});

describe("planApply", () => {
  const sheet = (() => {
    const r = parseBuildSheet(FIXTURE);
    if (!r.ok) throw new Error(r.error);
    return r.sheet;
  })();

  it("with no engine models: nothing routes, nothing is invented", () => {
    const plan = planApply(sheet, LIVE, []);
    expect(plan.changes).toEqual([]);
    expect(plan.unmatched.length).toBe(2); // weapon + one belt MODEL
    expect(plan.unmatched.every(u => u.item.category === "MODEL")).toBe(true);
    expect(plan.skills.length).toBe(2);
    expect(plan.checklist.length).toBe(9);
    expect(plan.next).toEqual(LIVE);
    expect(validateRouting(plan.next)).toEqual([]);
  });

  it("exact repo match and tag-prefix match become routing changes", () => {
    const plan = planApply(sheet, LIVE, [
      { engine: "ollama", model: "deepseek-ai/DeepSeek-V3" },
      { engine: "ollama", model: "deepseek-ai/DeepSeek-R1:latest" },
    ]);
    expect(plan.unmatched).toEqual([]);
    const def = plan.changes.find(c => c.slot === "default");
    expect(def?.to.model).toBe("deepseek-ai/DeepSeek-V3");
    expect(def?.from?.model).toBe("qwen3:8b"); // before→after is visible, never implicit
    expect(plan.changes.find(c => c.slot === "unfurl.belt1")?.to.model).toBe("deepseek-ai/DeepSeek-R1:latest");
    expect(validateRouting(plan.next)).toEqual([]);
    expect(plan.next.routing.embedding?.model).toBe("nomic-embed-text:latest"); // untouched slots stay
  });

  it("user override routes an otherwise-unmatched MODEL — and only that slot", () => {
    const plan = planApply(sheet, LIVE, [], { default: { engine: "ollama", model: "qwen3:14b" } });
    expect(plan.changes.length).toBe(1);
    expect(plan.changes[0].slot).toBe("default");
    expect(plan.unmatched.length).toBe(1); // belt R1 has no override key
    expect(validateRouting(plan.next)).toEqual([]);
  });

  it("a bad override is caught by the REAL validator (refuse path proven)", () => {
    const plan = planApply(sheet, LIVE, [], { default: { engine: "nope", model: "whatever" } });
    const issues = validateRouting(plan.next);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some(i => i.path === "routing.default.engine")).toBe(true);
  });

  it("MODEL in a non-weapon, non-belt slot never routes", () => {
    const r = parseBuildSheet(sheetMd({
      format: "agent-build-sheet/1",
      profile: { name: "odd" },
      items: [{ slot: "chest", slotName: "Core Skill 1", category: "MODEL", repo: "a/b", name: "x", url: "u" }],
    }));
    if (!r.ok) throw new Error(r.error);
    const plan = planApply(r.sheet, LIVE, [{ engine: "ollama", model: "a/b" }]);
    expect(plan.changes).toEqual([]);
    expect(plan.unmatched[0]?.slot).toBe(null);
  });

  it("generated SKILL.md round-trips through the REAL scanner parser", () => {
    const plan = planApply(sheet, LIVE, []);
    const karpathy = plan.skills.find(s => s.slug === "multica-ai-andrej-karpathy-skills");
    expect(karpathy).toBeTruthy();
    const fm = parseSkillFrontmatter(karpathy!.content);
    expect(fm.name).toBe("Andrej Karpathy Skills (unfurl build)");
    expect(fm.version).toBe("1.0");
    expect((fm.description || "").length).toBeGreaterThan(10);
    expect(karpathy!.content).toContain("https://github.com/multica-ai/andrej-karpathy-skills");
    expect(karpathy!.content).toContain("Delete this file to unequip.");
  });

  it("slug sanitizes org/repo", () => {
    expect(skillSlug("DietrichGebert/ponytail")).toBe("dietrichgebert-ponytail");
  });

  it("mode surfaces from the memex block", () => {
    expect(planApply(sheet, LIVE, []).mode).toBe("chat");
  });
});

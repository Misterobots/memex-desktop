// @vitest-environment jsdom
/**
 * L1/L3 tests for LoadoutView (MEMEX_LOADOUT_PLAN.md).
 *
 * The bridge stub is hand-built on purpose: these tests verify CALL DISCIPLINE
 * (validate strictly before set; refusal never sets; unmatched never routes;
 * skill writes hit scanner-shaped paths), not real fs/electron behaviour.
 * Real-contract coverage lives in buildsheet.test.ts against the actual
 * validateRouting/parseSkillFrontmatter.
 *
 * FIXTURE: same captured JSON as buildsheet.test (re-wrapped fence; capture
 * provenance stated in that file's header).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoadoutView } from "./LoadoutView";
import capture from "../../lib/__tests__/fixtures/unfurl-generalist.json";

const SHEET_MD = "```json\n" + JSON.stringify(capture, null, 2) + "\n```";
const LIVE = {
  runStyle: "multi" as const,
  engines: { ollama: { kind: "ollama" as const, baseUrl: "http://x" } },
  routing: { default: { engine: "ollama", model: "qwen3:8b" } },
};

let calls: string[] = [];
let setPayloads: unknown[] = [];
let validateIssues: { path: string; message: string }[] = [];

function installBridge() {
  calls = [];
  setPayloads = [];
  validateIssues = [];
  (window as unknown as { memex: Record<string, unknown> }).memex = {
    isDesktop: true,
    path: async () => "C:/Users/test",
    engines: {
      list: async () => [{ id: "ollama", kind: "ollama", baseUrl: "http://x", label: "Ollama" }],
      models: async () => [{ engineId: "ollama", engineKind: "ollama", engineLabel: "Ollama", model: "qwen3:8b" }],
    },
    routing: {
      get: async () => { calls.push("routing.get"); return { routing: structuredClone(LIVE), errors: [] }; },
      validate: async () => { calls.push("routing.validate"); return validateIssues; },
      set: async (next: unknown) => { calls.push("routing.set"); setPayloads.push(next); return { ok: true, routing: next, issues: [] }; },
    },
    fs: {
      mkdir: async (p: string) => { calls.push(`fs.mkdir ${p}`); },
      writeFile: async (p: string) => { calls.push(`fs.writeFile ${p}`); },
    },
  };
}

async function importSheet() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([SHEET_MD], "build.md", { type: "text/markdown" });
  Object.defineProperty(input, "files", { value: [file] });
  fireEvent.change(input);
  await waitFor(() => screen.getByText(/^ROUTING/));
}

beforeEach(() => installBridge());
afterEach(() => {
  cleanup();
  delete (window as unknown as { memex?: unknown }).memex;
});

describe("LoadoutView", () => {
  it("parses the captured sheet and shows the staged sections", async () => {
    render(<LoadoutView />);
    await importSheet();
    expect(screen.getByText(/The Generalist/)).toBeTruthy();
    expect(screen.getByText(/^SKILLS/)).toBeTruthy();
    expect(screen.getByText(/^MANUAL STEPS/)).toBeTruthy();
    // nothing applied without a click:
    expect(calls.filter(c => c === "routing.set")).toHaveLength(0);
    expect(calls.filter(c => c.startsWith("fs.")).length).toBe(0);
  });

  it("routes ONLY after an explicit user override — validate strictly before set", async () => {
    render(<LoadoutView />);
    await importSheet();
    // weapon MODEL (Deepseek V3) not served by qwen3:8b → manual until chosen:
    expect(screen.getAllByText(/no local engine serves it/).length).toBeGreaterThan(0);
    expect(screen.getByText("APPLY ROUTING").hasAttribute("disabled")).toBe(true);

    const select = await screen.findByLabelText("Engine model for Core Model (Deepseek V3)");
    await userEvent.selectOptions(select, "ollama::qwen3:8b");
    await waitFor(() => expect(screen.getByText("APPLY ROUTING").hasAttribute("disabled")).toBe(false));
    await userEvent.click(screen.getByText("APPLY ROUTING"));

    await waitFor(() => expect(calls).toContain("routing.set"));
    expect(calls.indexOf("routing.validate")).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf("routing.set")).toBeGreaterThan(calls.indexOf("routing.validate"));
    const payload = setPayloads[0] as { routing: { default: { engine: string; model: string } } };
    expect(payload.routing.default).toEqual({ engine: "ollama", model: "qwen3:8b" });
    await waitFor(() => expect(screen.getByText(/Applied 1 routing change/)).toBeTruthy());
  });

  it("a validate refusal NEVER calls set", async () => {
    render(<LoadoutView />);
    await importSheet();
    const select = await screen.findByLabelText("Engine model for Core Model (Deepseek V3)");
    await userEvent.selectOptions(select, "ollama::qwen3:8b");
    validateIssues = [{ path: "routing.default.engine", message: "not in engines" }];
    await userEvent.click(screen.getByText("APPLY ROUTING"));
    await waitFor(() => expect(screen.getByText(/Validate refused/)).toBeTruthy());
    expect(calls).not.toContain("routing.set");
  });

  it("skill writes go to scanner-shaped paths under home", async () => {
    render(<LoadoutView />);
    await importSheet();
    await userEvent.click(screen.getByText("WRITE SKILL FILES"));
    await waitFor(() => expect(calls.some(c => c === "fs.mkdir C:/Users/test/.agents/skills/multica-ai-andrej-karpathy-skills")).toBe(true));
    expect(calls.some(c => c === "fs.writeFile C:/Users/test/.agents/skills/multica-ai-andrej-karpathy-skills/SKILL.md")).toBe(true);
    expect(calls.some(c => c === "fs.mkdir C:/Users/test/.agents/skills/anthropics-skills")).toBe(true);
    await waitFor(() => expect(screen.getAllByText(/written/).length).toBe(2));
  });
});

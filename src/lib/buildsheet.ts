/**
 * Build-sheet ingestion for the Loadout view (MEMEX_LOADOUT_PLAN.md L0).
 *
 * Parses an `agent-build-sheet/1` markdown export (unfurl Agent Builder fork) and
 * plans its application to Memex routing + skills. Pure by design — no Electron,
 * no fs — so tests can drive it against the REAL validateRouting from
 * electron/routing-config.ts (precedent: SetupWizard.test.tsx imports it directly).
 */
import type { RoutingConfig, RouteTarget } from "../../electron/routing-config";

export const SHEET_FORMAT = "agent-build-sheet/1";

export interface SheetItem {
  slot: string;
  slotName: string;
  category: string;
  repo: string;
  name: string;
  url: string;
  why?: string;
}

export interface SheetProfile {
  id?: string;
  name: string;
  purpose?: string;
  priorities?: string;
  deprioritizes?: string;
}

export interface BuildSheet {
  format: string;
  app?: string;
  dataVersion?: number | null;
  exported?: string;
  profile: SheetProfile;
  items: SheetItem[];
  memex?: { mode?: string; defaultModel?: string | null; [key: string]: unknown };
}

export type ParseResult = { ok: true; sheet: BuildSheet } | { ok: false; error: string };

const str = (v: unknown): v is string => typeof v === "string";

/** Extract + validate the fenced Build Data from a sheet's markdown. */
export function parseBuildSheet(md: string): ParseResult {
  const fence = /```json[^\n]*\n([\s\S]*?)\n```/.exec(md);
  if (!fence) return { ok: false, error: "No fenced ```json Build Data block found." };
  let data: unknown;
  try {
    data = JSON.parse(fence[1]);
  } catch (e) {
    return { ok: false, error: "Build Data JSON does not parse: " + (e instanceof Error ? e.message : String(e)) };
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ok: false, error: "Build Data is not a JSON object." };
  }
  const d = data as Record<string, unknown>;
  if (d.format !== SHEET_FORMAT) {
    return { ok: false, error: `Unsupported sheet format ${JSON.stringify(d.format)} — expected "${SHEET_FORMAT}".` };
  }
  const profile = d.profile;
  if (typeof profile !== "object" || profile === null || !str((profile as Record<string, unknown>).name)) {
    return { ok: false, error: "profile.name is missing." };
  }
  const pr = profile as Record<string, unknown>;
  if (!Array.isArray(d.items)) return { ok: false, error: "items[] is missing." };
  const items: SheetItem[] = [];
  for (let i = 0; i < d.items.length; i++) {
    const it = d.items[i];
    if (typeof it !== "object" || it === null) return { ok: false, error: `items[${i}] is not an object.` };
    const r = it as Record<string, unknown>;
    for (const key of ["slot", "category", "repo", "name", "url"] as const) {
      if (!str(r[key])) return { ok: false, error: `items[${i}].${key} is missing or not a string.` };
    }
    items.push({
      slot: r.slot as string,
      slotName: str(r.slotName) ? r.slotName : (r.slot as string),
      category: (r.category as string).toUpperCase(),
      repo: r.repo as string,
      name: r.name as string,
      url: r.url as string,
      why: str(r.why) && r.why ? r.why : undefined,
    });
  }
  return {
    ok: true,
    sheet: {
      format: SHEET_FORMAT,
      app: str(d.app) ? d.app : undefined,
      dataVersion: typeof d.dataVersion === "number" ? d.dataVersion : null,
      exported: str(d.exported) ? d.exported : undefined,
      profile: {
        id: str(pr.id) ? pr.id : undefined,
        name: pr.name as string,
        purpose: str(pr.purpose) ? pr.purpose : undefined,
        priorities: str(pr.priorities) ? pr.priorities : undefined,
        deprioritizes: str(pr.deprioritizes) ? pr.deprioritizes : undefined,
      },
      items,
      memex: typeof d.memex === "object" && d.memex !== null ? (d.memex as BuildSheet["memex"]) : undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// Apply planner
// ---------------------------------------------------------------------------

export interface EngineModel { engine: string; model: string; }

export interface RoutingChange { slot: string; from: RouteTarget | null; to: RouteTarget; item: SheetItem; }
export interface UnmatchedModel { item: SheetItem; slot: string | null; }
export interface SkillFile { slug: string; fileName: string; content: string; item: SheetItem; }
export interface ChecklistEntry { item: SheetItem; action: string; }

export interface ApplyPlan {
  /** routing slots this plan would write (weapon → `default`, belt MODELs → `unfurl.beltN`). */
  changes: RoutingChange[];
  /** current + changes merged — feed to routing.validate before routing.set. */
  next: RoutingConfig;
  /** MODEL items with no engine match and no override: user choice or gateway path, never a write. */
  unmatched: UnmatchedModel[];
  skills: SkillFile[];
  checklist: ChecklistEntry[];
  /** the sheet's suggested Memex mode, if it carried one. */
  mode: string | null;
}

const CHECKLIST_ACTION: Record<string, string> = {
  MODEL: "No local engine serves this model id. Add it under Settings → Model providers (gateway) or pull it on a configured engine, then re-import.",
  TOOL: "Expose to the agent per its README (MCP server or CLI).",
  PLUGIN: "Install per its README as a plugin/extension. Runtime-side registration is outside this view.",
  ITEM: "Review the repository README for how to wire it in.",
};

export function skillSlug(repo: string): string {
  return repo.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function matchEngineModel(repo: string, models: EngineModel[]): EngineModel | null {
  const needle = repo.toLowerCase();
  return models.find(m => {
    const v = m.model.toLowerCase();
    return v === needle || v.startsWith(needle + ":");
  }) ?? null;
}

function skillMarkdown(item: SheetItem, sheet: BuildSheet): string {
  const desc = (item.why || `Source repo for "${item.name}" (${item.slotName}).`).replace(/\s+/g, " ").replace(/:/g, "-").slice(0, 200);
  return [
    "---",
    `name: ${item.name} (unfurl build)`,
    "version: 1.0",
    `description: ${desc}`,
    "---",
    "",
    `# ${item.name}`,
    "",
    `Source: ${item.url}`,
    `Equipped in: ${item.slotName} (${item.slot}) — profile "${sheet.profile.name}"`,
    "",
    ...(item.why ? [item.why, ""] : []),
    "Generated by the Memex Desktop Loadout view from an agent-build-sheet/1 export. Delete this file to unequip.",
    "",
  ].join("\n");
}

/**
 * Decide what applying `sheet` would change.
 *
 * `overrides` maps a routing slot name (`default`, `unfurl.belt1`, …) to an
 * engine+model the user chose for an otherwise-unmatched MODEL — the ONLY way a
 * repo-id that no engine serves can become a routing entry.
 */
export function planApply(
  sheet: BuildSheet,
  current: RoutingConfig,
  engineModels: EngineModel[],
  overrides: Record<string, EngineModel> = {},
): ApplyPlan {
  const changes: RoutingChange[] = [];
  const unmatched: UnmatchedModel[] = [];
  const skills: SkillFile[] = [];
  const checklist: ChecklistEntry[] = [];
  const next: RoutingConfig = { runStyle: current.runStyle, engines: current.engines, routing: { ...current.routing } };

  const route = (slot: string, item: SheetItem) => {
    const chosen = matchEngineModel(item.repo, engineModels) ?? overrides[slot] ?? null;
    if (!chosen) { unmatched.push({ item, slot }); return; }
    const to: RouteTarget = { engine: chosen.engine, model: chosen.model };
    changes.push({ slot, from: current.routing[slot] ?? null, to, item });
    next.routing[slot] = to;
  };

  let beltModels = 0;
  for (const item of sheet.items) {
    if (item.category === "MODEL") {
      if (item.slot === "weapon") route("default", item);
      else if (item.slot === "belt") { beltModels += 1; route(`unfurl.belt${beltModels}`, item); }
      else unmatched.push({ item, slot: null });
      continue;
    }
    if (item.category === "SKILL") {
      skills.push({ slug: skillSlug(item.repo), fileName: "SKILL.md", content: skillMarkdown(item, sheet), item });
      continue;
    }
    checklist.push({ item, action: CHECKLIST_ACTION[item.category] ?? CHECKLIST_ACTION.ITEM });
  }

  return {
    changes,
    next,
    unmatched,
    skills,
    checklist,
    mode: typeof sheet.memex?.mode === "string" ? sheet.memex.mode : null,
  };
}

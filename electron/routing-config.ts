/**
 * The routing table (D2) — `config.json` is the source of truth for model routing.
 *
 * The schema, as it appears in the file. This is the block the D3 wizard will
 * eventually edit, so it is documented here rather than only in the plan:
 *
 * ```jsonc
 * {
 *   "runStyle": "multi",                       // "single" = pinned model, "multi" = swap on demand
 *   "engines": {
 *     "ollama-local": { "kind": "ollama",    "baseUrl": "http://[::1]:11434" },
 *     "llama-local":  { "kind": "llama.cpp", "baseUrl": "http://127.0.0.1:8080", "pinnedModel": "…" }
 *   },
 *   "routing": {
 *     "default":                { "engine": "ollama-local", "model": "qwen3:14b" },
 *     "code":                   { "engine": "ollama-local", "model": "qwen3.8:27b" },
 *     "collective.coordinator": { "engine": "ollama-local", "model": "qwen3.8:27b" },
 *     "collective.critic":      { "engine": "ollama-local", "model": "qwen3:14b" },
 *     "embedding":              { "engine": "ollama-local", "model": "nomic-embed-text:latest" }
 *   }
 * }
 * ```
 *
 * `engines` keys are the ids that `routing.*.engine` refers to, so the user names
 * them; `label` is display text only and `pinnedModel` is what `runStyle: "single"`
 * flattens the table onto. Slot names are deliberately open-ended: D2's example
 * carries five slots while its prose names more (research, image), so an
 * unrecognised slot is left in place rather than rejected as nonsense.
 *
 * Editing this file by hand is a supported action, and that decides what
 * validation may do with a mistake: report every problem in one pass, each with a
 * path to it (`routing.collective.critic.engine`), because a single opaque
 * "invalid config" would send the user back through the whole file. Repair nothing.
 * A silently fixed entry is how a typo ends up pointing a coordinator turn at a
 * model nobody chose — the failure class this app keeps rediscovering.
 *
 * Electron-free by this repo's convention (profile-migration.ts, engine-registry.ts,
 * ollama-residency.ts) so the resolution rules can be *shared* with the picker
 * instead of mirrored into `src/lib` and drift: `resolveRoute` is imported by
 * `ModelPickerPopover.tsx` and called by the main process on the same code.
 */
import type { EngineKind } from "./engine-registry";

/** "single" = one pinned model on one engine; "multi" = swap models on demand. */
export type RunStyle = "single" | "multi";

/** An engine this install runs, as the user declared it. */
export interface EngineConfig {
  kind: EngineKind;
  baseUrl: string;
  label?: string;
  /** The model a `runStyle: "single"` box serves. llama.cpp pins it at launch;
   * Ollama does not need it, which is why it is optional here. */
  pinnedModel?: string;
}

/** What a slot sends: one engine's id plus the model to ask that engine for. */
export interface RouteTarget {
  engine: string;
  model: string;
}

/** The routing block: `runStyle`, `engines` and `routing`, the three keys
 * `config.json` carries at top level. */
export interface RoutingConfig {
  runStyle: RunStyle;
  engines: Record<string, EngineConfig>;
  routing: Record<string, RouteTarget>;
}

/** One problem with one value, addressed by its path in the file. */
export interface RoutingIssue {
  path: string;
  message: string;
}

/** `getRouting()` — the effective table plus whatever is wrong with it. */
export interface RoutingState {
  routing: RoutingConfig;
  errors: RoutingIssue[];
}

/** `saveRouting()` — a rejected write carries the issues that caused it and has
 * left both the stored config and the file on disk untouched. */
export interface RoutingResult {
  ok: boolean;
  routing: RoutingConfig;
  issues: RoutingIssue[];
}

/**
 * The answer to "which slot did this model come from?". `slot` is the entry that
 * actually supplied the target, not the one that was asked for, so the UI can name
 * the origin of a substitution instead of quietly making one.
 */
export interface ResolvedRoute {
  requested: string;
  slot: string | null;
  target: RouteTarget | null;
  usedFallback: boolean;
}

/** The slot everything else falls back to, and the one the model picker follows. */
export const DEFAULT_SLOT = "default";

/** The fallback `ConfigStore.getUrls()` applies when a profile names no Ollama
 * daemon, so a config derived from such a profile probes the same address the old
 * handler would have. */
export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";

/** Kinds this build can discover models for. Anything else is reported, not guessed at. */
const KNOWN_KINDS: readonly string[] = ["ollama", "llama.cpp"];

/** The fields of a `RuntimeProfile` that a routing table can be derived from. */
export interface ProfileRoutingSource {
  ollama?: string;
  llamaCpp?: string;
  defaultModel?: string;
}

// ---------------------------------------------------------------------------
// Reading a stored block
// ---------------------------------------------------------------------------

/**
 * The three routing keys as a config holds them, or null when it has no block.
 * `engines` is the presence test: it is the key nothing else in the file can
 * supply, and a config that has one has been edited to have a routing table —
 * even an unfinished one, which validation then reports on instead of
 * overwriting with a derived default.
 */
export function readRoutingBlock(source: Record<string, unknown> | null | undefined): RoutingConfig | null {
  if (!isRecord(source) || !isRecord(source.engines)) return null;
  return {
    runStyle: source.runStyle as RunStyle,
    engines: source.engines as Record<string, EngineConfig>,
    routing: isRecord(source.routing) ? (source.routing as Record<string, RouteTarget>) : {},
  };
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve one named slot, falling back to `routing.default`.
 *
 * The fallback is returned rather than hidden: `usedFallback` plus the `slot` that
 * answered is how the picker says "qwen3:14b, from slot default" instead of
 * presenting another slot's model as though it had been chosen for this purpose.
 */
export function resolveRoute(routing: RoutingConfig | null | undefined, slot: string): ResolvedRoute {
  const table = routing?.routing ?? {};
  const direct = table[slot];
  if (direct) return { requested: slot, slot, target: direct, usedFallback: false };
  const fallback = table[DEFAULT_SLOT];
  if (fallback) {
    return { requested: slot, slot: DEFAULT_SLOT, target: fallback, usedFallback: true };
  }
  return { requested: slot, slot: null, target: null, usedFallback: false };
}

/**
 * The one model a `runStyle: "single"` box can serve everywhere: the engine named
 * by `routing.default` if it has one, else its only engine. `pinnedModel` wins over
 * the default slot's model, because the pin is what the engine was launched with.
 *
 * null means there is nothing to pin to, which is a validation error rather than a
 * state to invent a model for.
 */
export function pinnedTarget(routing: RoutingConfig): { engineId: string; target: RouteTarget } | null {
  const ids = Object.keys(routing.engines ?? {});
  const preferred = routing.routing?.[DEFAULT_SLOT];
  const engineId = preferred && preferred.engine in routing.engines
    ? preferred.engine
    : ids.length === 1 ? ids[0]! : null;
  if (engineId === null) return null;
  const model = (routing.engines[engineId]?.pinnedModel ?? "").trim() || (preferred?.model ?? "").trim();
  return model ? { engineId, target: { engine: engineId, model } } : null;
}

/**
 * Make the table honest about the run style.
 *
 * `runStyle: "single"` cannot honour a per-slot table — llama.cpp pins one model at
 * launch, so per-slot variety is physically unavailable on such a box. Rather than
 * send a table the engine cannot satisfy, every existing slot is rewritten to the
 * pinned model and the slots that changed come back in `overridden`, so the caller
 * can tell the user what happened. Flattening silently would be the degradation D2
 * names explicitly.
 *
 * `"multi"` returns the same object reference it was given: nothing is rewritten,
 * not even normalised.
 */
export function flattenForRunStyle(routing: RoutingConfig): {
  routing: RoutingConfig;
  pinned: RouteTarget | null;
  overridden: string[];
} {
  if (routing.runStyle !== "single") return { routing, pinned: null, overridden: [] };
  const pin = pinnedTarget(routing);
  if (!pin) return { routing, pinned: null, overridden: [] };

  const overridden: string[] = [];
  const flattened: Record<string, RouteTarget> = {};
  for (const [slot, target] of Object.entries(routing.routing ?? {})) {
    // Only slots that were already there are rewritten: an empty table has nothing
    // to mislead with, and inventing slots is the repair this module refuses to do.
    if (target.engine === pin.target.engine && target.model === pin.target.model) {
      flattened[slot] = target;
    } else {
      flattened[slot] = pin.target;
      overridden.push(slot);
    }
  }
  return { routing: { ...routing, routing: flattened }, pinned: pin.target, overridden };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Every problem with a candidate routing block, in one pass.
 *
 * Takes `unknown` because that is what a hand-edited file and an IPC argument
 * actually are; a well-formed `RoutingConfig` validates to `[]`.
 */
export function validateRouting(candidate: unknown): RoutingIssue[] {
  const issues: RoutingIssue[] = [];
  if (!isRecord(candidate)) {
    return [{ path: "(root)", message: "expected an object with runStyle, engines and routing" }];
  }

  const runStyle = candidate.runStyle;
  if (runStyle !== "single" && runStyle !== "multi") {
    issues.push({
      path: "runStyle",
      message: `expected "single" or "multi", found ${describe(runStyle)}`,
    });
  }

  if (!isRecord(candidate.engines)) {
    issues.push({ path: "engines", message: `expected a map of engine id to { kind, baseUrl }, found ${describe(candidate.engines)}` });
  }
  const engines = isRecord(candidate.engines) ? candidate.engines : {};
  const engineIds = Object.keys(engines);
  for (const [id, rawEngine] of Object.entries(engines)) {
    const path = `engines.${id}`;
    if (!isRecord(rawEngine)) {
      issues.push({ path, message: `expected { kind, baseUrl }, found ${describe(rawEngine)}` });
      continue;
    }
    if (typeof rawEngine.kind !== "string" || !KNOWN_KINDS.includes(rawEngine.kind)) {
      issues.push({
        path: `${path}.kind`,
        message: `unknown engine kind ${describe(rawEngine.kind)} — this build discovers ${KNOWN_KINDS.join(" and ")}`,
      });
    }
    const baseUrl = text(rawEngine.baseUrl);
    if (!baseUrl) {
      issues.push({ path: `${path}.baseUrl`, message: "is empty; the engine would be addressed at no address at all" });
    } else if (!isHttpUrl(baseUrl)) {
      issues.push({ path: `${path}.baseUrl`, message: `${describe(rawEngine.baseUrl)} is not a valid http(s) URL` });
    }
    if (rawEngine.pinnedModel !== undefined && !text(rawEngine.pinnedModel)) {
      issues.push({ path: `${path}.pinnedModel`, message: "give it a model name or remove the key; an empty pin pins nothing" });
    }
  }

  if (candidate.routing !== undefined && !isRecord(candidate.routing)) {
    issues.push({ path: "routing", message: `expected a map of slot name to { engine, model }, found ${describe(candidate.routing)}` });
  }
  const table = isRecord(candidate.routing) ? candidate.routing : {};
  for (const [slot, rawTarget] of Object.entries(table)) {
    const path = `routing.${slot}`; // dotted slot names read as the file spells them
    if (!isRecord(rawTarget)) {
      issues.push({ path, message: `expected { engine, model }, found ${describe(rawTarget)}` });
      continue;
    }
    const engine = text(rawTarget.engine);
    if (!engine) {
      issues.push({ path: `${path}.engine`, message: `is empty; expected one of ${engineIds.length ? engineIds.join(", ") : "(no engines configured)"}` });
    } else if (!(engine in engines)) {
      issues.push({
        path: `${path}.engine`,
        message: `${describe(engine)} is not in engines${engineIds.length ? ` — configured: ${engineIds.join(", ")}` : " — engines is empty"}`,
      });
    }
    if (!text(rawTarget.model)) {
      issues.push({ path: `${path}.model`, message: `slot ${slot} names no model` });
    }
  }

  if (runStyle === "single") {
    const block: RoutingConfig = {
      runStyle: "single",
      engines: engines as Record<string, EngineConfig>,
      routing: table as Record<string, RouteTarget>,
    };
    if (!pinnedTarget(block)) {
      issues.push({
        path: engineIds.length === 1 ? `engines.${engineIds[0]}.pinnedModel` : "runStyle",
        message: engineIds.length === 1
          ? 'runStyle "single" needs a model to pin: set this engine\'s pinnedModel or give routing.default a model'
          : 'runStyle "single" pins one model everywhere; name it in routing.default or configure exactly one engine with a pinnedModel',
      });
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Deriving and migrating what exists today
// ---------------------------------------------------------------------------

/**
 * A valid default table from the fields an existing install already has, so an
 * install with no routing block keeps working exactly as it routes now.
 *
 * `runStyle` is "multi" because that is what today's behaviour is: one Ollama
 * daemon from which models swap on demand. Deriving "single" would be inventing a
 * hardware constraint nobody declared — choosing a style is the wizard's job (D3).
 * The engine ids match what `engineDescriptors` produced before this table existed,
 * so the picker's rows and their labels do not change under a user who did not edit
 * anything.
 */
export function deriveRoutingFromProfile(profile: ProfileRoutingSource | null | undefined): RoutingConfig {
  const engines: Record<string, EngineConfig> = {
    ollama: {
      kind: "ollama",
      baseUrl: normaliseBaseUrl(profile?.ollama) || DEFAULT_OLLAMA_BASE_URL,
      label: "Ollama",
    },
  };
  const llamaCpp = normaliseBaseUrl(profile?.llamaCpp);
  if (llamaCpp) engines["llama.cpp"] = { kind: "llama.cpp", baseUrl: llamaCpp, label: "llama.cpp" };

  const model = text(profile?.defaultModel);
  const routing: Record<string, RouteTarget> = {};
  // No default entry rather than one with an empty model: the latter is a
  // validation failure, and a profile that never recorded a model is not one.
  if (model) routing[DEFAULT_SLOT] = { engine: "ollama", model };

  return { runStyle: "multi", engines, routing };
}

/**
 * Give a parsed config the routing block, in `load()`'s path.
 *
 * Unrecognised keys survive because the whole config is copied, not rebuilt — the
 * file holds settings this module has never heard of, and losing one of them to a
 * migration would be a far worse bug than the missing block it fixes. Idempotent:
 * once the block exists it is left alone, so a later hand-edit of `engines` is
 * judged by `validateRouting` instead of overwritten by this.
 */
export function migrateToRouting<T extends Record<string, unknown>>(raw: T): { config: T; changed: boolean } {
  if (readRoutingBlock(raw)) return { config: raw, changed: false };

  const profiles = Array.isArray(raw.profiles) ? (raw.profiles as ProfileRoutingSource[]) : [];
  const active = profiles.find((p) => isRecord(p) && (p as { id?: unknown }).id === raw.activeProfileId) ?? profiles[0];
  const derived = deriveRoutingFromProfile(active);

  return {
    config: { ...raw, runStyle: derived.runStyle, engines: derived.engines, routing: derived.routing } as T,
    changed: true,
  };
}

// ---------------------------------------------------------------------------
// Small readers — a hand-edited file gets judged on what it actually contains
// ---------------------------------------------------------------------------

/** Trims and drops trailing slashes, so `http://host:11434/` is one address. */
function normaliseBaseUrl(raw: string | undefined): string {
  return (raw ?? "").trim().replace(/\/+$/, "");
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Quoted so `"ollma-local"` reads as a typo for `ollama-local`, not as nothing. */
function describe(value: unknown): string {
  if (value === undefined) return "(absent)";
  if (typeof value === "string") return JSON.stringify(value);
  if (value === null || typeof value !== "object") return String(value);
  return Array.isArray(value) ? "an array" : "an object";
}

/**
 * Engine registry — the desktop's own answer to "what can this box run?"
 *
 * Model discovery used to ask the agent runtime (`{agentRuntime}/v1/models`),
 * which assumes the runtime owns the inference engine. It no longer does: each
 * install points at an engine its own user runs. With Ollama up and the
 * orchestrator stopped the picker went empty while its own "in VRAM" banner —
 * read straight off the daemon by `ollama:getLoadedModels` — still listed the
 * loaded models, because the app held two sources of truth for one engine and
 * the indirect one fed the list.
 *
 * Discovery lives in the main process for a second reason: the renderer may only
 * fetch URLs inside the active profile (`ipc-handlers.ts`, `prepareApiRequest`),
 * so a llama.cpp lane the profile does not name is unreachable from the picker.
 *
 * Two engines are live at once on the rigs this app targets. The coding lane runs
 * llama-server *alongside* Ollama, pinned to one GGUF with an `--alias`
 * (Agent_Swarm/execution_plane/llama-server.yml), so a normalised row has to name
 * its engine to mean anything, and a list built from only one of them is wrong.
 *
 * Electron-free by this repo's convention (health-status.ts, ollama-residency.ts,
 * profile-migration.ts): every function takes a descriptor and an injectable
 * fetch, so the whole module is testable without a main process.
 */

export type EngineKind = "ollama" | "llama.cpp";

export interface EngineDescriptor {
  id: string;
  kind: EngineKind;
  baseUrl: string;
  label?: string;
}

/** One row, same shape whichever engine produced it. */
export interface EngineModel {
  engineId: string;
  engineKind: EngineKind;
  engineLabel: string;
  /** The name the engine accepts on the wire, which is also what the user sees:
   * an Ollama tag (`qwen3:14b`) or a llama.cpp `--alias` (`qwen3-coder:30b`). */
  model: string;
  sizeBytes?: number;
  /** llama-server answers /health only once its pinned model is loaded, so those
   * rows are resident by definition. Ollama residency keeps coming from the
   * existing /api/ps sweep, which counts load identity — not duplicated here. */
  resident?: boolean;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Mirrors the fallback `ConfigStore.getUrls()` applies when a profile names no
 * Ollama daemon, so the registry reports what the old handler would have probed. */
export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";

const PROBE_TIMEOUT_MS = 4000;

/** The slice of a routing profile the registry reads. D2 replaces `ollama` and
 * `llamaCpp` with a full `engines` map; because callers go through descriptors,
 * that swap lands here and nowhere else. */
export interface ProfileEngineUrls {
  ollama?: string;
  llamaCpp?: string;
}

export function engineDescriptors(profile: ProfileEngineUrls | null | undefined): EngineDescriptor[] {
  const engines: EngineDescriptor[] = [];
  const ollama = baseUrl(profile?.ollama, DEFAULT_OLLAMA_BASE_URL);
  if (ollama) engines.push({ id: "ollama", kind: "ollama", baseUrl: ollama, label: "Ollama" });
  const llamaCpp = baseUrl(profile?.llamaCpp);
  if (llamaCpp) engines.push({ id: "llama.cpp", kind: "llama.cpp", baseUrl: llamaCpp, label: "llama.cpp" });
  return engines;
}

/** A hand-edited config.json is expected to carry these URLs, so trailing
 * slashes and stray whitespace must not produce `//api/tags`. */
function baseUrl(raw: string | undefined, fallback = ""): string {
  const trimmed = (raw ?? "").trim().replace(/\/+$/, "");
  return trimmed || fallback;
}

export async function discoverEngineModels(engine: EngineDescriptor, fetchFn: FetchLike = fetch): Promise<EngineModel[]> {
  switch (engine.kind) {
    case "ollama":
      return discoverOllamaModels(engine, fetchFn);
    case "llama.cpp":
      return discoverLlamaCppModels(engine, fetchFn);
    default:
      return []; // a kind this build doesn't speak contributes nothing, rather than throwing at the picker
  }
}

/** Every engine the active profile names. One engine refusing to answer must not
 * hide the other's models — showing both at once is the point of the lane. */
export async function discoverAllEngineModels(
  engines: EngineDescriptor[],
  fetchFn: FetchLike = fetch,
): Promise<EngineModel[]> {
  const lists = await Promise.all(engines.map((engine) => discoverEngineModels(engine, fetchFn).catch(() => [])));
  return lists.flat();
}

/** Ollama `GET /api/tags` → `{ models: [{ name, size?, digest?, details?… }] }`. */
export async function discoverOllamaModels(engine: EngineDescriptor, fetchFn: FetchLike = fetch): Promise<EngineModel[]> {
  const tags = await probe(fetchFn, `${engine.baseUrl}/api/tags`);
  if (!tags?.ok) return [];
  return modelRecords(tags.payload, "models").flatMap((m) => {
    const name = text(m.name);
    return name ? [row(engine, name, number(m.size))] : [];
  });
}

/**
 * llama-server `GET /health` + `GET /props` + `GET /v1/models`.
 *
 * `/health` is the gate: llama.cpp reports it only after the pinned model is
 * loaded and serving, so a half-started lane offers no runnable entry. The model
 * itself comes from `/v1/models`, whose OpenAI-shaped `data` array falls back to
 * the GGUF path when no `--alias` was given — which is why `/props.model_alias`
 * outranks it. `/props` is fetched best-effort: a lane without it still lists.
 */
export async function discoverLlamaCppModels(engine: EngineDescriptor, fetchFn: FetchLike = fetch): Promise<EngineModel[]> {
  const health = await probe(fetchFn, `${engine.baseUrl}/health`);
  if (!health?.ok) return [];
  const [props, listed] = await Promise.all([
    probe(fetchFn, `${engine.baseUrl}/props`),
    probe(fetchFn, `${engine.baseUrl}/v1/models`),
  ]);
  const alias = text(field(props?.ok ? props.payload : null, "model_alias"));
  const reported = modelRecords(listed?.ok ? listed.payload : null, "data", "models")
    .map((m) => text(m.name) || text(m.model) || text(m.id))
    .filter(Boolean);
  // One `--model` per lane, so a single alias names every row it reports (and an
  // empty /v1/models still has the pinned model). Two distinct names mean a
  // server this file does not describe — show what it actually reported.
  const models = alias && reported.length <= 1 ? [alias] : reported;
  return models.map((model) => ({ ...row(engine, model), resident: true }));
}

/** null: nothing answered at all. `ok: false`: it answered with an error status. */
async function probe(fetchFn: FetchLike, url: string): Promise<{ ok: boolean; payload: unknown } | null> {
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    if (!res.ok) return { ok: false, payload: null };
    // A 200 with an unparsable body is an engine this build can't read, not a
    // reason to leave the picker without a list.
    return { ok: true, payload: await res.json().catch(() => null) };
  } catch {
    return null;
  }
}

function row(engine: EngineDescriptor, model: string, sizeBytes?: number): EngineModel {
  return {
    engineId: engine.id,
    engineKind: engine.kind,
    engineLabel: engine.label ?? engine.id,
    model,
    ...(sizeBytes === undefined ? {} : { sizeBytes }),
  };
}

/** A payload's model array: Ollama uses `models`, OpenAI-compatible servers use
 * `data`. llama.cpp builds have been seen returning the array unboxed. */
function modelRecords(payload: unknown, ...keys: string[]): Record<string, unknown>[] {
  if (Array.isArray(payload)) return objects(payload);
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  for (const key of keys) {
    if (Array.isArray(record[key])) return objects(record[key] as unknown[]);
  }
  return [];
}

function objects(list: unknown[]): Record<string, unknown>[] {
  return list.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object");
}

function field(payload: unknown, name: string): unknown {
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>)[name] : undefined;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

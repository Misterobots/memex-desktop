/**
 * runtime-nodes.ts — the topology the orchestrator reports about its model hosts.
 *
 * `GET {agentRuntime}/api/v1/health/nodes` already answers per-node model
 * availability. `health.ts` reads it and collapses the whole payload to a
 * connected/disconnected dot; this module keeps the detail, because assigning a
 * swarm role needs to know whether the runtime can reach that model at all.
 *
 * It deliberately does **not** decide placement. Host choice lives in the
 * runtime (`agents/utils/gpu_queue.py`: residency first, then a name allowlist),
 * and the two host variables mean opposite things depending on which machine
 * runs the container — so the app reads this to *inform* a choice, never to
 * command one. See plan `D5`.
 */

import type { FetchLike } from "./engine-registry";

export interface RuntimeNode {
  /** The runtime's own label for the host ("Lovelace", "Turing"). Falls back to
   * the host address when the report omits a name. */
  name: string;
  host: string;
  healthy: boolean;
  /** `null` when the runtime does not know. Never coerced to `0`: a null here
   * means `agent_runtime` cannot see the GPU, and inventing a size would let the
   * role editor claim a capacity nothing measured. */
  vramMb: number | null;
  vramSource: string;
  loadedModels: string[];
  availableModels: string[];
}

export interface RuntimeTopology {
  /** Empty means *unknown*, not "no hosts" — see `reason`. Callers must not turn
   * an unread topology into a blocked editor. */
  nodes: RuntimeNode[];
  /** Why `nodes` is empty, in the user's terms. `null` when the read succeeded. */
  reason: string | null;
  checkedAt: string;
}

export type ModelAvailability = "available" | "absent" | "unknown";

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "")
    .map((entry) => entry.trim());
}

/** One entry, or nothing at all when the entry is unusable. A malformed node is
 * dropped rather than guessed at: a partially-read topology is worse than a
 * missing one, because it would let `absent` be reported for a model the reader
 * simply failed to parse. */
function parseNode(entry: unknown): RuntimeNode | null {
  if (!entry || typeof entry !== "object") return null;
  const node = entry as Record<string, unknown>;
  const host = typeof node.host === "string" ? node.host.trim() : "";
  const named = typeof node.name === "string" ? node.name.trim() : "";
  if (!named && !host) return null;
  const vram = typeof node.vram_mb === "number" && Number.isFinite(node.vram_mb) ? node.vram_mb : null;
  return {
    name: named || host,
    host,
    healthy: node.healthy === true,
    vramMb: vram,
    vramSource: typeof node.vram_source === "string" ? node.vram_source.trim() : "unknown",
    loadedModels: strings(node.loaded_models),
    availableModels: strings(node.available_models),
  };
}

export function parseRuntimeNodes(payload: unknown): RuntimeNode[] {
  const raw = (payload as { nodes?: unknown } | null)?.nodes;
  if (!Array.isArray(raw)) return [];
  return raw.reduce<RuntimeNode[]>((acc, entry) => {
    const node = parseNode(entry);
    if (node) acc.push(node);
    return acc;
  }, []);
}

/**
 * Can the runtime reach this model?
 *
 * `unknown` (empty or unread topology) is deliberately distinct from `absent`:
 * only a read that actually enumerated hosts can say a model is missing. A
 * stopped runtime is not evidence that a model does not exist.
 */
export function modelAvailability(nodes: RuntimeNode[], model: string): ModelAvailability {
  const target = (model || "").trim().toLowerCase();
  if (!target || nodes.length === 0) return "unknown";
  const reachable = nodes.filter((node) => node.healthy);
  if (reachable.length === 0) return "unknown";
  const found = reachable.some((node) => node.availableModels.some((m) => m.toLowerCase() === target));
  return found ? "available" : "absent";
}

/** Which healthy hosts report this model — the detail a role editor should show
 * instead of a yes/no. */
export function hostsReportingModel(nodes: RuntimeNode[], model: string): RuntimeNode[] {
  const target = (model || "").trim().toLowerCase();
  if (!target) return [];
  return nodes.filter((node) =>
    node.healthy && node.availableModels.some((m) => m.toLowerCase() === target),
  );
}

/** The capacity phrase on its own, so a caller never has to parse `describeNode`
 * to find it. Null stays "capacity unknown" — it is never rendered as `0 GB`. */
export function capacityLabel(node: RuntimeNode): string {
  if (node.vramMb === null) return "capacity unknown";
  const gb = (node.vramMb / 1024);
  return `${Math.round(gb * 10) / 10} GB`;
}

/** One line of prose, with no invented numbers. */
export function describeNode(node: RuntimeNode): string {
  const loaded = node.loadedModels.length > 0 ? `, ${node.loadedModels.length} loaded` : "";
  return `${node.name} · ${node.availableModels.length} models · ${capacityLabel(node)}${loaded} · ${node.healthy ? "healthy" : "unreachable"}`;
}

/** Only the profile's stored URL is fetched, and only over http(s): the same
 * rule every other main-side read follows, so the renderer cannot aim this at an
 * address of its own choosing. */
function isHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export async function readRuntimeTopology(
  agentRuntimeUrl: string,
  fetchFn: FetchLike = fetch,
): Promise<RuntimeTopology> {
  const base = (agentRuntimeUrl || "").trim().replace(/\/+$/, "");
  const fail = (reason: string): RuntimeTopology => ({ nodes: [], reason, checkedAt: new Date().toISOString() });
  if (!isHttpUrl(base)) return fail("The active profile has no usable runtime address.");
  try {
    const response = await fetchFn(`${base}/api/v1/health/nodes`, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return fail(`The runtime answered ${response.status} for its node report.`);
    const nodes = parseRuntimeNodes(await response.json());
    if (nodes.length === 0) return fail("The runtime reported no model hosts.");
    return { nodes, reason: null, checkedAt: new Date().toISOString() };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return fail(`Could not read the runtime's node report: ${detail.slice(0, 120)}`);
  }
}

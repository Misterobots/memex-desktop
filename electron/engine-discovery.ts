/**
 * Engine discovery — "is it installed, is it running, at what address, and how do
 * you know" (D3 requirement 1).
 *
 * `inspectLocalLlm()` used to answer the weakest of those four: it probed one
 * hardcoded address per service and reported reachable / not reachable. That is
 * silent about the two states a setup wizard actually needs — Ollama installed but
 * not started, and Ollama running on the port named by `OLLAMA_HOST` rather than on
 * the one this app happened to guess. A user whose daemon listens on 11500 was told
 * "not reachable", and a user with the binary present but stopped was told the same
 * thing, with no address and no reason.
 *
 * So each kind is answered three ways, and the answer says which it was:
 *
 *   Ollama      — a live `GET /api/tags` proves running. With nothing answering, an
 *                 installed binary is looked for where Ollama is documented or
 *                 configured to be (`OLLAMA_HOST`, PATH,
 *                 `%LOCALAPPDATA%\Programs\Ollama`), and the address it *would* use
 *                 comes back marked as inferred.
 *   llama.cpp   — a live `GET /health` proves running, and nothing else proves
 *                 anything. See `discoverLlamaCpp` for why that asymmetry is
 *                 deliberate rather than an unfinished version of the Ollama path.
 *
 * Every result carries `evidence`: the sentence the UI shows. "We found it" without
 * a reason is the same trust problem as a model list without an engine label
 * (D1b) — a user cannot tell a detection from a guess, so the app must not either.
 *
 * Electron-free and fs-free by this repo's convention (engine-registry.ts,
 * routing-config.ts, profile-migration.ts): the file/path probe, the environment and
 * fetch are all injected, so the whole module — including paths a test machine has no
 * hope of containing — is exercised directly. Real probes are supplied where the
 * composition happens (`ipc-handlers.ts`).
 */
import type { EngineKind, FetchLike } from "./engine-registry";

/** "yes" is proven (contacted, or a binary we stat'ed). "inferred" is a pointer that
 * was not confirmed. "unknown" means this app does not know, and says so. */
export type InstalledVerdict = "yes" | "inferred" | "unknown";

export interface EngineDiscovery {
  kind: EngineKind;
  installed: InstalledVerdict;
  running: boolean;
  /** The address to use — reached, or (for a stopped Ollama) the one it would use.
   * Null when there is nothing to address, which is what keeps a wizard from offering
   * to route at a machine with no engine on it. */
  baseUrl: string | null;
  /** The reason, in one sentence, safe to show verbatim. */
  evidence: string;
  /** Model names the *running* engine reported. Empty for anything not answering: a
   * stopped engine's inventory is not knowable, and inventing one is how a lane gets
   * promised that does not exist. The picker's authoritative list stays in
   * engine-registry.ts — this is only enough to tell "one thing to run" from
   * "several", which is what `proposeRunStyle` asks. */
  models: string[];
}

export interface DiscoveryDeps {
  /** Is there a file at this absolute path? Injected so this module never imports
   * `fs`, and so a test can state what this machine contains. */
  fileExists: (path: string) => boolean | Promise<boolean>;
  env: Record<string, string | undefined>;
  platform: NodeJS.Platform;
  fetchFn?: FetchLike;
}

/** What the user or the config already knows, which outranks any default probed here. */
export interface DiscoveryRequest {
  /** Addresses configured by the user, probed before the defaults. Blank entries ignored. */
  configuredUrls?: readonly string[];
  /** A binary path the user supplied — the "or ask for the install location" half of the rule. */
  binaryPath?: string;
}

export const DEFAULT_OLLAMA_PORT = 11434;
export const DEFAULT_LLAMA_CPP_PORT = 8080;

/** Loopback addresses worth asking when nothing is configured. `[::1]` first for
 * Ollama because the Docker/WSL relay on this app's reference box listens on IPv6
 * loopback only, and Windows resolves `localhost` to an unusable IPv4 route (the
 * reason `config-store.ts`'s localhost seed spells the address out). */
const OLLAMA_PROBE_URLS = ["http://[::1]:11434", "http://127.0.0.1:11434"];
/** llama-server's own default is 8080; 8011 is the port the deployment this app was
 * built against uses. Two cheap loopback probes, no more — an unbounded port sweep in
 * a setup wizard would be the wrong kind of curious. */
const LLAMA_CPP_PROBE_URLS = ["http://127.0.0.1:8080", "http://127.0.0.1:8011"];

const PROBE_TIMEOUT_MS = 2500;

/** Both kinds, in the order a reader expects them: the swap engine, then the pinned lane. */
export async function discoverEngines(
  request: { ollama?: DiscoveryRequest; llamaCpp?: DiscoveryRequest },
  deps: DiscoveryDeps,
): Promise<EngineDiscovery[]> {
  const [ollama, llamaCpp] = await Promise.all([
    discoverOllama(request.ollama ?? {}, deps),
    discoverLlamaCpp(request.llamaCpp ?? {}, deps),
  ]);
  return [ollama, llamaCpp];
}

/**
 * Ollama: a live `/api/tags` proves running; a binary on disk proves installed;
 * `OLLAMA_HOST` says where to look, and where it would listen if nothing is there.
 */
export async function discoverOllama(request: DiscoveryRequest, deps: DiscoveryDeps): Promise<EngineDiscovery> {
  const fetchFn = deps.fetchFn ?? fetch;
  const configured = cleanUrls(request.configuredUrls);
  const fromEnv = baseUrlFromHost(deps.env.OLLAMA_HOST, DEFAULT_OLLAMA_PORT);
  const candidates = dedupe([...configured, ...(fromEnv ? [fromEnv] : []), ...OLLAMA_PROBE_URLS]);
  const { serving, contacted } = await probeAddresses(fetchFn, candidates, "/api/tags");

  if (serving) {
    const models = listField(serving.json, "models", "name");
    const source = configured.includes(serving.baseUrl)
      ? " (configured by you)"
      : fromEnv === serving.baseUrl ? " (from OLLAMA_HOST)" : "";
    return {
      kind: "ollama", installed: "yes", running: true, baseUrl: serving.baseUrl, models,
      evidence: `GET ${serving.baseUrl}/api/tags answered ${serving.status}`
        + `${models.length ? ` with ${models.length} model${models.length === 1 ? "" : "s"}: ${models.join(", ")}` : " with no models pulled yet"}${source}.`,
    };
  }

  // Nothing serving a model list. Before reporting "not installed", look for the
  // program itself — installed-and-stopped is the state that used to be invisible.
  const found = await findOllamaBinary(request, deps);
  const listening = fromEnv ?? configured[0] ?? contacted?.baseUrl ?? OLLAMA_PROBE_URLS[1]!;
  const notServing = contacted
    ? `GET ${contacted.baseUrl}/api/tags answered ${contacted.status}, which is not a model list`
    : `Nothing answered GET ${listening}/api/tags`;
  const where = fromEnv ? `OLLAMA_HOST is set to ${String(deps.env.OLLAMA_HOST).trim()}` : `the default port`;

  if (found) {
    return {
      kind: "ollama", installed: "yes", running: false, baseUrl: listening, models: [],
      evidence: `Found ${found}, but ${notServing}. ${listening} is the address it would use (inferred, from ${where}) — start Ollama and scan again, or correct the address under Advanced.`,
    };
  }
  if (configured.length || fromEnv) {
    // A pointer, not a proof: configuration records intent to run Ollama, so the
    // verdict is "inferred" and never "yes".
    return {
      kind: "ollama", installed: "inferred", running: false, baseUrl: listening, models: [],
      evidence: `${configured.length ? `Configured at ${configured.join(", ")}` : `OLLAMA_HOST is set to ${String(deps.env.OLLAMA_HOST).trim()}`}, so Ollama is expected at ${listening} (inferred). ${notServing}, and no ollama program was found on PATH or in %LOCALAPPDATA%\\Programs\\Ollama.`,
    };
  }
  return {
    kind: "ollama", installed: "unknown", running: false, baseUrl: contacted?.baseUrl ?? null, models: [],
    evidence: contacted
      ? `${notServing}, and no ollama program was found on PATH or in %LOCALAPPDATA%\\Programs\\Ollama — something is on ${contacted.baseUrl}, but it is not answering as Ollama.`
      : `No Ollama found: nothing answered GET /api/tags at ${candidates.join(", ")} and no ollama program was found on PATH or in %LOCALAPPDATA%\\Programs\\Ollama.`,
  };
}

/**
 * llama.cpp: `/health` proves running, and nothing else here claims anything.
 *
 * The asymmetry with Ollama is deliberate. Ollama is one program with one documented
 * location and one daemon; `llama-server` is a binary people drop anywhere, launch
 * under a supervisor, or run in a container with a hand-written `--model`/`--alias`
 * and port mapping (`Agent_Swarm/execution_plane/llama-server.yml` is exactly that,
 * and is not an install path this app could resolve to an address). A quiet port
 * therefore says nothing about whether llama.cpp is installed — and guessing here is
 * how a wizard ends up promising a lane that does not exist, the failure this repo
 * keeps recording under other names. So a path or URL from the user makes the lane
 * *configurable*, never installed, and no filesystem probe runs for this kind at all.
 * If llama.cpp ever ships a documented, locatable install, that is the change to
 * revisit this against — not a wider port sweep.
 */
export async function discoverLlamaCpp(request: DiscoveryRequest, deps: DiscoveryDeps): Promise<EngineDiscovery> {
  const fetchFn = deps.fetchFn ?? fetch;
  const configured = cleanUrls(request.configuredUrls);
  const fromEnv = baseUrlFromHost(deps.env.LLAMA_HOST, DEFAULT_LLAMA_CPP_PORT);
  const candidates = dedupe([...configured, ...(fromEnv ? [fromEnv] : []), ...LLAMA_CPP_PROBE_URLS]);
  const { serving, contacted } = await probeAddresses(fetchFn, candidates, "/health");

  if (serving) {
    const models = await llamaCppModels(fetchFn, serving.baseUrl);
    const source = configured.includes(serving.baseUrl)
      ? " (configured by you)"
      : fromEnv === serving.baseUrl ? " (from LLAMA_HOST)" : "";
    return {
      kind: "llama.cpp", installed: "yes", running: true, baseUrl: serving.baseUrl, models,
      evidence: models.length
        ? `GET ${serving.baseUrl}/health answered ${serving.status}${source}; it is serving ${models.join(", ")}.`
        : `GET ${serving.baseUrl}/health answered ${serving.status}${source}; neither /props nor /v1/models named a model, so the picker will ask them again.`,
    };
  }

  const pointer = request.binaryPath?.trim()
    ? `You pointed at ${request.binaryPath.trim()} — ${await deps.fileExists(request.binaryPath.trim()) ? "that file exists" : "no file is there"} —`
    : configured.length
      ? `Nothing answered GET /health at ${configured.join(", ")} (the address you configured), so`
      : `Nothing answered GET /health at ${candidates.join(", ")}, so`;
  return {
    kind: "llama.cpp", installed: "unknown", running: false,
    // Only an address the user or their environment named is worth returning; a probed
    // one that stayed quiet proves nothing and must not become a default.
    baseUrl: configured[0] ?? fromEnv ?? null,
    models: [],
    evidence: `${pointer} this stays "not installed but configurable". llama.cpp has no single install location, so a quiet port is never read as installed. Start \`llama-server\` and give its URL under Advanced, and it becomes a lane.${contacted && !configured.length ? ` (Something answered GET ${contacted.baseUrl}/health with ${contacted.status}, which is not a serving lane.)` : ""}`,
  };
}

// ---------------------------------------------------------------------------
// Probing
// ---------------------------------------------------------------------------

interface ProbeHit { baseUrl: string; status: number; json: unknown; }

/** Ask each address in turn until one answers *successfully*. A non-2xx is kept
 * separately as `contacted`, because "a 500 sat there" and "connection refused" are
 * different sentences to show a user, and neither means the engine is serving. */
async function probeAddresses(
  fetchFn: FetchLike,
  baseUrls: readonly string[],
  path: string,
): Promise<{ serving: ProbeHit | null; contacted: ProbeHit | null }> {
  let contacted: ProbeHit | null = null;
  for (const baseUrl of baseUrls) {
    try {
      const res = await fetchFn(`${baseUrl}${path}`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
      const json = res.ok ? await res.json().catch(() => null) : null;
      const hit = { baseUrl, status: res.status, json };
      contacted ??= hit;
      if (res.ok) return { serving: hit, contacted: hit };
    } catch {
      // Refused, timed out, or a URL this fetch cannot make: keep looking. A stopped
      // daemon on one loopback address must not end the search for the others.
    }
  }
  return { serving: null, contacted };
}

/** `/props`' `--alias` outranks `/v1/models`, which reports the GGUF path when no
 * alias was given. The authoritative version of that rule is engine-registry.ts;
 * this is the cheap one, for counting rather than for a list to choose from. */
async function llamaCppModels(fetchFn: FetchLike, baseUrl: string): Promise<string[]> {
  const [props, listed] = await Promise.all([
    fetchJson(fetchFn, `${baseUrl}/props`),
    fetchJson(fetchFn, `${baseUrl}/v1/models`),
  ]);
  const alias = typeof props?.model_alias === "string" ? props.model_alias.trim() : "";
  const reported = listField(listed, "data", "id");
  return alias && reported.length <= 1 ? [alias] : reported;
}

async function fetchJson(fetchFn: FetchLike, url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    const body = await res.json().catch(() => null);
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function findOllamaBinary(request: DiscoveryRequest, deps: DiscoveryDeps): Promise<string | null> {
  const candidates: string[] = [];
  const supplied = request.binaryPath?.trim();
  if (supplied) candidates.push(supplied);
  // The documented Windows location, then the ones the official macOS/Linux installers use.
  if (deps.platform === "win32") {
    const localAppData = deps.env.LOCALAPPDATA?.trim();
    if (localAppData) candidates.push(joinPath([localAppData, "Programs", "Ollama", "ollama.exe"], deps.platform));
  } else {
    candidates.push("/usr/local/bin/ollama", "/opt/homebrew/bin/ollama");
  }
  const binary = deps.platform === "win32" ? "ollama.exe" : "ollama";
  for (const dir of pathEntries(deps.env, deps.platform)) candidates.push(joinPath([dir, binary], deps.platform));

  for (const candidate of dedupe(candidates)) {
    if (await deps.fileExists(candidate)) return candidate;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Small readers — no `path`, no `os`, nothing a test cannot state outright
// ---------------------------------------------------------------------------

/** `OLLAMA_HOST`/`LLAMA_HOST` may name a bare host, a host:port, a bare :port or a
 * full URL — and honouring a non-default port is the whole reason to read it.
 * Exported because "the configured address wins over the guessed one" is a claim a
 * test has to make against the parser, not only against a probe. */
export function baseUrlFromHost(value: string | undefined, defaultPort: number): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      const host = dialableHost(url.hostname);
      return host ? (url.port ? `http://${urlHost(host)}:${url.port}` : `http://${urlHost(host)}`) : null;
    } catch {
      return null;
    }
  }
  const bracketed = /^\[([^\]]+)\](?::(\d+))?$/.exec(raw);
  if (bracketed) {
    const port = bracketed[2] ? `:${bracketed[2]}` : `:${defaultPort}`;
    return `http://${urlHost(dialableHost(bracketed[1] ?? ""))}${port}`;
  }
  const split = raw.lastIndexOf(":");
  // A bare `:port` names a listen address with no host, which is reached at loopback.
  const host = dialableHost(split < 0 ? raw : raw.slice(0, split)) || "127.0.0.1";
  if (/\s/.test(host)) return null;
  const portText = split < 0 ? "" : raw.slice(split + 1);
  const port = /^\d+$/.test(portText) ? Number(portText) : defaultPort;
  return port > 0 && port <= 65535 ? `http://${urlHost(host)}:${port}` : `http://${urlHost(host)}`;
}

/** A bind address is not a dial address: a daemon listening on 0.0.0.0 is reached at
 * loopback, and this app asks itself, not the network. */
function dialableHost(host: string): string {
  const trimmed = host.trim().replace(/^\[|\]$/g, "");
  if (!trimmed || trimmed === "0.0.0.0" || trimmed === "::" || trimmed === "*") return trimmed ? "127.0.0.1" : "";
  return trimmed;
}

/** An IPv6 literal keeps its brackets in a URL — `http://::1:11434` is not an address
 * anything can fetch, and `[::1]:11434` is exactly how Ollama documents its default. */
function urlHost(host: string): string {
  return host.includes(":") ? `[${host}]` : host;
}

function pathEntries(env: Record<string, string | undefined>, platform: NodeJS.Platform): string[] {
  const raw = env.PATH ?? env.Path ?? "";
  return dedupe(raw.split(platform === "win32" ? ";" : ":").map((entry) => entry.trim()).filter(Boolean));
}

function joinPath(parts: readonly string[], platform: NodeJS.Platform): string {
  const separator = platform === "win32" ? "\\" : "/";
  return parts.map((part) => part.replace(/[\\/]+$/g, "")).join(separator);
}

function cleanUrls(urls: readonly string[] | undefined): string[] {
  return dedupe((urls ?? []).map((url) => url.trim().replace(/\/+$/, "")).filter(Boolean));
}

function listField(payload: unknown, key: string, field: string): string[] {
  const rows = payload && typeof payload === "object" ? (payload as Record<string, unknown>)[key] : null;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const value = row && typeof row === "object" ? (row as Record<string, unknown>)[field] : null;
    return typeof value === "string" && value.trim() ? [value.trim()] : [];
  });
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}

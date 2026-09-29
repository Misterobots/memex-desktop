/**
 * provider-keys.ts — the model providers the harness knows about, and which of
 * them this user has connected.
 *
 * The runtime already owns this subsystem (`agents/provider_keys.py`): a catalogue
 * of providers, per-user keys Fernet-encrypted into Postgres, and four routes. What
 * it never had was a desktop client — the site's "Settings → Provider API Keys"
 * screen was never ported, so the app silently ignored three providers the user's
 * own harness was already serving. See plan `D6`.
 *
 * Three rules this module keeps.
 *
 * **The key is a pass-through, never a store.** It arrives on IPC from the connect
 * form and goes straight to the harness. Nothing here writes it to `config.json`, and
 * nothing returns it: the runtime's own `list` route answers with provider names and
 * labels precisely so that keys do not travel back out. The one exposure this adds is
 * transport — the POST carries it in cleartext to the active profile's URL, which is
 * nothing on loopback and something on a LAN profile, so the caller is expected to say
 * so rather than assume the reader's silence is a guarantee.
 *
 * **An unread connection state is `null`, not `false`.** `providers` needs no auth and
 * `list` does, so the two calls fail independently. Reporting "not connected" when the
 * runtime answered 401 would let the UI claim an absence it never observed — the same
 * discipline `runtime-nodes.ts` applies to a model it cannot see.
 *
 * **An empty selection is a choice, not a gap.** D7 put the offered subset of a
 * gateway's catalogue beside the key that earned it, so `selected_models: []` means
 * *offer none* — the state immediately after connecting, reached by adding a credential
 * without rewriting anyone's picker. Nothing here may read it as "unknown" and fall back
 * to the full list, which is the firehose the item exists to remove.
 */

import type { FetchLike } from "./engine-registry";

export interface ProviderModel {
  id: string;
  label: string;
  context: number;
  /** False when the id is claimed by another provider and dispatch keeps that
   * binding — OpenRouter carries `openai/gpt-4o`, GitHub owns it. `undefined` means
   * the runtime did not say, which renders as unknown and never as available. */
  routesHere?: boolean;
}

export interface ProviderCatalogState {
  known: number;
  stale: boolean;
  shadowed?: number;
  lastError?: string | null;
}

export interface ProviderInfo {
  id: string;
  label: string;
  models: ProviderModel[];
  /** `null` when the runtime would not answer the connection list. */
  connected: boolean | null;
  connectedAt: string | null;
  /** Live (fetched) rather than curated (declared) catalogue. */
  live: boolean;
  catalog: ProviderCatalogState | null;
  /** D7 — the subset of `models` this user chose to be offered. Empty means the
   * runtime named none, which for a live provider is a *choice* (connecting offers
   * nothing until models are selected), not a gap in the read. Only meaningful
   * beside `connected: true`; a curated provider has no selection to report. */
  selectedModels: string[];
}

export interface ProviderCatalog {
  /** Empty means the catalogue was not read — not that no provider exists. */
  providers: ProviderInfo[];
  reason: string | null;
  checkedAt: string;
}

export interface ConnectResult {
  ok: boolean;
  /** For the user, not for logs: never contains the key. */
  detail: string;
}

export interface SelectionResult extends ConnectResult {
  /** What the runtime says is selected now — its answer, not what was asked for. */
  selected: string[];
}

function isHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function trimmed(value: unknown, max = 120): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function parseModel(entry: unknown): ProviderModel | null {
  if (!entry || typeof entry !== "object") return null;
  const row = entry as Record<string, unknown>;
  const id = trimmed(row.id, 200);
  if (!id) return null;
  const routes = typeof row.routes_here === "boolean" ? row.routes_here : undefined;
  return {
    id,
    label: trimmed(row.label, 200) || id,
    context: num(row.context),
    ...(routes === undefined ? {} : { routesHere: routes }),
  };
}

export function parseProviderCatalog(
  catalogPayload: unknown,
  connectedPayload: unknown,
): ProviderInfo[] {
  const raw = catalogPayload as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];

  // `list` answers {"providers":[{"provider","label","connected_at"}]}; anything
  // else (a 401 body, an error page) yields no map, which every row below reads as
  // `unknown` rather than as "not connected".
  const rows = (connectedPayload as { providers?: unknown } | null)?.providers;
  const connected = new Map<string, { at: string | null; selected: string[] }>();
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const entry = row as Record<string, unknown>;
      const id = trimmed(entry.provider, 200);
      if (!id) continue;
      connected.set(id, {
        at: typeof entry.connected_at === "string" ? entry.connected_at : null,
        // D7. Non-strings are dropped rather than stringified: the runtime's own
        // `normalize_selection` does the same, and a client that invented `"None"`
        // here would render a checkbox for a model that does not exist.
        selected: Array.isArray(entry.selected_models)
          ? entry.selected_models
              .filter((m): m is string => typeof m === "string" && m.trim().length > 0)
              .map((m) => m.trim())
          : [],
      });
    }
  }

  return Object.entries(raw).reduce<ProviderInfo[]>((acc, [id, value]) => {
    if (!value || typeof value !== "object") return acc;
    const info = value as Record<string, unknown>;
    const label = trimmed(info.label, 200) || id;
    const models = Array.isArray(info.models)
      ? info.models.reduce<ProviderModel[]>((rows2, m) => {
          const parsed = parseModel(m);
          if (parsed) rows2.push(parsed);
          return rows2;
        }, [])
      : [];
    const catalog = info.catalog && typeof info.catalog === "object"
      ? (() => {
          const c = info.catalog as Record<string, unknown>;
          const shadowed = typeof c.shadowed === "number" ? c.shadowed : undefined;
          return {
            known: num(c.known),
            stale: c.stale === true,
            ...(shadowed === undefined ? {} : { shadowed }),
            lastError: typeof c.last_error === "string" ? trimmed(c.last_error) : null,
          };
        })()
      : null;
    const known = connected.get(id);
    // A fetched (gateway) catalogue is recognised by the `catalog` block the runtime
    // attaches to exactly those entries — `live_models` is accepted too, but the live
    // `/providers` payload carries no such field, and keying off it alone made every
    // gateway read as curated, which hid D7's selection editor entirely.
    const live = info.live_models === true || catalog !== null;
    acc.push({
      id,
      label,
      models,
      connected: known ? true : connectedPayload === undefined || connectedPayload === null ? null : false,
      connectedAt: known ? known.at : null,
      live,
      catalog,
      selectedModels: known ? known.selected : [],
    });
    return acc;
  }, []);
}

export async function readProviderCatalog(
  agentRuntimeUrl: string,
  uid: string,
  fetchFn: FetchLike = fetch,
): Promise<ProviderCatalog> {
  const base = (agentRuntimeUrl || "").trim().replace(/\/+$/, "");
  const fail = (reason: string): ProviderCatalog => ({ providers: [], reason, checkedAt: new Date().toISOString() });
  if (!isHttpUrl(base)) return fail("The active profile has no usable runtime address.");

  const headers: Record<string, string> = {};
  // `list` is the only route that asks, and it asks for a header rather than a
  // credential — the runtime trusts X-authentik-uid. Sent here because this read
  // does not go through the api:request path that would otherwise add it.
  const identity = trimmed(uid, 200);
  if (identity) headers["X-authentik-uid"] = identity;

  let catalogPayload: unknown = null;
  let connectedPayload: unknown = null;
  try {
    const response = await fetchFn(`${base}/api/v1/provider-keys/providers`, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) return fail(`The runtime answered ${response.status} for its provider list.`);
    catalogPayload = await response.json();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return fail(`Could not read the provider list: ${trimmed(detail)}`);
  }
  try {
    const response = await fetchFn(`${base}/api/v1/provider-keys/list`, {
      headers,
      signal: AbortSignal.timeout(6000),
    });
    // A 401 here is not a failure of the read: the catalogue is still real, and
    // every row's `connected` comes back null so the UI says "unknown" instead.
    if (response.ok) connectedPayload = await response.json();
  } catch {
    connectedPayload = null;
  }

  const providers = parseProviderCatalog(catalogPayload, connectedPayload);
  if (providers.length === 0) return fail("The runtime reported no model providers.");
  return { providers, reason: null, checkedAt: new Date().toISOString() };
}

export async function connectProvider(
  agentRuntimeUrl: string,
  uid: string,
  provider: string,
  apiKey: string,
  label: string,
  fetchFn: FetchLike = fetch,
): Promise<ConnectResult> {
  const base = (agentRuntimeUrl || "").trim().replace(/\/+$/, "");
  if (!isHttpUrl(base)) return { ok: false, detail: "The active profile has no usable runtime address." };
  const target = trimmed(provider, 200);
  const key = (apiKey || "").trim();
  if (!target) return { ok: false, detail: "No provider was named." };
  if (!key) return { ok: false, detail: "No API key was given." };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const identity = trimmed(uid, 200);
  if (identity) headers["X-authentik-uid"] = identity;

  try {
    const response = await fetchFn(`${base}/api/v1/provider-keys/connect`, {
      method: "POST",
      headers,
      // The only place this string leaves this process. Not logged, not stored, not
      // echoed back in `detail` on any path below.
      body: JSON.stringify({ provider: target, api_key: key, label: trimmed(label, 120) }),
      signal: AbortSignal.timeout(20000),
    });
    const body = await response.text();
    if (!response.ok) {
      let detail = "";
      try {
        detail = trimmed((JSON.parse(body) as { detail?: unknown }).detail);
      } catch {
        detail = trimmed(body);
      }
      return { ok: false, detail: detail || `The runtime answered ${response.status}.` };
    }
    return { ok: true, detail: `${target} connected.` };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, detail: `Could not reach the runtime: ${trimmed(detail)}` };
  }
}

export async function disconnectProvider(
  agentRuntimeUrl: string,
  uid: string,
  provider: string,
  fetchFn: FetchLike = fetch,
): Promise<ConnectResult> {
  const base = (agentRuntimeUrl || "").trim().replace(/\/+$/, "");
  if (!isHttpUrl(base)) return { ok: false, detail: "The active profile has no usable runtime address." };
  const target = trimmed(provider, 200);
  if (!target) return { ok: false, detail: "No provider was named." };

  const headers: Record<string, string> = {};
  const identity = trimmed(uid, 200);
  if (identity) headers["X-authentik-uid"] = identity;

  try {
    const response = await fetchFn(
      `${base}/api/v1/provider-keys/${encodeURIComponent(target)}`,
      { method: "DELETE", headers, signal: AbortSignal.timeout(10000) },
    );
    if (!response.ok) return { ok: false, detail: `The runtime answered ${response.status}.` };
    return { ok: true, detail: `${target} disconnected.` };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, detail: `Could not reach the runtime: ${trimmed(detail)}` };
  }
}

/**
 * Read a user's typed model list into the array the runtime stores.
 *
 * Typed entry is the fast path for a gateway: someone who wants three models should type
 * three ids rather than search 464 rows. Commas, semicolons, spaces and newlines all
 * separate, because a person pasting from a provider's docs will use whichever the page
 * used, and a model id itself never contains any of them.
 *
 * Nothing here checks that an id exists. The runtime's `set_selection` does not either,
 * and an id the catalogue has not fetched yet is a real state rather than a mistake —
 * the list is fetched and can be behind upstream — so the caller decides how to *say*
 * that (see `knownIds`), not whether to allow it.
 */
export function splitModelIds(text: string): string[] {
  return [...new Set((text ?? "")
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0))];
}

/** The ids the fetched catalogue carries, which is the only thing that separates "a
 * model I want" from "a string the runtime will refuse with a message naming nothing".
 * A set, because the UI asks membership per row, hundreds of times a render. */
export function knownIds(provider: ProviderInfo): Set<string> {
  return new Set(provider.models.map((m) => m.id));
}

/** Providers whose ids a gateway lists but another provider already owns. The
 * sentence the UI owes the user when they pick one, in the runtime's own count. */
export function shadowedCount(provider: ProviderInfo): number {
  if (typeof provider.catalog?.shadowed === "number") return provider.catalog.shadowed;
  return provider.models.filter((m) => m.routesHere === false).length;
}

/**
 * Choose which of a gateway's models this user is offered (plan D7).
 *
 * The whole list is sent on every write, not a delta: the runtime's
 * `set_selection` replaces the column, so a delta would need a read to be correct and
 * a stale read would silently drop a model the user did choose. An empty list is a
 * real answer — it is the state right after connecting — and is sent as such rather
 * than treated as "nothing to do" and skipped.
 */
export async function setProviderSelection(
  agentRuntimeUrl: string,
  uid: string,
  provider: string,
  models: string[],
  fetchFn: FetchLike = fetch,
): Promise<SelectionResult> {
  const base = (agentRuntimeUrl || "").trim().replace(/\/+$/, "");
  const none: SelectionResult = { ok: false, detail: "", selected: [] };
  if (!isHttpUrl(base)) return { ...none, detail: "The active profile has no usable runtime address." };
  const target = trimmed(provider, 200);
  if (!target) return { ...none, detail: "No provider was named." };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const identity = trimmed(uid, 200);
  if (identity) headers["X-authentik-uid"] = identity;

  // Deduplicated and trimmed here so the count the UI reports matches what goes out,
  // even though the runtime normalises the same way.
  const chosen = [...new Set((Array.isArray(models) ? models : []).map((m) => (m ?? "").trim()).filter(Boolean))].sort();

  try {
    const response = await fetchFn(
      `${base}/api/v1/provider-keys/${encodeURIComponent(target)}/selection`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({ models: chosen }),
        signal: AbortSignal.timeout(10000),
      },
    );
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok) {
      const detail = trimmed((body as { detail?: unknown } | null)?.detail) || `The runtime answered ${response.status}.`;
      return { ok: false, detail, selected: [] };
    }
    const accepted = (body as { selected?: unknown } | null)?.selected;
    const selected = Array.isArray(accepted)
      ? accepted.filter((m): m is string => typeof m === "string" && m.trim().length > 0).map((m) => m.trim())
      : [];
    return {
      ok: true,
      detail: selected.length === 0
        ? `${target}: no models selected, so the runtime will offer none from it.`
        : `${target}: ${selected.length} model${selected.length === 1 ? "" : "s"} selected.`,
      selected,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, detail: `Could not reach the runtime: ${trimmed(detail)}`, selected: [] };
  }
}

// Unit tests for electron/provider-keys.ts (plan D6).
//
// The fixture is the shape captured from the live harness on 2026-09-28
// (`GET :8008/api/v1/provider-keys/providers` → anthropic/google/nvidia, each with
// `label` + `models[]`), extended with the `openrouter` entry this change adds:
// `live_models`, a `catalog` block, and per-model `routes_here`.
import { describe, expect, it } from "vitest";

import {
  connectProvider,
  disconnectProvider,
  parseProviderCatalog,
  readProviderCatalog,
  shadowedCount,
} from "../provider-keys";

const CATALOG = {
  anthropic: {
    label: "Anthropic (Claude)",
    models: [
      { id: "claude-opus-4-20250514", label: "Claude Opus 4", context: 200000 },
    ],
  },
  nvidia: {
    label: "NVIDIA NIM",
    models: [
      { id: "mistralai/mistral-nemotron", label: "Mistral Nemotron", context: 128000 },
    ],
  },
  openrouter: {
    label: "OpenRouter",
    live_models: true,
    models: [
      { id: "meta-llama/llama-3.1-70b-instruct", label: "Llama 3.1 70B", context: 131072, routes_here: true },
      { id: "openai/gpt-4o", label: "GPT-4o", context: 128000, routes_here: false },
    ],
    catalog: { known: 497, stale: false, shadowed: 1, last_error: null },
  },
};

const response = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as Response;

describe("parseProviderCatalog", () => {
  it("marks only the providers the runtime listed as connected", () => {
    const providers = parseProviderCatalog(CATALOG, {
      providers: [{ provider: "nvidia", label: "NVIDIA NIM", connected_at: "2026-09-28T10:00:00Z" }],
    });
    const byId = Object.fromEntries(providers.map((p) => [p.id, p]));
    expect(byId.nvidia.connected).toBe(true);
    expect(byId.nvidia.connectedAt).toBe("2026-09-28T10:00:00Z");
    expect(byId.anthropic.connected).toBe(false);
    expect(byId.anthropic.connectedAt).toBeNull();
  });

  it("reports an unread connection list as unknown, never as not connected", () => {
    // `providers` needs no auth and `list` does, so a 401 is an ordinary outcome.
    // Saying "not connected" there would claim an absence the app never observed.
    const providers = parseProviderCatalog(CATALOG, null);
    expect(providers.map((p) => p.connected)).toEqual([null, null, null]);
  });

  it("keeps the live flag and the catalog block for a fetched provider only", () => {
    const providers = parseProviderCatalog(CATALOG, { providers: [] });
    const openrouter = providers.find((p) => p.id === "openrouter")!;
    const anthropic = providers.find((p) => p.id === "anthropic")!;
    expect(openrouter.live).toBe(true);
    expect(openrouter.catalog?.known).toBe(497);
    expect(openrouter.catalog?.shadowed).toBe(1);
    expect(anthropic.live).toBe(false);
    expect(anthropic.catalog).toBeNull();
  });

  it("carries routes_here as a boolean or as unknown, never coerced", () => {
    const providers = parseProviderCatalog(CATALOG, { providers: [] });
    const models = providers.find((p) => p.id === "openrouter")!.models;
    expect(models.find((m) => m.id === "openai/gpt-4o")!.routesHere).toBe(false);
    expect(models.find((m) => m.id === "meta-llama/llama-3.1-70b-instruct")!.routesHere).toBe(true);
    // A curated provider's model says nothing about routing, so the field is absent.
    expect(providers.find((p) => p.id === "nvidia")!.models[0].routesHere).toBeUndefined();
  });

  it("drops a non-object entry and labels the rest by id when the label is unusable", () => {
    const providers = parseProviderCatalog(
      { broken: "not an object", alsonot: { label: 42 }, ok: { label: "Fine", models: [{ id: "" }, { id: "x/y" }] } },
      { providers: [] },
    );
    // `alsonot` survives with its id as the label: dropping a provider because one
    // cosmetic field came back wrong would hide something the user can still connect,
    // which is the same rule runtime-nodes.ts applies to a node with no name.
    expect(providers.map((p) => p.id)).toEqual(["alsonot", "ok"]);
    expect(providers.find((p) => p.id === "alsonot")!.label).toBe("alsonot");
    expect(providers.find((p) => p.id === "ok")!.models.map((m) => m.id)).toEqual(["x/y"]);
  });

  it("returns nothing for a payload that is not a catalogue", () => {
    expect(parseProviderCatalog(null, null)).toEqual([]);
    expect(parseProviderCatalog([], null)).toEqual([]);
  });
});

describe("shadowedCount", () => {
  it("prefers the runtime's own count", () => {
    const providers = parseProviderCatalog(CATALOG, { providers: [] });
    expect(shadowedCount(providers.find((p) => p.id === "openrouter")!)).toBe(1);
  });

  it("falls back to counting the rows when the runtime did not say", () => {
    const providers = parseProviderCatalog(
      { p: { label: "P", models: [{ id: "a", routes_here: false }, { id: "b", routes_here: true }, { id: "c" }] } },
      { providers: [] },
    );
    expect(shadowedCount(providers[0])).toBe(1);
  });
});

describe("readProviderCatalog", () => {
  it("refuses a profile with no usable runtime address", async () => {
    const calls: string[] = [];
    const result = await readProviderCatalog("", "desktop", (async (url: string) => {
      calls.push(String(url));
      return response(CATALOG);
    }) as never);
    expect(result.providers).toEqual([]);
    expect(result.reason).toMatch(/no usable runtime address/);
    expect(calls).toEqual([]);
  });

  it("sends the identity header to the connection list and nowhere that would need it", async () => {
    const seen: Record<string, string> = {};
    const fetchFn = (async (url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      seen[String(url)] = headers.get("X-authentik-uid") ?? "";
      if (String(url).endsWith("/list")) return response({ providers: [{ provider: "nvidia" }] });
      return response(CATALOG);
    }) as never;
    const result = await readProviderCatalog("http://[::1]:8008/", "desktop", fetchFn);
    expect(seen["http://[::1]:8008/api/v1/provider-keys/providers"]).toBe("");
    expect(seen["http://[::1]:8008/api/v1/provider-keys/list"]).toBe("desktop");
    expect(result.providers).toHaveLength(3);
  });

  it("survives a refused connection list with the catalogue intact and connections unknown", async () => {
    const fetchFn = (async (url: string) =>
      String(url).endsWith("/list") ? response({ detail: "Authentication required" }, 401) : response(CATALOG)
    ) as never;
    const result = await readProviderCatalog("http://[::1]:8008", "desktop", fetchFn);
    expect(result.reason).toBeNull();
    expect(result.providers.every((p) => p.connected === null)).toBe(true);
  });

  it("treats an empty catalogue as a failed read, not as no providers", async () => {
    const fetchFn = (async () => response({})) as never;
    const result = await readProviderCatalog("http://[::1]:8008", "desktop", fetchFn);
    expect(result.providers).toEqual([]);
    expect(result.reason).toMatch(/no model providers/);
  });

  it("reports an unreachable runtime without inventing providers", async () => {
    const fetchFn = (async () => { throw new Error("connect ECONNREFUSED"); }) as never;
    const result = await readProviderCatalog("http://[::1]:8008", "desktop", fetchFn);
    expect(result.reason).toMatch(/ECONNREFUSED/);
  });
});

describe("connectProvider", () => {
  it("posts the key to the runtime and reports success without echoing it", async () => {
    let body = "";
    let auth = "";
    const fetchFn = (async (_url: string, init?: RequestInit) => {
      body = String(init?.body);
      auth = new Headers(init?.headers).get("X-authentik-uid") ?? "";
      return response({ status: "connected", provider: "openrouter" });
    }) as never;
    const result = await connectProvider("http://[::1]:8008", "desktop", "openrouter", "sk-or-secret-123", "mine", fetchFn);
    expect(result.ok).toBe(true);
    expect(result.detail).not.toContain("sk-or-secret");
    expect(auth).toBe("desktop");
    expect(JSON.parse(body)).toEqual({ provider: "openrouter", api_key: "sk-or-secret-123", label: "mine" });
  });

  it("refuses an empty key before any request is made", async () => {
    let called = 0;
    const fetchFn = (async () => { called += 1; return response({}); }) as never;
    const result = await connectProvider("http://[::1]:8008", "desktop", "openrouter", "   ", "", fetchFn);
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/no api key/i);
    expect(called).toBe(0);
  });

  it("carries the runtime's reason on a refusal, without the key", async () => {
    const fetchFn = (async (_url: string, init?: RequestInit) => {
      const sent = JSON.parse(String(init?.body)) as { api_key: string };
      return response({ detail: `Unknown provider: nope. Supported: ['openrouter'] (got ${sent.api_key.length} chars)` }, 400);
    }) as never;
    const result = await connectProvider("http://[::1]:8008", "desktop", "nope", "sk-or-secret-123", "", fetchFn);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("Unknown provider");
    expect(result.detail).not.toContain("sk-or-secret-123");
  });
});

describe("disconnectProvider", () => {
  it("sends DELETE to the provider path and encodes the name", async () => {
    let method = "";
    let url = "";
    const fetchFn = (async (target: string, init?: RequestInit) => {
      url = String(target);
      method = String(init?.method);
      return response({ disconnected: true, provider: "openrouter" });
    }) as never;
    const result = await disconnectProvider("http://[::1]:8008", "desktop", "open router", fetchFn);
    expect(method).toBe("DELETE");
    expect(url).toBe("http://[::1]:8008/api/v1/provider-keys/open%20router");
    expect(result.ok).toBe(true);
  });
});

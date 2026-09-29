// Unit tests for electron/provider-keys.ts (plan D6).
//
// The fixture is the shape captured from the live harness (`GET
// :8008/api/v1/provider-keys/providers`), re-read on 2026-09-29:
//   anthropic  -> label, models                       (3)
//   google     -> label, models                       (8)
//   nvidia     -> label, models                       (6)
//   openrouter -> label, models, catalog              (464, each with routes_here)
// Note what is *not* there: `live_models` is a field of the runtime's internal
// PROVIDERS dict and is never echoed in the response. An earlier version of this
// fixture asserted it anyway, and the reader trusted it — which is how D7's selection
// editor shipped unable to render against a real runtime.
import { describe, expect, it } from "vitest";

import {
  connectProvider,
  disconnectProvider,
  parseProviderCatalog,
  readProviderCatalog,
  setProviderSelection,
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

  it("recognises a fetched catalogue from the catalog block, which is all the runtime sends", () => {
    // The regression this guards: `live_models` is not on the wire, so a reader keyed on
    // it alone marks a 464-model gateway curated and the selection editor never renders.
    const providers = parseProviderCatalog(CATALOG, { providers: [] });
    const openrouter = providers.find((p) => p.id === "openrouter")!;
    const anthropic = providers.find((p) => p.id === "anthropic")!;
    expect(openrouter.live).toBe(true);
    expect(openrouter.catalog?.known).toBe(497);
    expect(openrouter.catalog?.shadowed).toBe(1);
    expect(anthropic.live).toBe(false);
    expect(anthropic.catalog).toBeNull();
  });

  it("still honours an explicit live_models flag if a runtime ever echoes one", () => {
    const providers = parseProviderCatalog(
      { openrouter: { label: "OpenRouter", live_models: true, models: [] } },
      { providers: [] },
    );
    expect(providers.find((p) => p.id === "openrouter")?.live).toBe(true);
    // An empty list with no catalog block is a gateway that has not fetched yet, and
    // stays curated-looking rather than inventing a catalog state of its own.
    expect(providers.find((p) => p.id === "openrouter")?.catalog).toBeNull();
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

/**
 * D7: which of a gateway's models the user is offered. The read half is the checkbox
 * state (`/list` carries `selected_models`); the write half is the PUT. Both are tested
 * for the same failure mode: an empty selection being read or sent as something it is
 * not.
 */
describe("selected_models on the read", () => {
  it("carries the chosen subset beside a connected provider", () => {
    const providers = parseProviderCatalog(CATALOG, {
      providers: [
        { provider: "openrouter", label: "OpenRouter", connected_at: "2026-09-28T00:00:00Z", selected_models: ["meta-llama/llama-3.1-70b-instruct"] },
      ],
    });
    expect(providers.find((p) => p.id === "openrouter")?.selectedModels).toEqual(["meta-llama/llama-3.1-70b-instruct"]);
    // A provider with no row has no selection either way, and says so with an empty
    // list rather than an invented one.
    expect(providers.find((p) => p.id === "nvidia")?.selectedModels).toEqual([]);
  });

  it("reads an absent column as nothing chosen, never as unknown", () => {
    // A runtime predating the migration answers `list` without the field. That is the
    // same offer the user sees — nothing — and not a read failure to hedge about.
    const providers = parseProviderCatalog(CATALOG, {
      providers: [{ provider: "openrouter", label: "OpenRouter", connected_at: "2026-09-28T00:00:00Z" }],
    });
    const openrouter = providers.find((p) => p.id === "openrouter");
    expect(openrouter?.connected).toBe(true);
    expect(openrouter?.selectedModels).toEqual([]);
  });

  it("drops a non-string from the reported selection instead of stringifying it", () => {
    const providers = parseProviderCatalog(CATALOG, {
      providers: [
        { provider: "openrouter", connected_at: null, selected_models: [" a ", null, 42, "", {}, "b"] },
      ],
    });
    expect(providers.find((p) => p.id === "openrouter")?.selectedModels).toEqual(["a", "b"]);
  });

  it("keeps every row unknown when the connection list was refused", () => {
    const providers = parseProviderCatalog(CATALOG, null);
    expect(providers.every((p) => p.connected === null)).toBe(true);
    expect(providers.every((p) => p.selectedModels.length === 0)).toBe(true);
  });
});

describe("setProviderSelection", () => {
  it("puts the whole normalised list at the provider's selection path", async () => {
    let url = "";
    let method = "";
    let body = "";
    let auth = "";
    const fetchFn = (async (target: string, init?: RequestInit) => {
      url = String(target);
      method = String(init?.method);
      body = String(init?.body);
      auth = new Headers(init?.headers).get("X-authentik-uid") ?? "";
      return response({ status: "updated", provider: "openrouter", selected: ["a", "b"] });
    }) as never;
    const result = await setProviderSelection(
      "http://[::1]:8008/", "Justin", "open router", ["b", " a ", "a", "", "b"], fetchFn,
    );
    expect(method).toBe("PUT");
    expect(url).toBe("http://[::1]:8008/api/v1/provider-keys/open%20router/selection");
    expect(auth).toBe("Justin");
    // Deduplicated, trimmed, empties gone: what the runtime stores is what it was sent.
    expect(JSON.parse(body)).toEqual({ models: ["a", "b"] });
    expect(result.ok).toBe(true);
    expect(result.selected).toEqual(["a", "b"]);
  });

  it("sends an empty selection as an answer rather than skipping the write", async () => {
    let called = 0;
    let body = "";
    const fetchFn = (async (_url: string, init?: RequestInit) => {
      called += 1;
      body = String(init?.body);
      return response({ status: "updated", provider: "openrouter", selected: [] });
    }) as never;
    const result = await setProviderSelection("http://[::1]:8008", "Justin", "openrouter", [], fetchFn);
    expect(called).toBe(1);
    expect(JSON.parse(body)).toEqual({ models: [] });
    expect(result.ok).toBe(true);
    // The sentence the user needs: this is not "nothing happened".
    expect(result.detail).toMatch(/will offer none/);
  });

  it("reports what the runtime accepted, not what was asked for", async () => {
    const fetchFn = (async () => response({
      status: "updated", provider: "openrouter", selected: ["meta-llama/llama-3.1-70b-instruct"],
    })) as never;
    const result = await setProviderSelection(
      "http://[::1]:8008", "Justin", "openrouter",
      ["meta-llama/llama-3.1-70b-instruct", "deepseek/deepseek-chat"], fetchFn,
    );
    expect(result.selected).toEqual(["meta-llama/llama-3.1-70b-instruct"]);
    expect(result.detail).toBe("openrouter: 1 model selected.");
  });

  it("carries the runtime's reason when the write is refused", async () => {
    const fetchFn = (async () => response({
      detail: "No openrouter key is connected, so there is nothing to select against.",
    }, 400)) as never;
    const result = await setProviderSelection("http://[::1]:8008", "Justin", "openrouter", ["a"], fetchFn);
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/nothing to select against/);
    expect(result.selected).toEqual([]);
  });

  it("survives a refusal that is not JSON", async () => {
    const fetchFn = (async () => ({
      ok: false, status: 502, json: async () => { throw new Error("not json"); },
    })) as unknown as never;
    const result = await setProviderSelection("http://[::1]:8008", "Justin", "openrouter", ["a"], fetchFn);
    expect(result.ok).toBe(false);
    expect(result.detail).toBe("The runtime answered 502.");
  });

  it("refuses a profile with no usable address and a provider with no name", async () => {
    let called = 0;
    const fetchFn = (async () => { called += 1; return response({}); }) as never;
    expect((await setProviderSelection("", "Justin", "openrouter", ["a"], fetchFn)).ok).toBe(false);
    expect((await setProviderSelection("http://[::1]:8008", "Justin", "  ", ["a"], fetchFn)).ok).toBe(false);
    expect(called).toBe(0);
  });
});

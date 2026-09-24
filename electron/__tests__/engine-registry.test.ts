import { describe, expect, it } from "vitest";
import {
  discoverAllEngineModels,
  discoverEngineModels,
  discoverLlamaCppModels,
  discoverOllamaModels,
  engineDescriptors,
  type EngineDescriptor,
  type FetchLike,
} from "../engine-registry";
import type { EngineConfig } from "../routing-config";

const ollama: EngineDescriptor = { id: "ollama", kind: "ollama", baseUrl: "http://[::1]:11434", label: "Ollama" };
const llama: EngineDescriptor = { id: "llama.cpp", kind: "llama.cpp", baseUrl: "http://127.0.0.1:8011", label: "llama.cpp" };

/**
 * Answers only the paths given, keyed by pathname. An unlisted path refuses the
 * connection — which is what an engine that isn't running actually looks like —
 * so a test cannot pass by accidentally reaching a real daemon.
 */
function fakeFetch(routes: Record<string, { status?: number; body?: unknown; raw?: string } | Error>) {
  const calls: string[] = [];
  const fetchFn: FetchLike = async (url: string) => {
    calls.push(url);
    const route = routes[new URL(url).pathname];
    if (!route) throw new Error(`connect ECONNREFUSED ${url}`);
    if (route instanceof Error) throw route;
    const body = route.raw ?? JSON.stringify(route.body ?? null);
    return new Response(body, { status: route.status ?? 200 });
  };
  return { fetchFn, calls };
}

// The lane as deployed (Agent_Swarm/execution_plane/llama-server.yml): one GGUF
// pinned by blob path, published 8011 -> 8080, addressed by its --alias.
const LLAMA_ALIAS = "qwen3-coder:30b";
const LLAMA_BLOB = "/models/models/blobs/sha256-1194192cf2a187eb02722edcc3f77b11d21f537048ce04b67ccf8ba78863006a";
const llamaRoutes = {
  "/health": { body: { status: "ok" } },
  "/props": { body: { model_path: LLAMA_BLOB, model_alias: LLAMA_ALIAS, n_ctx: 131072 } },
  "/v1/models": { body: { object: "list", data: [{ name: LLAMA_BLOB, model: LLAMA_BLOB, object: "model" }] } },
};

describe("engine descriptors from the routing table", () => {
  it("lists one per entry of the engines map, in the order the file has them", () => {
    expect(engineDescriptors({ ollama: { kind: "ollama", baseUrl: "http://[::1]:11434", label: "Ollama" } })).toEqual([ollama]);
    expect(engineDescriptors({
      ollama:      { kind: "ollama", baseUrl: "http://[::1]:11434", label: "Ollama" },
      "llama.cpp": { kind: "llama.cpp", baseUrl: "http://127.0.0.1:8011", label: "llama.cpp" },
    })).toEqual([ollama, llama]);
  });

  it("carries the ids the user named, with the id standing in for a missing label", () => {
    // These keys used to be invented here; they are the config's own now, and
    // routing slots refer to engines by them, so a descriptor must not rename one.
    expect(engineDescriptors({ "ollama-local": { kind: "ollama", baseUrl: "http://[::1]:11434" } })).toEqual([
      { id: "ollama-local", kind: "ollama", baseUrl: "http://[::1]:11434", label: "ollama-local" },
    ]);
  });

  it("tolerates a hand-edited trailing slash and drops an entry with no usable address", () => {
    const descriptors = engineDescriptors({
      tidy:    { kind: "ollama", baseUrl: "http://192.168.2.101:11434/" },
      half:    { kind: "ollama", baseUrl: "   " },
      deleted: { kind: "ollama" } as EngineConfig, // a line the user deleted the value from
    });
    expect(descriptors.map((d) => d.baseUrl)).toEqual(["http://192.168.2.101:11434"]);
  });

  it("offers nothing when there is no table, rather than assuming a daemon", () => {
    // The loopback fallback moved into deriveRoutingFromProfile, so the address the
    // picker probes is one the file states, not one inferred at the last mile.
    expect(engineDescriptors({})).toEqual([]);
    expect(engineDescriptors(null)).toEqual([]);
  });
});

describe("Ollama discovery (GET /api/tags)", () => {
  it("lists pulled models with their engine and size", async () => {
    const { fetchFn, calls } = fakeFetch({
      "/api/tags": {
        body: {
          models: [
            { name: "qwen3:14b", size: 9000000000, digest: "b1fd9cbf90f9", details: { family: "qwen3" } },
            { name: "nomic-embed-text:latest", size: 278000000, digest: "0a109f422b47" },
          ],
        },
      },
    });

    const models = await discoverOllamaModels(ollama, fetchFn);

    expect(calls).toEqual(["http://[::1]:11434/api/tags"]);
    expect(models).toEqual([
      { engineId: "ollama", engineKind: "ollama", engineLabel: "Ollama", model: "qwen3:14b", sizeBytes: 9000000000 },
      { engineId: "ollama", engineKind: "ollama", engineLabel: "Ollama", model: "nomic-embed-text:latest", sizeBytes: 278000000 },
    ]);
  });

  it("omits the size rather than inventing one when the daemon reports none", async () => {
    const { fetchFn } = fakeFetch({ "/api/tags": { body: { models: [{ name: "qwen3:8b" }] } } });
    expect(await discoverOllamaModels(ollama, fetchFn)).toEqual([
      { engineId: "ollama", engineKind: "ollama", engineLabel: "Ollama", model: "qwen3:8b" },
    ]);
  });

  it("returns an empty list, not a throw, for an absent or malformed payload", async () => {
    const absent = fakeFetch({ "/api/tags": { body: {} } });
    expect(await discoverOllamaModels(ollama, absent.fetchFn)).toEqual([]);

    const notJson = fakeFetch({ "/api/tags": { raw: "<html>502 Bad Gateway</html>" } });
    expect(await discoverOllamaModels(ollama, notJson.fetchFn)).toEqual([]);

    const refused = fakeFetch({});
    expect(await discoverOllamaModels(ollama, refused.fetchFn)).toEqual([]);

    const error = fakeFetch({ "/api/tags": { status: 500, body: { error: "no such model" } } });
    expect(await discoverOllamaModels(ollama, error.fetchFn)).toEqual([]);
  });

  it("drops unnamed entries instead of listing a blank row", async () => {
    const { fetchFn } = fakeFetch({ "/api/tags": { body: { models: [{ name: "" }, { size: 10 }, { name: "qwen3:8b" }] } } });
    expect((await discoverOllamaModels(ollama, fetchFn)).map((m) => m.model)).toEqual(["qwen3:8b"]);
  });
});

describe("llama.cpp discovery (GET /health, /props, /v1/models)", () => {
  it("shows the pinned model by its --alias, not the blob path it was loaded from", async () => {
    const { fetchFn, calls } = fakeFetch(llamaRoutes);

    const models = await discoverLlamaCppModels(llama, fetchFn);

    expect(models).toEqual([
      { engineId: "llama.cpp", engineKind: "llama.cpp", engineLabel: "llama.cpp", model: LLAMA_ALIAS, resident: true },
    ]);
    expect(calls).toContain("http://127.0.0.1:8011/health");
  });

  it("reads /v1/models names when the lane publishes no alias", async () => {
    const routes = { ...llamaRoutes, "/props": { status: 404, body: null } };
    const aliasless = fakeFetch({ ...routes, "/v1/models": { body: { data: [{ model: "qwen2.5-coder:14b" }] } } });
    expect((await discoverLlamaCppModels(llama, aliasless.fetchFn)).map((m) => m.model)).toEqual(["qwen2.5-coder:14b"]);
  });

  it("reports the pinned model even when /v1/models is unreadable, and no model at all when /health is not", async () => {
    const noList = fakeFetch({ "/health": { body: { status: "ok" } }, "/props": { body: { model_alias: LLAMA_ALIAS } } });
    expect((await discoverLlamaCppModels(llama, noList.fetchFn)).map((m) => m.model)).toEqual([LLAMA_ALIAS]);

    const unhealthy = fakeFetch({ ...llamaRoutes, "/health": { status: 503, body: { error: "loading" } } });
    expect(await discoverLlamaCppModels(llama, unhealthy.fetchFn)).toEqual([]);
    expect(unhealthy.calls).toEqual(["http://127.0.0.1:8011/health"]); // not enumerated behind a lane that isn't serving

    const down = fakeFetch({});
    expect(await discoverLlamaCppModels(llama, down.fetchFn)).toEqual([]);
  });

  it("keeps distinct reported models when a server serves more than the one this lane pins", async () => {
    const { fetchFn } = fakeFetch({
      ...llamaRoutes,
      "/v1/models": { body: { data: [{ name: "a" }, { name: "b" }] } },
    });
    expect((await discoverLlamaCppModels(llama, fetchFn)).map((m) => m.model)).toEqual(["a", "b"]);
  });
});

describe("both engines at once", () => {
  const shared = { name: "qwen3:14b", size: 9000000000 };

  it("lists the same tag from two engines as two rows, each naming its engine", async () => {
    // The coding lane pinned to the very tag Ollama also holds — collapsing rows
    // by model name would silently drop an engine the user can pick.
    const { fetchFn } = fakeFetch({
      "/api/tags": { body: { models: [shared] } },
      "/health": { body: { status: "ok" } },
      "/props": { body: { model_path: LLAMA_BLOB, model_alias: "qwen3:14b" } },
      "/v1/models": { body: { data: [{ name: LLAMA_BLOB }] } },
    });

    const models = await discoverAllEngineModels([ollama, llama], fetchFn);

    expect(models.map((m) => `${m.engineLabel}:${m.model}`)).toEqual(["Ollama:qwen3:14b", "llama.cpp:qwen3:14b"]);
    expect(models.map((m) => m.engineId)).toEqual(["ollama", "llama.cpp"]);
    expect(models[0].sizeBytes).toBe(9000000000);
    expect(models[1].resident).toBe(true);
  });

  it("an engine that is down does not hide the one that is up", async () => {
    const { fetchFn } = fakeFetch({ "/api/tags": { body: { models: [shared] } } }); // llama.cpp lane not running
    const models = await discoverAllEngineModels([ollama, llama], fetchFn);
    expect(models.map((m) => m.model)).toEqual(["qwen3:14b"]);
  });

  it("dispatches on the descriptor's kind and ignores a kind this build cannot speak", async () => {
    const { fetchFn } = fakeFetch({ "/api/tags": { body: { models: [shared] } } });
    expect((await discoverEngineModels(ollama, fetchFn)).map((m) => m.engineKind)).toEqual(["ollama"]);
    expect(await discoverEngineModels({ ...llama, kind: "trt-llm" as EngineDescriptor["kind"] }, fetchFn)).toEqual([]);
  });
});

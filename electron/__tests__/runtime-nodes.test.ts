import { describe, expect, it, vi } from "vitest";
import {
  capacityLabel,
  describeNode,
  hostsReportingModel,
  modelAvailability,
  parseRuntimeNodes,
  readRuntimeTopology,
  type RuntimeNode,
} from "../runtime-nodes";

/**
 * Captured verbatim from `GET :8009/api/v1/health/nodes` on 2026-09-25, with the
 * values that matter kept exactly as the runtime sent them: `vram_mb` null,
 * `vram_source` "unknown", `loaded_models` empty on both nodes. That is not a
 * stripped-down happy path — `agent_runtime` cannot see the GPU, so a reader that
 * assumed a number would be reading this payload wrong today.
 */
const LIVE = {
  nodes: [
    {
      name: "Lovelace", host: "http://ollama:11434", healthy: true, vram_mb: null, vram_source: "unknown",
      loaded_models: [], last_checked: 1790411821.3949156,
      available_models: [
        "qwen3.8:27b", "gemma4:e4b", "ministral-3:8b", "goekdenizguelmez/JOSIEFIED-Qwen3:8b",
        "minicpm-v:latest", "deepseek-r1:32b", "qwen3-coder:30b", "gemma4:31b", "qwen3.6:27b",
        "nomic-embed-text:latest", "llama3.2:3b", "qwen3:8b", "qwen3:14b",
      ],
    },
    {
      name: "Turing", host: "http://192.168.2.103:11434", healthy: true, vram_mb: null, vram_source: "unknown",
      loaded_models: [], last_checked: 1790411821.4229813,
      available_models: [
        "moondream:latest", "gemma4:e4b", "gemma4:e2b", "phi4-mini:latest", "qwen3:4b",
        "qwen3:8b", "llama3.2:3b", "llama-guard3:8b", "nomic-embed-text:latest",
      ],
    },
  ],
};

const NODES = parseRuntimeNodes(LIVE);
const node = (over: Partial<RuntimeNode>): RuntimeNode => ({
  name: "N", host: "http://h:11434", healthy: true, vramMb: null, vramSource: "unknown",
  loadedModels: [], availableModels: [], ...over,
});

describe("parseRuntimeNodes", () => {
  it("keeps the live report intact, including the nulls", () => {
    expect(NODES).toHaveLength(2);
    const [lovelace, turing] = NODES;
    expect(lovelace.name).toBe("Lovelace");
    // The runtime's host is a docker-network name, not something the desktop could
    // reach on its own — which is exactly why this is read through main.
    expect(lovelace.host).toBe("http://ollama:11434");
    expect(lovelace.availableModels).toHaveLength(13);
    expect(turing.availableModels).toHaveLength(9);
    expect(lovelace.vramMb).toBeNull();
    expect(lovelace.vramSource).toBe("unknown");
    expect(lovelace.loadedModels).toEqual([]);
  });

  it("never turns a missing capacity into zero", () => {
    // 0 GB would read as "a GPU with no memory", not "we were never told".
    expect(NODES.every((n) => n.vramMb === null)).toBe(true);
  });

  it("labels a nameless node by its host and drops an unusable one", () => {
    const parsed = parseRuntimeNodes({
      nodes: [
        { host: "http://10.0.0.5:11434", healthy: true, available_models: ["x:1"] },
        { name: "   ", host: "", healthy: true },
        { name: "Ghost", healthy: true, available_models: ["y:2"] },
        "not an object",
        null,
      ],
    });
    expect(parsed.map((n) => n.name)).toEqual(["http://10.0.0.5:11434", "Ghost"]);
    expect(parsed[1].host).toBe("");
  });

  it("returns nothing for a payload that is not a node list", () => {
    expect(parseRuntimeNodes(null)).toEqual([]);
    expect(parseRuntimeNodes({})).toEqual([]);
    expect(parseRuntimeNodes({ nodes: "nope" })).toEqual([]);
    expect(parseRuntimeNodes([])).toEqual([]);
  });

  it("treats a non-boolean healthy as unreachable rather than throwing", () => {
    expect(parseRuntimeNodes({ nodes: [{ name: "N", available_models: [] }] })[0].healthy).toBe(false);
  });
});

describe("modelAvailability", () => {
  it("finds a model on either node, and reports absent only for a real read", () => {
    expect(modelAvailability(NODES, "qwen3.6:27b")).toBe("available");   // Lovelace only
    expect(modelAvailability(NODES, "llama-guard3:8b")).toBe("available"); // Turing only
    expect(modelAvailability(NODES, "QWEN3.6:27B")).toBe("available");     // case-insensitive
    expect(modelAvailability(NODES, "llama3.1:70b")).toBe("absent");
  });

  it("says unknown, not absent, when the topology could not be read", () => {
    // A stopped runtime is not evidence that a model does not exist.
    expect(modelAvailability([], "qwen3:8b")).toBe("unknown");
    expect(modelAvailability(NODES, "  ")).toBe("unknown");
    expect(modelAvailability([node({ healthy: false })], "qwen3:8b")).toBe("unknown");
  });

  it("ignores an empty availability list instead of inventing one", () => {
    expect(modelAvailability([node({ availableModels: [] })], "qwen3:8b")).toBe("absent");
  });
});

describe("hostsReportingModel", () => {
  it("lists every healthy host that reports the model, in report order", () => {
    expect(hostsReportingModel(NODES, "gemma4:e4b").map((n) => n.name)).toEqual(["Lovelace", "Turing"]);
    expect(hostsReportingModel(NODES, "qwen3:14b").map((n) => n.name)).toEqual(["Lovelace"]);
    expect(hostsReportingModel(NODES, "nothing:1")).toEqual([]);
  });

  it("excludes an unreachable host from the answer", () => {
    const down = [node({ name: "Down", healthy: false, availableModels: ["a:1"] }), node({ name: "Up", availableModels: ["a:1"] })];
    expect(hostsReportingModel(down, "a:1").map((n) => n.name)).toEqual(["Up"]);
  });
});

describe("describeNode", () => {
  it("says capacity unknown when the runtime never reported a size", () => {
    expect(describeNode(NODES[0])).toContain("capacity unknown");
    expect(describeNode(NODES[0])).not.toMatch(/\b0 GB\b/);
    expect(describeNode(NODES[0])).toContain("13 models");
  });

  it("exposes the capacity phrase alone, so no caller parses the prose", () => {
    expect(capacityLabel(NODES[0])).toBe("capacity unknown");
    expect(capacityLabel(node({ vramMb: 24576 }))).toBe("24 GB");
    expect(capacityLabel(node({ vramMb: 819.2 }))).toBe("0.8 GB");
  });

  it("converts a reported size to GB and names the loaded count", () => {
    const line = describeNode(node({ name: "L", vramMb: 24576, loadedModels: ["a:1", "b:2"] }));
    expect(line).toContain("24 GB");
    expect(line).toContain("2 loaded");
    expect(line).toContain("healthy");
  });
});

describe("readRuntimeTopology", () => {
  it("reads the node report from the profile address and keeps it unwritten", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(LIVE), { status: 200 }));
    const result = await readRuntimeTopology("http://[::1]:8008/", fetchMock);
    // Trailing slash normalised, path appended once.
    expect(fetchMock.mock.calls[0][0]).toBe("http://[::1]:8008/api/v1/health/nodes");
    expect(result.reason).toBeNull();
    expect(result.nodes).toHaveLength(2);
  });

  it("refuses an address that is not http(s) without fetching it", async () => {
    const fetchMock = vi.fn();
    const result = await readRuntimeTopology("file:///C:/secrets", fetchMock);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.nodes).toEqual([]);
    expect(result.reason).toMatch(/no usable runtime address/i);
    expect(await readRuntimeTopology("", fetchMock).then((r) => r.reason)).toMatch(/no usable runtime address/i);
  });

  it("carries the status code when the runtime answers badly", async () => {
    const result = await readRuntimeTopology(
      "http://[::1]:8008",
      vi.fn().mockResolvedValue(new Response("nope", { status: 503 })),
    );
    expect(result.nodes).toEqual([]);
    expect(result.reason).toContain("503");
  });

  it("reports an empty node list as unread rather than as no hosts", async () => {
    const result = await readRuntimeTopology(
      "http://[::1]:8008",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ nodes: [] }), { status: 200 })),
    );
    expect(result.nodes).toEqual([]);
    expect(result.reason).toMatch(/no model hosts/i);
  });

  it("turns a thrown fetch into a reason instead of a rejected channel", async () => {
    const result = await readRuntimeTopology("http://[::1]:8008", vi.fn().mockRejectedValue(new Error("boom")));
    expect(result.nodes).toEqual([]);
    expect(result.reason).toContain("boom");
    expect(result.checkedAt).toBeTruthy();
  });

  it("truncates a long failure message so the UI stays readable", async () => {
    const long = new Error(`x${"y".repeat(400)}`).message;
    const result = await readRuntimeTopology("http://[::1]:8008", vi.fn().mockRejectedValue(long ? new Error(long) : null));
    expect((result.reason ?? "").length).toBeLessThan(200);
  });
});

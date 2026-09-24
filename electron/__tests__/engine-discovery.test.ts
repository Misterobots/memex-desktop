import { describe, expect, it } from "vitest";
import {
  baseUrlFromHost, discoverEngines, discoverLlamaCpp, discoverOllama,
  type DiscoveryDeps, type EngineDiscovery,
} from "../engine-discovery";
import type { FetchLike } from "../engine-registry";

/**
 * A machine, stated rather than assumed: which URLs answer with what, which files
 * exist, what the environment holds. Keyed by full URL (not pathname, as the registry
 * test does) because "the address it would use" is the thing under test here, and two
 * candidates can share a path on different ports.
 */
function machine(options: {
  answers?: Record<string, { status?: number; body?: unknown }>;
  files?: string[];
  env?: Record<string, string | undefined>;
  platform?: NodeJS.Platform;
} = {}) {
  const fetched: string[] = [];
  const probedFiles: string[] = [];
  const fetchFn: FetchLike = async (url: string) => {
    fetched.push(url);
    const answer = options.answers?.[url];
    if (!answer) throw new TypeError(`connect ECONNREFUSED ${url}`);
    return new Response(JSON.stringify(answer.body ?? null), { status: answer.status ?? 200 });
  };
  const deps: DiscoveryDeps = {
    fileExists: (path) => { probedFiles.push(path); return (options.files ?? []).includes(path); },
    env: options.env ?? {},
    platform: options.platform ?? "win32",
    fetchFn,
  };
  return { deps, fetched, probedFiles };
}

const TAGS = (names: string[]) => ({ body: { models: names.map((name) => ({ name })) } });

describe("discovering Ollama", () => {
  it("reads a live /api/tags as running, with the address and the model list it came from", async () => {
    const { deps, fetched } = machine({
      answers: { "http://[::1]:11434/api/tags": TAGS(["qwen3:14b", "nomic-embed-text:latest"]) },
    });
    const result = await discoverOllama({}, deps);

    expect(result).toMatchObject({
      kind: "ollama", installed: "yes", running: true, baseUrl: "http://[::1]:11434",
      models: ["qwen3:14b", "nomic-embed-text:latest"],
    });
    expect(result.evidence).toContain("http://[::1]:11434/api/tags");
    expect(result.evidence).toContain("2 models");
    expect(fetched[0]).toBe("http://[::1]:11434/api/tags"); // the first candidate asked is the one that answered
  });

  it("reports an installed-but-stopped Ollama as installed, and the address it would use as inferred", async () => {
    const { deps } = machine({
      files: ["C:\\Users\\me\\bin\\ollama.exe"],
      env: { Path: "C:\\Users\\me\\bin;C:\\Windows" },
    });
    const result = await discoverOllama({}, deps);

    // The state the old probe could not express at all: nothing on the port, but the
    // program is there, so the wizard can say "start it" instead of "install it".
    expect(result).toMatchObject({ installed: "yes", running: false, baseUrl: "http://127.0.0.1:11434", models: [] });
    expect(result.evidence).toContain("C:\\Users\\me\\bin\\ollama.exe");
    expect(result.evidence).toContain("inferred");
    expect(result.evidence).toContain("Nothing answered GET");
  });

  it("looks in the documented Windows install location, not only in PATH", async () => {
    const { deps, probedFiles } = machine({
      env: { LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" },
      files: ["C:\\Users\\me\\AppData\\Local\\Programs\\Ollama\\ollama.exe"],
    });
    const result = await discoverOllama({}, deps);

    expect(result.running).toBe(false);
    expect(result.baseUrl).toBe("http://127.0.0.1:11434");
    expect(probedFiles).toContain("C:\\Users\\me\\AppData\\Local\\Programs\\Ollama\\ollama.exe");
    expect(result.evidence).toContain("Programs\\Ollama");
  });

  it("probes OLLAMA_HOST before its own guesses, including a non-default port", async () => {
    const { deps, fetched } = machine({
      env: { OLLAMA_HOST: "127.0.0.1:11500" },
      answers: { "http://127.0.0.1:11500/api/tags": TAGS(["qwen3:8b"]) },
    });
    const result = await discoverOllama({}, deps);

    // The daemon this box actually runs, on the port it actually listens on: the old
    // single hardcoded address called this machine "not reachable".
    expect(result).toMatchObject({ installed: "yes", running: true, baseUrl: "http://127.0.0.1:11500" });
    expect(fetched[0]).toBe("http://127.0.0.1:11500/api/tags");
    expect(result.evidence).toContain("from OLLAMA_HOST");
  });

  it("keeps an unconfirmed OLLAMA_HOST at inferred, and reads a bind address as loopback", async () => {
    const { deps } = machine({ env: { OLLAMA_HOST: "http://0.0.0.0:11435" } });
    const result = await discoverOllama({}, deps);

    // A pointer is intent, not proof: nothing answered and no program was found.
    expect(result).toMatchObject({ installed: "inferred", running: false, baseUrl: "http://127.0.0.1:11435" });
    expect(result.evidence).toContain("inferred");
    expect(result.evidence).toContain("OLLAMA_HOST");
  });

  it("answers unknown, with no address, when nothing is there", async () => {
    const { deps, fetched } = machine({});
    const result = await discoverOllama({}, deps);

    expect(result).toMatchObject({ installed: "unknown", running: false, baseUrl: null });
    expect(fetched).toEqual(["http://[::1]:11434/api/tags", "http://127.0.0.1:11434/api/tags"]);
    expect(result.evidence).toContain("No Ollama found");
  });

  it("asks a configured address first and says the user configured it", async () => {
    const { deps, fetched } = machine({
      answers: { "http://192.168.1.50:11434/api/tags": TAGS(["llama3.2:3b"]) },
    });
    const result = await discoverOllama({ configuredUrls: ["http://192.168.1.50:11434/"] }, deps);

    expect(result.baseUrl).toBe("http://192.168.1.50:11434");
    expect(fetched[0]).toBe("http://192.168.1.50:11434/api/tags");
    expect(result.evidence).toContain("configured by you");
  });

  it("does not call an error status running, even though something answered", async () => {
    const { deps } = machine({ answers: { "http://[::1]:11434/api/tags": { status: 500 } } });
    const result = await discoverOllama({}, deps);

    expect(result.running).toBe(false);
    expect(result.installed).toBe("unknown");
    expect(result.evidence).toContain("500");
  });
});

describe("discovering llama.cpp", () => {
  const HEALTH = "http://127.0.0.1:8080/health";

  it("reads a live /health as running and names the model it is serving", async () => {
    const { deps } = machine({
      answers: {
        [HEALTH]: { body: { status: "ok" } },
        "http://127.0.0.1:8080/props": { body: { model_path: "/models/blob.gguf", model_alias: "qwen3-coder:30b" } },
        "http://127.0.0.1:8080/v1/models": { body: { data: [{ id: "/models/blob.gguf" }] } },
      },
    });
    const result = await discoverLlamaCpp({}, deps);

    expect(result).toMatchObject({ kind: "llama.cpp", installed: "yes", running: true, baseUrl: "http://127.0.0.1:8080", models: ["qwen3-coder:30b"] });
    expect(result.evidence).toContain("/health");
    expect(result.evidence).toContain("qwen3-coder:30b");
  });

  it("never reads a quiet port as installed", async () => {
    const { deps, fetched } = machine({});
    const result = await discoverLlamaCpp({}, deps);

    // The asymmetry with Ollama, as an assertion: no amount of silence about a
    // `llama-server` binary says where it would listen, what it would pin, or whether
    // the user means it as a lane. Guessing here is how the wizard promises a lane
    // that does not exist.
    expect(result).toMatchObject({ installed: "unknown", running: false, baseUrl: null, models: [] });
    expect(result.installed).not.toBe("yes");
    expect(result.evidence).toContain("not installed but configurable");
    expect(result.evidence).toContain("no single install location");
    expect(fetched).toEqual(["http://127.0.0.1:8080/health", "http://127.0.0.1:8011/health"]);
  });

  it("probes no filesystem path for this kind at all", async () => {
    const { deps, probedFiles } = machine({});
    await discoverLlamaCpp({}, deps);

    expect(probedFiles).toEqual([]);
  });

  it("keeps a configured address that stays quiet as a lane to configure, not an install", async () => {
    const { deps, fetched } = machine({});
    const result = await discoverLlamaCpp({ configuredUrls: ["http://127.0.0.1:9999"] }, deps);

    expect(result).toMatchObject({ installed: "unknown", running: false, baseUrl: "http://127.0.0.1:9999" });
    expect(fetched).toContain("http://127.0.0.1:9999/health");
    expect(result.evidence).toContain("the address you configured");
    expect(result.evidence).toContain("not installed but configurable");
  });

  it("treats a supplied binary path as configurable, whether or not the file is there", async () => {
    const found = machine({ files: ["D:\\llama\\llama-server.exe"] });
    const missing = machine({});

    const present = await discoverLlamaCpp({ binaryPath: "D:\\llama\\llama-server.exe" }, found.deps);
    const absent = await discoverLlamaCpp({ binaryPath: "D:\\llama\\llama-server.exe" }, missing.deps);

    // A file on disk is not a running lane: `llama-server` needs a model, a port and a
    // host to become one, and none of those follow from the path.
    expect(present).toMatchObject({ installed: "unknown", running: false, baseUrl: null });
    expect(present.evidence).toContain("that file exists");
    expect(absent.evidence).toContain("no file is there");
    expect(found.probedFiles).toEqual(["D:\\llama\\llama-server.exe"]);
  });

  it("reports what answered without a model name, rather than inventing one", async () => {
    const { deps } = machine({ answers: { [HEALTH]: { body: { status: "ok" } } } });
    const result = await discoverLlamaCpp({}, deps);

    expect(result).toMatchObject({ installed: "yes", running: true, models: [] });
    expect(result.evidence).toContain("neither /props nor /v1/models named a model");
  });
});

describe("both kinds at once", () => {
  it("answers Ollama and llama.cpp even when neither is running, with evidence on every path", async () => {
    const scenarios = [
      machine({}),                                                              // nothing installed
      machine({ files: ["C:\\Users\\me\\bin\\ollama.exe"], env: { Path: "C:\\Users\\me\\bin" } }), // stopped Ollama
      machine({ env: { OLLAMA_HOST: ":11500" } }),                               // configured pointer, no proof
      machine({ answers: { "http://127.0.0.1:8011/health": { body: {} } } }),     // a running lane
    ];
    for (const { deps } of scenarios) {
      const engines: EngineDiscovery[] = await discoverEngines({}, deps);
      expect(engines.map((engine) => engine.kind)).toEqual(["ollama", "llama.cpp"]);
      for (const engine of engines) {
        // "We found it" without a reason is the trust problem this field exists to
        // close, so no branch — including the ones nobody tests by accident — may
        // come back with an empty one.
        expect(engine.evidence.trim().length, `${engine.kind}: ${engine.evidence}`).toBeGreaterThan(20);
        expect(["yes", "inferred", "unknown"]).toContain(engine.installed);
        if (!engine.running) expect(engine.models).toEqual([]);
      }
    }
  });

  it("reads the POSIX binary names on a POSIX platform", async () => {
    const { deps, probedFiles } = machine({ platform: "linux", env: { PATH: "/usr/bin:/local/bin" } });
    const result = await discoverOllama({}, deps);

    expect(result.installed).toBe("unknown");
    expect(probedFiles).toContain("/usr/local/bin/ollama");
    expect(probedFiles).toContain("/local/bin/ollama");
    expect(probedFiles).not.toContain("/usr/bin/ollama.exe");
  });
});

describe("where a host variable says to look", () => {
  it("turns every form OLLAMA_HOST takes into one address, port and all", () => {
    expect(baseUrlFromHost("127.0.0.1:11500", 11434)).toBe("http://127.0.0.1:11500");
    expect(baseUrlFromHost("localhost", 11434)).toBe("http://localhost:11434");
    expect(baseUrlFromHost(":11500", 11434)).toBe("http://127.0.0.1:11500");
    expect(baseUrlFromHost("[::1]:11434", 11434)).toBe("http://[::1]:11434");
    expect(baseUrlFromHost("http://0.0.0.0:11435", 11434)).toBe("http://127.0.0.1:11435");
    expect(baseUrlFromHost("  ", 11434)).toBeNull();
    expect(baseUrlFromHost(undefined, 11434)).toBeNull();
    expect(baseUrlFromHost("not a host:maybe", 11434)).toBeNull(); // a wordy non-host is not an address to guess at
  });
});

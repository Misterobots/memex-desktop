import { beforeEach, describe, expect, it, vi } from "vitest";

// config.json lives in userData, which does not exist here; the whole store is
// exercised against this map instead. `path` is mocked because the electron-renderer
// alias shadows node's real one under vitest (see unreal-discovery.test.ts).
const files = new Map<string, string>();
vi.mock("fs", () => ({
  existsSync:   (path: string) => files.has(path),
  readFileSync: (path: string) => {
    const content = files.get(path);
    if (content === undefined) throw new Error(`ENOENT: ${path}`);
    return content;
  },
  writeFileSync: (path: string, content: string) => { files.set(path, content); },
}));
vi.mock("path", () => ({ join: (...parts: string[]) => parts.join("/").replace(/\/\//g, "/") }));
// `crypto` needs the same treatment as `path`: the electron-renderer alias replaces
// node's built-in with a `require`-based shim that cannot load under vitest. Only
// `saveProfile` of a profile with no id uses it, and no case here does.
vi.mock("crypto", () => ({ randomUUID: () => "generated-profile-id" }));
vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => false, // no OS keychain in a test run: apiKey stays as written
    encryptString: () => Buffer.from("x"),
    decryptString: () => "",
  },
}));

import { ConfigStore } from "../config-store";

const USER_DATA = "C:/memex-config-test";
const CONFIG    = "C:/memex-config-test/config.json";

const read   = () => JSON.parse(files.get(CONFIG)!);
const write  = (config: unknown) => files.set(CONFIG, JSON.stringify(config, null, 2));

/** A config as an install that never saw D2 would leave it: profiles only. */
const preRoutingConfig = {
  activeProfileId: "localhost",
  profiles: [
    { id: "home-lan",  name: "Home LAN",  providerType: "internal", agentRuntime: "http://192.168.2.101:8008",
      mempalace: "http://192.168.2.102:8200", ollama: "http://192.168.2.101:11434", defaultModel: "qwen3:14b" },
    { id: "localhost", name: "Localhost", providerType: "internal", agentRuntime: "http://[::1]:8008",
      mempalace: "http://192.168.2.102:8200", ollama: "http://[::1]:11434", defaultModel: "qwen3:8b" },
  ],
  allowedExtensionIds: [],
  wizardComplete: true,
  // Something this build has never heard of, from a newer install or a hand-edit.
  localCadBridge: { url: "http://127.0.0.1:8790", importedAt: "2026-09-20" },
};

beforeEach(() => {
  files.clear();
});

describe("the routing block in config.json", () => {
  it("writes a first run's derived table into the file, not just into memory", () => {
    const store = new ConfigStore(USER_DATA);
    expect(store.getRouting()).toEqual({
      runStyle: "multi",
      engines: { ollama: { kind: "ollama", baseUrl: "http://[::1]:11434", label: "Ollama" } },
      routing: { default: { engine: "ollama", model: "qwen3:14b" } }, // the localhost seed, which is the active route
    });
    // The point of a file that is the source of truth is that the routing in use is
    // readable in it — a derived-only table nobody can see is the old arrangement.
    expect(read()).toMatchObject({
      engines: { ollama: { baseUrl: "http://[::1]:11434" } },
      routing: { default: { model: "qwen3:14b" } },
    });
    expect(store.getRoutingErrors()).toEqual([]);
  });

  it("migrates a pre-D2 config once, deriving from the active profile and keeping what it does not know", () => {
    write(preRoutingConfig);
    const store = new ConfigStore(USER_DATA);

    const stored = read();
    expect(stored.runStyle).toBe("multi");
    expect(stored.engines).toEqual({ ollama: { kind: "ollama", baseUrl: "http://[::1]:11434", label: "Ollama" } });
    expect(stored.routing).toEqual({ default: { engine: "ollama", model: "qwen3:8b" } });
    // Derived from the *active* profile (localhost → qwen3:8b), not the first one.
    expect(stored.localCadBridge).toEqual({ url: "http://127.0.0.1:8790", importedAt: "2026-09-20" });
    expect(stored.profiles).toHaveLength(2);
    expect(store.getRoutingErrors()).toEqual([]);

    // Persisted once: a reload of the same file changes nothing, so the migration
    // cannot keep rewriting a table the user has since started editing.
    const afterFirstLoad = files.get(CONFIG);
    expect(new ConfigStore(USER_DATA).getRouting()).toEqual(store.getRouting());
    expect(files.get(CONFIG)).toBe(afterFirstLoad);
  });

  it("honours a stored table over the profile it was derived from", () => {
    write({ ...preRoutingConfig, runStyle: "multi",
      engines: { "box-ollama": { kind: "ollama", baseUrl: "http://192.168.2.101:11434", label: "Box" } },
      routing: { default: { engine: "box-ollama", model: "qwen3.8:27b" } } });
    const store = new ConfigStore(USER_DATA);
    expect(store.getRouting().routing.default).toEqual({ engine: "box-ollama", model: "qwen3.8:27b" });
    // and the derived-from-profile path stays available for a config without a block
    expect(store.getUrls().ollama).toBe("http://[::1]:11434");
  });
});

describe("a bad hand-edit and the file it lives in", () => {
  it("leaves an unparseable config.json untouched instead of replacing it with seeds", () => {
    write(preRoutingConfig);
    const handEdit = `${JSON.stringify(preRoutingConfig, null, 2)},,\n`; // the stray comma that ends an evening
    files.set(CONFIG, handEdit);

    const store = new ConfigStore(USER_DATA);

    // The old code fell through to the first-run write here, so the mistake that
    // proved the file was unreadable was erased along with the user's config.
    expect(files.get(CONFIG)).toBe(handEdit);
    expect(store.getRoutingErrors()).toEqual([
      expect.objectContaining({ path: "config.json", message: expect.stringContaining("could not be parsed") }),
    ]);

    // And nothing this session does may write it either: a later unrelated save
    // would clobber the file just as thoroughly as the load did.
    store.setWizardComplete();
    store.saveRouting({ runStyle: "multi", engines: { o: { kind: "ollama", baseUrl: "http://[::1]:11434" } }, routing: {} });
    expect(files.get(CONFIG)).toBe(handEdit);
    // The app still runs meanwhile, on a table it derived from its own seeds.
    expect(store.getRouting().engines.ollama.baseUrl).toBe("http://[::1]:11434");
  });

  it("reports a stored routing block it cannot honour, by path, and does not repair it", () => {
    write({
      ...preRoutingConfig,
      runStyle: "multi",
      engines: { "ollama-local": { kind: "ollama", baseUrl: "ftp://[::1]:11434" } },
      routing: {
        default:            { engine: "ollama-local", model: "qwen3:8b" },
        "collective.critic": { engine: "ollma-loca", model: "qwen3:14b" },
      },
    });
    const store = new ConfigStore(USER_DATA);

    expect(store.getRoutingErrors().map((i) => i.path).sort()).toEqual([
      "engines.ollama-local.baseUrl", "routing.collective.critic.engine",
    ]);
    // Reported, not rewritten: the file is the user's, and a fixed-up copy of it is
    // the one thing a hand-edit must not silently become.
    expect(read().routing["collective.critic"].engine).toBe("ollma-loca");
  });

  it("reports a routing table that is not a table at all, and keeps running without one", () => {
    write({
      ...preRoutingConfig,
      runStyle: "multi",
      engines: { "ollama-local": { kind: "ollama", baseUrl: "http://[::1]:11434" } },
      routing: "qwen3:8b", // the value a misplaced brace leaves behind
    });
    const store = new ConfigStore(USER_DATA);

    expect(store.getRoutingErrors()).toEqual([
      expect.objectContaining({ path: "routing", message: expect.stringContaining("map of slot name") }),
    ]);
    expect(store.getRouting().routing).toEqual({}); // nothing to resolve against — said out loud above
    expect(read().routing).toBe("qwen3:8b");        // and the line the user has to fix is still there
  });

  it("refuses to persist an invalid table, leaving the working routing in place", () => {
    write(preRoutingConfig);
    const store = new ConfigStore(USER_DATA);
    const before = files.get(CONFIG);

    const result = store.saveRouting({
      runStyle: "multi",
      engines: { "ollama-local": { kind: "ollama", baseUrl: "http://[::1]:11434" } },
      routing: { code: { engine: "not-configured", model: "" } },
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((i) => i.path).sort()).toEqual(["routing.code.engine", "routing.code.model"]);
    expect(files.get(CONFIG)).toBe(before);            // not a byte changed
    expect(store.getRouting().routing.code).toBeUndefined(); // still the derived table
    expect(read().routing).toEqual({ default: { engine: "ollama", model: "qwen3:8b" } });
  });

  it("persists a valid table and clears the errors it had", () => {
    write({
      ...preRoutingConfig,
      runStyle: "multi",
      engines: { "ollama-local": { kind: "ollama", baseUrl: "http://[::1]:11434" } },
      routing: { code: { engine: "nope", model: "qwen3:8b" } },
    });
    const store = new ConfigStore(USER_DATA);
    expect(store.getRoutingErrors()).toHaveLength(1);

    const result = store.saveRouting({
      runStyle: "single",
      engines: { "llama-local": { kind: "llama.cpp", baseUrl: "http://127.0.0.1:8080", pinnedModel: "qwen3-coder:30b" } },
      routing: { default: { engine: "llama-local", model: "qwen3-coder:30b" } },
    });

    expect(result.ok).toBe(true);
    expect(store.getRoutingErrors()).toEqual([]);
    expect(read()).toMatchObject({
      runStyle: "single",
      engines: { "llama-local": { pinnedModel: "qwen3-coder:30b" } },
      routing: { default: { model: "qwen3-coder:30b" } },
    });
    // Reload proves it is the file, not the in-memory copy, that now carries it.
    expect(new ConfigStore(USER_DATA).getRouting().runStyle).toBe("single");
  });
});

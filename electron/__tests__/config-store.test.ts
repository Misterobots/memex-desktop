import { afterEach, describe, expect, it, vi } from "vitest";

const files = new Map<string, string>();

vi.mock("fs", () => ({
  existsSync: (path: string) => files.has(path),
  readFileSync: (path: string) => files.get(path) ?? "",
  writeFileSync: (path: string, content: string) => { files.set(path, content); },
}));
vi.mock("path", () => ({
  join: (...parts: string[]) => parts.join("/").replace(/\/\//g, "/"),
}));
vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString("utf-8"),
  },
}));
vi.mock("crypto", () => ({ randomUUID: () => "test-profile-id" }));

import { ConfigStore, LOCAL_FIRST_PROFILE_ID } from "../config-store";

const configPath = "C:/memex-config-test/config.json";

afterEach(() => files.clear());

describe("ConfigStore local-first routing", () => {
  it("uses the home LAN profile for a new desktop install", () => {
    const store = new ConfigStore("C:/memex-config-test");

    expect(store.getActiveId()).toBe(LOCAL_FIRST_PROFILE_ID);
    expect(store.getActive().agentRuntime).toBe("http://192.168.2.101:8008");
  });

  it("migrates the former hosted default to the local execution plane once", () => {
    files.set(configPath, JSON.stringify({
      activeProfileId: "memex-anywhere",
      profiles: [{
        id: "memex-anywhere", name: "Memex Anywhere", providerType: "internal",
        agentRuntime: "https://memex.shivelymedia.com/api/backend",
        mempalace: "https://memex.shivelymedia.com/api/backend",
      }],
      allowedExtensionIds: [],
    }));

    const store = new ConfigStore("C:/memex-config-test");
    const persisted = JSON.parse(files.get(configPath)!);

    expect(store.getActiveId()).toBe(LOCAL_FIRST_PROFILE_ID);
    expect(persisted.localFirstRoutingMigrationComplete).toBe(true);
  });

  it("does not overwrite a deliberately selected custom profile", () => {
    files.set(configPath, JSON.stringify({
      activeProfileId: "work-vpn",
      profiles: [{
        id: "work-vpn", name: "Work VPN", providerType: "external",
        agentRuntime: "https://runtime.example.test", mempalace: "https://memory.example.test",
      }],
      allowedExtensionIds: [],
    }));

    const store = new ConfigStore("C:/memex-config-test");

    expect(store.getActiveId()).toBe("work-vpn");
  });
});

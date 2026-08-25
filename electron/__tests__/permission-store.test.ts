import { afterEach, describe, expect, it, vi } from "vitest";

const files = new Map<string, string>();
vi.mock("node:fs", () => ({
  existsSync: (path: string) => files.has(path),
  readFileSync: (path: string) => files.get(path) ?? "",
  writeFileSync: (path: string, content: string) => { files.set(path, content); },
}));
vi.mock("node:path", () => ({
  join: (...parts: string[]) => parts.join("/").replace(/\/\//g, "/"),
}));

import { PermissionStore } from "../permission-store";

const approvalPath = "C:/memex-permissions-test/tool-approvals.json";

afterEach(() => files.clear());

function makeStore(): { dir: string; store: PermissionStore } {
  const dir = "C:/memex-permissions-test";
  return { dir, store: new PermissionStore(dir) };
}

describe("PermissionStore", () => {
  it("keeps session grants isolated by owner and out of durable state", () => {
    const { store } = makeStore();

    expect(store.isApproved("alice", "workspace-a", "memory_write")).toBeNull();
    expect(store.grant("alice", "workspace-a", "memory_write", "session")).toBe(true);
    expect(store.isApproved("alice", "workspace-a", "memory_write")).toBe("session");
    expect(store.isApproved("alice", "workspace-b", "memory_write")).toBeNull();
    expect(store.isApproved("bob", "workspace-a", "memory_write")).toBeNull();
    expect(files.has(approvalPath)).toBe(false);
  });

  it("persists workspace grants and reloads them only for the same owner", () => {
    const { dir, store } = makeStore();

    expect(store.grant("alice", "workspace-a", "memory_write", "workspace")).toBe(true);
    expect(new PermissionStore(dir).isApproved("alice", "workspace-a", "memory_write")).toBe("workspace");
    expect(new PermissionStore(dir).isApproved("alice", "workspace-b", "memory_write")).toBeNull();
    expect(new PermissionStore(dir).isApproved("bob", "workspace-a", "memory_write")).toBeNull();
  });

  it("fails closed for malformed persisted state", () => {
    const { dir } = makeStore();
    // The store must never interpret malformed state as an approval.
    files.set(approvalPath, "not-json");
    expect(new PermissionStore(dir).isApproved("alice", "workspace-a", "memory_write")).toBeNull();
  });
});

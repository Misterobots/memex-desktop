import { describe, expect, it, vi } from "vitest";

vi.mock("fs", () => ({ existsSync: () => false, readdirSync: () => [] }));
vi.mock("path", () => ({
  normalize: (value: string) => value.replace(/\//g, "\\"),
  join: (...parts: string[]) => parts.join("\\").replace(/\\+/g, "\\"),
  basename: (value: string) => value.split(/[/\\]/).filter(Boolean).at(-1) ?? "",
  dirname: (value: string) => value.split(/[/\\]/).filter(Boolean).slice(0, -1).join("\\"),
}));

import { unrealRootFromPath } from "../unreal-engine";

describe("Unreal Engine paths", () => {
  it("accepts the engine root, Engine directory, and Win64 binaries directory", () => {
    const root = "E:\\Epic Games\\UE_5.8";
    expect(unrealRootFromPath(root)).toBe(root);
    expect(unrealRootFromPath(root + "\\Engine")).toBe(root);
    expect(unrealRootFromPath(root + "\\Engine\\Binaries\\Win64")).toBe(root);
  });
});

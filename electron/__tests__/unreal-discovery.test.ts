import { beforeEach, describe, expect, it, vi } from "vitest";

// A virtual filesystem, hoisted so the `fs` mock factory can close over it.
// `path` is mocked to win32 semantics for the same reason the sibling test does
// it: the vite-electron-renderer alias shadows node's real `path` under vitest.
const fsState = vi.hoisted(() => ({
  files: new Set<string>(),
  dirs: new Map<string, string[]>(),
  contents: new Map<string, string>(),
}));

vi.mock("fs", () => ({
  existsSync: (target: string) => fsState.files.has(target),
  readdirSync: (target: string) => {
    const entries = fsState.dirs.get(target);
    if (!entries) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    return entries;
  },
  readFileSync: (target: string) => {
    const content = fsState.contents.get(target);
    if (content === undefined) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    return content;
  },
}));

vi.mock("path", () => ({
  normalize: (value: string) => value.replace(/\//g, "\\"),
  join: (...parts: string[]) => parts.join("\\").replace(/\\+/g, "\\"),
  basename: (value: string) => value.split(/[/\\]/).filter(Boolean).at(-1) ?? "",
  dirname: (value: string) => value.split(/[/\\]/).filter(Boolean).slice(0, -1).join("\\"),
}));

import { join } from "path";
import { discoverUnrealInstalls } from "../unreal-engine";

const PROGRAM_FILES = "C:\\Program Files";

function addDir(parent: string, name: string): void {
  const entries = fsState.dirs.get(parent) ?? [];
  if (!entries.includes(name)) entries.push(name);
  fsState.dirs.set(parent, entries);
}

/** Register a directory that looks like a complete engine install. */
function addEngine(parent: string, name: string, buildVersion?: string): string {
  addDir(parent, name);
  const root = join(parent, name);
  const binaries = join(root, "Engine", "Binaries", "Win64");
  fsState.files.add(join(binaries, "UnrealEditor.exe"));
  fsState.files.add(join(binaries, "UnrealEditor-Cmd.exe"));
  if (buildVersion !== undefined) fsState.contents.set(join(root, "Engine", "Build", "Build.version"), buildVersion);
  return root;
}

beforeEach(() => {
  fsState.files.clear();
  fsState.dirs.clear();
  fsState.contents.clear();
});

describe("discoverUnrealInstalls", () => {
  it("finds a source build on a drive root, outside any Epic Games folder", () => {
    // The real case this fix exists for: E:\UnrealEngine-5.8.2-release.
    const root = addEngine("E:\\", "UnrealEngine-5.8.2-release", JSON.stringify({ MajorVersion: 5, MinorVersion: 8, PatchVersion: 2 }));

    expect(discoverUnrealInstalls(PROGRAM_FILES)).toEqual([
      {
        root,
        version: "5.8.2",
        editorPath: join(root, "Engine", "Binaries", "Win64", "UnrealEditor.exe"),
        commandPath: join(root, "Engine", "Binaries", "Win64", "UnrealEditor-Cmd.exe"),
      },
    ]);
  });

  it("still finds launcher installs under Epic Games", () => {
    const root = addEngine(join(PROGRAM_FILES, "Epic Games"), "UE_5.8");
    const found = discoverUnrealInstalls(PROGRAM_FILES);

    expect(found).toHaveLength(1);
    expect(found[0].root).toBe(root);
  });

  it("prefers Build.version over the directory name", () => {
    addEngine("D:\\", "UnrealEngine-5.8.2-release", JSON.stringify({ MajorVersion: 5, MinorVersion: 9, PatchVersion: 0 }));
    expect(discoverUnrealInstalls(PROGRAM_FILES)[0].version).toBe("5.9.0");
  });

  it("falls back to a cleaned directory name when Build.version is unreadable", () => {
    addEngine("D:\\", "UnrealEngine-5.8.2-release");
    expect(discoverUnrealInstalls(PROGRAM_FILES)[0].version).toBe("5.8.2");

    fsState.files.clear();
    fsState.dirs.clear();
    addEngine("D:\\", "UE_5.4");
    expect(discoverUnrealInstalls(PROGRAM_FILES)[0].version).toBe("5.4");
  });

  it("ignores engine-named directories that have no editor binaries", () => {
    addDir("E:\\", "UnrealEngine-broken");
    expect(discoverUnrealInstalls(PROGRAM_FILES)).toEqual([]);
  });

  it("ignores unrelated directories on scanned drives", () => {
    addDir("E:\\", "Games");
    addDir("E:\\", "Epic Games");
    expect(discoverUnrealInstalls(PROGRAM_FILES)).toEqual([]);
  });

  it("reports each engine once even when several scan roots reach it", () => {
    addEngine("E:\\Epic Games", "UE_5.8");
    addEngine("E:\\", "UnrealEngine-5.8.2-release", JSON.stringify({ MajorVersion: 5, MinorVersion: 8, PatchVersion: 2 }));

    const roots = discoverUnrealInstalls(PROGRAM_FILES).map((install) => install.root);
    expect(new Set(roots).size).toBe(roots.length);
    expect(roots).toHaveLength(2);
  });
});

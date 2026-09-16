import { existsSync, readdirSync, readFileSync } from "fs";
import { join, basename, dirname, normalize } from "path";

export interface UnrealEngineInstall {
  root: string;
  version: string;
  editorPath: string;
  commandPath: string;
}

// Launcher installs are named `UE_5.8`; source and release-zip builds are named
// `UnrealEngine-5.8.2-release`. The name filter only keeps the scan cheap —
// `installAt` is the real gate, so a loose pattern costs nothing but a stat.
const ENGINE_DIR = /^(UE[_-]|UnrealEngine)/i;

// Launcher installs sit under `<drive>\Epic Games`; source builds are commonly
// unpacked straight onto a drive root, which the Epic Games-only scan never saw.
const SCAN_DRIVES = ["C:", "D:", "E:"];

function candidateParents(programFiles: string): string[] {
  const parents = [join(programFiles, "Epic Games")];
  for (const drive of SCAN_DRIVES) parents.push(join(`${drive}\\`, "Epic Games"), `${drive}\\`);
  return [...new Set(parents)];
}

/** The engine's own version file is authoritative; the directory name is a fallback. */
function versionAt(root: string, dirName: string): string {
  try {
    const parsed = JSON.parse(readFileSync(join(root, "Engine", "Build", "Build.version"), "utf8")) as Record<string, unknown>;
    const parts = [parsed.MajorVersion, parsed.MinorVersion, parsed.PatchVersion].filter((n): n is number => typeof n === "number");
    if (parts.length >= 2) return parts.join(".");
  } catch {
    // Missing, unreadable, or malformed — fall through to the directory name.
  }
  return dirName.replace(/^(UE[_-]|UnrealEngine-?)/i, "").replace(/-release$/i, "") || dirName;
}

function installAt(root: string): UnrealEngineInstall | null {
  const binaries = join(root, "Engine", "Binaries", "Win64");
  const editorPath = join(binaries, "UnrealEditor.exe");
  const commandPath = join(binaries, "UnrealEditor-Cmd.exe");
  if (!existsSync(editorPath) || !existsSync(commandPath)) return null;
  return { root, version: versionAt(root, basename(root)), editorPath, commandPath };
}

export function unrealRootFromPath(path: string): string {
  const normalized = normalize(path).replace(/[\\/]+$/, "");
  const lower = normalized.toLowerCase();
  const binarySuffix = join("Engine", "Binaries", "Win64").toLowerCase();
  if (lower.endsWith(binarySuffix)) return dirname(dirname(dirname(normalized)));
  if (basename(normalized).toLowerCase() === "engine") return dirname(normalized);
  return normalized;
}

export function validateUnrealRoot(path: string): UnrealEngineInstall | null {
  return installAt(unrealRootFromPath(path));
}

export function discoverUnrealInstalls(programFiles = process.env.ProgramFiles ?? "C:\\Program Files"): UnrealEngineInstall[] {
  const byRoot = new Map<string, UnrealEngineInstall>();
  for (const parent of candidateParents(programFiles)) {
    let names: string[];
    try { names = readdirSync(parent) as unknown as string[]; } catch { continue; }
    for (const name of names) {
      if (!ENGINE_DIR.test(String(name))) continue;
      const install = installAt(join(parent, String(name)));
      if (install && !byRoot.has(install.root)) byRoot.set(install.root, install);
    }
  }
  return [...byRoot.values()];
}

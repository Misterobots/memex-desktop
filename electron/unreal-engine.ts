import { existsSync, readdirSync } from "fs";
import { join, basename, dirname, normalize } from "path";

export interface UnrealEngineInstall {
  root: string;
  version: string;
  editorPath: string;
  commandPath: string;
}

function installAt(root: string): UnrealEngineInstall | null {
  const binaries = join(root, "Engine", "Binaries", "Win64");
  const editorPath = join(binaries, "UnrealEditor.exe");
  const commandPath = join(binaries, "UnrealEditor-Cmd.exe");
  if (!existsSync(editorPath) || !existsSync(commandPath)) return null;
  return { root, version: basename(root).replace(/^UE_/, ""), editorPath, commandPath };
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
  const roots = [...new Set([join(programFiles, "Epic Games"), "D:\\Epic Games", "E:\\Epic Games"])];
  return roots.flatMap((epicRoot) => {
    try {
      return readdirSync(epicRoot).filter((name) => /^UE_/i.test(name)).flatMap((name) => {
        const install = installAt(join(epicRoot, name));
        return install ? [install] : [];
      });
    } catch { return []; }
  });
}

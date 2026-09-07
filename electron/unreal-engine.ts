import { existsSync, readdirSync } from "fs";
import { join, basename, dirname } from "path";

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

export function validateUnrealRoot(path: string): UnrealEngineInstall | null {
  return installAt(path) ?? (basename(path).toLowerCase() === "engine" ? installAt(dirname(path)) : null);
}

export function discoverUnrealInstalls(programFiles = process.env.ProgramFiles ?? "C:\\Program Files"): UnrealEngineInstall[] {
  const epicRoot = join(programFiles, "Epic Games");
  try {
    return readdirSync(epicRoot)
      .filter((name) => /^UE_/i.test(name))
      .flatMap((name) => {
        const install = installAt(join(epicRoot, name));
        return install ? [install] : [];
      });
  } catch { return []; }
}

/**
 * Thin wrappers around window.memex native bridge calls.
 * Safe to call in both Electron and browser — resolves to no-op in browser.
 */
import { desktop } from "./desktop";

function bridge() {
  const b = desktop();
  if (!b) throw new Error("Not running in Memex Desktop");
  return b;
}

export const ipc = {
  readFile:    (path: string)                  => bridge().fs.readFile(path),
  stat:        (path: string)                  => bridge().fs.stat(path),
  writeFile:   (path: string, content: string) => bridge().fs.writeFile(path, content),
  readDir:     (path: string)                  => bridge().fs.readDir(path),
  mkdir:       (path: string)                  => bridge().fs.mkdir(path),
  delete:      (path: string)                  => bridge().fs.delete(path),
  rename:      (oldPath: string, newPath: string) => bridge().fs.rename(oldPath, newPath),
  copy:        (srcPath: string, destPath: string) => bridge().fs.copy(srcPath, destPath),
  exec:        (cmd: string, cwd?: string)     => bridge().shell.exec(cmd, cwd),
  openFolder:  ()                              => bridge().dialog.openFolder(),
  openFiles:   (options?: { title?: string; multiSelections?: boolean; directory?: boolean }) => bridge().dialog.openFiles(options),
  getCwd:      ()                              => Promise.resolve(""),
  getVersion:  ()                              => bridge().version(),
  openExternal:(url: string)                   => bridge().shell.openExternal(url),
};

import type { DirEntry, ExecResult } from "../../electron/preload";

declare global {
  interface Window {
    electron: {
      fs: {
        readFile:  (path: string) => Promise<string>;
        writeFile: (path: string, content: string) => Promise<void>;
        readDir:   (path: string) => Promise<DirEntry[]>;
      };
      shell: {
        exec: (cmd: string, cwd?: string) => Promise<ExecResult>;
      };
      dialog: {
        openFolder: () => Promise<string | null>;
      };
      app: {
        getCwd:       () => Promise<string>;
        getVersion:   () => Promise<string>;
        openExternal: (url: string) => Promise<void>;
      };
    };
  }
}

const isElectron = () => typeof window !== "undefined" && !!window.electron;

export const ipc = {
  readFile:    (path: string)                  => isElectron() ? window.electron.fs.readFile(path)              : Promise.reject("No Electron"),
  writeFile:   (path: string, content: string) => isElectron() ? window.electron.fs.writeFile(path, content)    : Promise.reject("No Electron"),
  readDir:     (path: string)                  => isElectron() ? window.electron.fs.readDir(path)               : Promise.resolve([]),
  exec:        (cmd: string, cwd?: string)     => isElectron() ? window.electron.shell.exec(cmd, cwd)           : Promise.resolve({ stdout: "", stderr: "No Electron", code: 1 }),
  openFolder:  ()                              => isElectron() ? window.electron.dialog.openFolder()             : Promise.resolve(null),
  getCwd:      ()                              => isElectron() ? window.electron.app.getCwd()                   : Promise.resolve(""),
  getVersion:  ()                              => isElectron() ? window.electron.app.getVersion()               : Promise.resolve("web"),
  openExternal: (url: string)                  => isElectron() ? window.electron.app.openExternal(url)          : Promise.resolve(window.open(url, "_blank")),
};

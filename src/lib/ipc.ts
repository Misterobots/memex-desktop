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

export const ipc = {
  readFile:   (path: string)                    => window.electron.fs.readFile(path),
  writeFile:  (path: string, content: string)   => window.electron.fs.writeFile(path, content),
  readDir:    (path: string)                    => window.electron.fs.readDir(path),
  exec:       (cmd: string, cwd?: string)       => window.electron.shell.exec(cmd, cwd),
  openFolder: ()                                => window.electron.dialog.openFolder(),
  getCwd:     ()                                => window.electron.app.getCwd(),
  getVersion: ()                                => window.electron.app.getVersion(),
  openExternal: (url: string)                   => window.electron.app.openExternal(url),
};

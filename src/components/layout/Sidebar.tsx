import { useStore } from "../../lib/store";
import { FileTree } from "../sidebar/FileTree";
import { SessionList } from "../sidebar/SessionList";
import { ipc } from "../../lib/ipc";

export function Sidebar() {
  const { cwd, setCwd } = useStore();

  return (
    <aside className="w-64 flex-shrink-0 border-r border-border bg-surface flex flex-col">
      {/* Folder header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs text-muted font-mono uppercase tracking-wider">Explorer</span>
        <button
          onClick={() => ipc.openFolder().then((p) => p && setCwd(p))}
          className="text-muted hover:text-text transition-colors"
          title="Open folder"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25V5.75A1.75 1.75 0 0014.25 4H8.5L6.75 2.25A1.75 1.75 0 005.56 1.75H1.75z" />
          </svg>
        </button>
      </div>

      {/* File tree */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {cwd ? <FileTree root={cwd} /> : (
          <div className="flex items-center justify-center h-32 text-muted text-xs">
            No folder open
          </div>
        )}
      </div>

      {/* Sessions */}
      <div className="border-t border-border">
        <SessionList />
      </div>
    </aside>
  );
}

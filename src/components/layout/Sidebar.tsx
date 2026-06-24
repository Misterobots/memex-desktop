import { useState } from "react";
import { useStore } from "../../lib/store";
import { FileTree } from "../sidebar/FileTree";
import { SessionList } from "../sidebar/SessionList";
import { ipc } from "../../lib/ipc";

export function Sidebar() {
  const { cwd, setCwd } = useStore();
  const [filesOpen, setFilesOpen] = useState(false);

  return (
    <aside className="w-[260px] flex-shrink-0 border-r border-border/60 bg-surface flex flex-col">
      {/* Sessions — primary */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <SessionList />
      </div>

      {/* Workspace files — secondary, collapsible */}
      <div className="border-t border-border/60">
        <button
          onClick={() => setFilesOpen((x) => !x)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-muted hover:text-text transition-colors"
        >
          <span className="flex items-center gap-1.5 font-medium uppercase tracking-wide">
            <span className="text-faint">{filesOpen ? "▾" : "▸"}</span>
            Workspace
          </span>
          <span
            onClick={(e) => { e.stopPropagation(); ipc.openFolder().then((p) => p && setCwd(p)); }}
            className="text-faint hover:text-accent transition-colors"
            title="Open folder"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25V5.75A1.75 1.75 0 0014.25 4H8.5L6.75 2.25A1.75 1.75 0 005.56 1.75H1.75z" />
            </svg>
          </span>
        </button>
        {filesOpen && (
          <div className="max-h-64 overflow-y-auto pb-2">
            {cwd ? (
              <FileTree root={cwd} />
            ) : (
              <button
                onClick={() => ipc.openFolder().then((p) => p && setCwd(p))}
                className="mx-4 mb-2 px-3 py-1.5 text-xs text-muted border border-border rounded-md hover:border-accent hover:text-accent transition-colors w-[calc(100%-2rem)]"
              >
                Open a folder
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

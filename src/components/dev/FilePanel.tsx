import { useEffect, useRef } from "react";
import { FileTree } from "../sidebar/FileTree";
import { ipc } from "../../lib/ipc";
import { useStore } from "../../lib/store";

interface Props {
  open: boolean;
  onClose: () => void;
  onFileClick: (path: string) => void;
}

export function FilePanel({ open, onClose, onFileClick }: Props) {
  const { cwd, setCwd } = useStore();
  const folderName = cwd ? cwd.split(/[/\\]/).filter(Boolean).pop() : null;
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Slight delay so the open-click doesn't immediately close
    const id = setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => { clearTimeout(id); document.removeEventListener("mousedown", handler); };
  }, [open, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop — subtle, doesn't block the main UI visually */}
      <div
        className={`absolute inset-0 z-20 transition-opacity duration-200 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        style={{ background: "rgba(0,0,0,0.25)" }}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`absolute right-0 top-0 bottom-0 z-30 w-72 bg-surface border-l border-border/60 flex flex-col shadow-2xl transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-10 border-b border-border/60 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" className="text-yellow flex-shrink-0">
              <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25V5.75A1.75 1.75 0 0014.25 4H8.5L6.75 2.25A1.75 1.75 0 005.56 1.75H1.75z" />
            </svg>
            <span className="text-xs text-text font-medium truncate">
              {folderName ?? "Files"}
            </span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => ipc.openFolder().then((p) => p && setCwd(p))}
              className="text-faint hover:text-accent transition-colors p-1 rounded"
              title="Open folder"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 9.5V4.75A1.75 1.75 0 013.75 3H7l1.5 1.5H13.25A1.75 1.75 0 0115 6.25v3.25" />
                <path d="M1 9.5h14l-1.5 5H2.5L1 9.5z" />
              </svg>
            </button>
            <button
              onClick={onClose}
              className="text-faint hover:text-text transition-colors p-1 rounded"
              title="Close"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 2l12 12M14 2L2 14" />
              </svg>
            </button>
          </div>
        </div>

        {/* File tree */}
        <div className="flex-1 overflow-y-auto py-1">
          {cwd ? (
            <FileTree
              root={cwd}
              onFileClick={(path) => { onFileClick(path); onClose(); }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 px-4 text-center">
              <p className="text-faint text-xs">No folder open</p>
              <button
                onClick={() => ipc.openFolder().then((p) => p && setCwd(p))}
                className="px-3 py-1.5 text-xs text-accent border border-accent/40 rounded-lg hover:bg-accent/10 transition-colors"
              >
                Open folder
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

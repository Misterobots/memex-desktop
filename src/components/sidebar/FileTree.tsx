import { useEffect, useState } from "react";
import { ipc } from "../../lib/ipc";
import type { DirEntry } from "../../types/memex";

interface Props { root: string; depth?: number; }

function FileIcon({ isDir }: { isDir: boolean }) {
  return isDir ? (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="text-yellow flex-shrink-0">
      <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25V5.75A1.75 1.75 0 0014.25 4H8.5L6.75 2.25A1.75 1.75 0 005.56 1.75H1.75z" />
    </svg>
  ) : (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="text-muted flex-shrink-0">
      <path d="M3.75 1.5a.25.25 0 00-.25.25v11.5c0 .138.112.25.25.25h8.5a.25.25 0 00.25-.25V6H9.75A1.75 1.75 0 018 4.25V1.5H3.75zm5.75.56v2.19c0 .138.112.25.25.25h2.19L9.5 2.06zM2 1.75C2 .784 2.784 0 3.75 0h5.086c.464 0 .909.184 1.237.513l3.414 3.414c.329.328.513.773.513 1.237v8.086A1.75 1.75 0 0112.25 15h-8.5A1.75 1.75 0 012 13.25V1.75z" />
    </svg>
  );
}

function FileNode({ entry, depth }: { entry: DirEntry; depth: number }) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<DirEntry[]>([]);

  const toggle = async () => {
    if (!entry.isDir) return;
    if (!expanded && children.length === 0) {
      const entries = await ipc.readDir(entry.path);
      setChildren(entries.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name)));
    }
    setExpanded((x) => !x);
  };

  return (
    <div>
      <button
        onClick={toggle}
        className="w-full flex items-center gap-1.5 px-2 py-0.5 hover:bg-canvas text-xs text-text transition-colors text-left"
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        {entry.isDir && (
          <span className="text-muted text-xs w-3">{expanded ? "▾" : "▸"}</span>
        )}
        {!entry.isDir && <span className="w-3" />}
        <FileIcon isDir={entry.isDir} />
        <span className="truncate">{entry.name}</span>
      </button>
      {expanded && children.map((c) => (
        <FileNode key={c.path} entry={c} depth={depth + 1} />
      ))}
    </div>
  );
}

export function FileTree({ root }: Props) {
  const [entries, setEntries] = useState<DirEntry[]>([]);

  useEffect(() => {
    ipc.readDir(root).then((e) =>
      setEntries(e.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name)))
    ).catch(() => setEntries([]));
  }, [root]);

  return (
    <div className="py-1">
      {entries.map((e) => <FileNode key={e.path} entry={e} depth={0} />)}
    </div>
  );
}

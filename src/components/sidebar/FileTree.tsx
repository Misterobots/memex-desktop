import React, { useEffect, useState, useRef, useCallback } from "react";
import { ipc } from "../../lib/ipc";
import type { DirEntry } from "../../types/memex";

interface Props {
  root: string;
  depth?: number;
  onFileClick?: (path: string) => void;
}

function joinPath(...parts: string[]): string {
  const cleanParts = parts.filter(Boolean).map((p, i) => {
    let s = p;
    if (i > 0) s = s.replace(/^[/\\]+/, "");
    if (i < parts.length - 1) s = s.replace(/[/\\]+$/, "");
    return s;
  });
  const sep = cleanParts[0]?.includes("\\") ? "\\" : "/";
  return cleanParts.join(sep);
}

function dirnamePath(p: string): string {
  const norm = p.replace(/[/\\]+$/, "");
  const idx = Math.max(norm.lastIndexOf("/"), norm.lastIndexOf("\\"));
  return idx <= 0 ? norm : norm.slice(0, idx);
}

function basenamePath(p: string): string {
  const norm = p.replace(/[/\\]+$/, "");
  const idx = Math.max(norm.lastIndexOf("/"), norm.lastIndexOf("\\"));
  return idx < 0 ? norm : norm.slice(idx + 1);
}

function FileIcon({ isDir, expanded }: { isDir: boolean; expanded?: boolean }) {
  if (isDir) {
    return (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" className="text-yellow/90 flex-shrink-0">
        {expanded ? (
          <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-7.5A1.75 1.75 0 0014.25 4H8.5L6.75 2.25A1.75 1.75 0 005.56 1.75H1.75z" />
        ) : (
          <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25V5.75A1.75 1.75 0 0014.25 4H8.5L6.75 2.25A1.75 1.75 0 005.56 1.75H1.75z" />
        )}
      </svg>
    );
  }
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" className="text-muted/80 flex-shrink-0">
      <path d="M3.75 1.5a.25.25 0 00-.25.25v11.5c0 .138.112.25.25.25h8.5a.25.25 0 00.25-.25V6H9.75A1.75 1.75 0 018 4.25V1.5H3.75zm5.75.56v2.19c0 .138.112.25.25.25h2.19L9.5 2.06zM2 1.75C2 .784 2.784 0 3.75 0h5.086c.464 0 .909.184 1.237.513l3.414 3.414c.329.328.513.773.513 1.237v8.086A1.75 1.75 0 0112.25 15h-8.5A1.75 1.75 0 012 13.25V1.75z" />
    </svg>
  );
}

interface InlineCreateRowProps {
  type: "file" | "folder";
  depth: number;
  onCommit: (name: string) => void;
  onCancel: () => void;
}

function InlineCreateRow({ type, depth, onCommit, onCancel }: InlineCreateRowProps) {
  const [val, setVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (val.trim()) onCommit(val.trim());
      else onCancel();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div
      className="flex items-center gap-1.5 py-0.5 px-2 bg-canvas/60 text-xs"
      style={{ paddingLeft: `${8 + depth * 12}px` }}
    >
      <span className="w-3" />
      <FileIcon isDir={type === "folder"} />
      <input
        ref={inputRef}
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (val.trim()) onCommit(val.trim());
          else onCancel();
        }}
        placeholder={type === "file" ? "filename.ext" : "folder-name"}
        className="flex-1 min-w-0 bg-surface border border-accent/60 rounded px-1.5 py-0.5 text-xs text-text outline-none shadow-sm focus:border-accent"
      />
    </div>
  );
}

interface FileNodeProps {
  entry: DirEntry;
  depth: number;
  expandedPaths: Set<string>;
  toggleExpand: (path: string) => void;
  onFileClick?: (path: string) => void;
  creating: { parentPath: string; type: "file" | "folder" } | null;
  startCreate: (parentPath: string, type: "file" | "folder") => void;
  commitCreate: (parentPath: string, type: "file" | "folder", name: string) => void;
  cancelCreate: () => void;
  renaming: { path: string; currentName: string } | null;
  startRename: (path: string, currentName: string) => void;
  commitRename: (oldPath: string, newName: string) => void;
  cancelRename: () => void;
  onDelete: (entry: DirEntry) => void;
  dragOverPath: string | null;
  setDragOverPath: (path: string | null) => void;
  onDropFiles: (targetDir: string, files: File[]) => void;
  treeVersion: number;
}

function FileNode({
  entry,
  depth,
  expandedPaths,
  toggleExpand,
  onFileClick,
  creating,
  startCreate,
  commitCreate,
  cancelCreate,
  renaming,
  startRename,
  commitRename,
  cancelRename,
  onDelete,
  dragOverPath,
  setDragOverPath,
  onDropFiles,
  treeVersion,
}: FileNodeProps) {
  const [children, setChildren] = useState<DirEntry[]>([]);
  const [copied, setCopied] = useState(false);
  const [renameVal, setRenameVal] = useState(entry.name);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const isExpanded = expandedPaths.has(entry.path);
  const isRenaming = renaming?.path === entry.path;
  const isDragTarget = dragOverPath === entry.path;

  // Load children when expanded or when treeVersion changes while expanded
  useEffect(() => {
    if (entry.isDir && isExpanded) {
      ipc.readDir(entry.path)
        ?.then((entries) => {
          setChildren(
            entries.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name))
          );
        })
        .catch(() => setChildren([]));
    }
  }, [entry.isDir, entry.path, isExpanded, treeVersion]);

  useEffect(() => {
    if (isRenaming) {
      setRenameVal(entry.name);
      setTimeout(() => renameInputRef.current?.select(), 50);
    }
  }, [isRenaming, entry.name]);

  const handleCopyPath = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(entry.path);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!entry.isDir) return;
    e.preventDefault();
    e.stopPropagation();
    if (dragOverPath !== entry.path) setDragOverPath(entry.path);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!entry.isDir) return;
    e.preventDefault();
    e.stopPropagation();
    if (dragOverPath === entry.path) setDragOverPath(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!entry.isDir) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOverPath(null);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      onDropFiles(entry.path, files);
    }
  };

  return (
    <div>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => {
          if (entry.isDir) toggleExpand(entry.path);
          else onFileClick?.(entry.path);
        }}
        className={`group relative flex items-center gap-1.5 px-2 py-0.5 text-xs text-text transition-colors cursor-pointer select-none ${
          isDragTarget
            ? "bg-accent/20 border-l-2 border-accent text-accent"
            : "hover:bg-canvas/80"
        }`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        {entry.isDir ? (
          <span className="text-muted/80 text-[10px] w-3 flex items-center justify-center">
            {isExpanded ? "▾" : "▸"}
          </span>
        ) : (
          <span className="w-3" />
        )}

        <FileIcon isDir={entry.isDir} expanded={isExpanded} />

        {isRenaming ? (
          <input
            ref={renameInputRef}
            type="text"
            value={renameVal}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setRenameVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (renameVal.trim() && renameVal.trim() !== entry.name) {
                  commitRename(entry.path, renameVal.trim());
                } else {
                  cancelRename();
                }
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelRename();
              }
            }}
            onBlur={() => {
              if (renameVal.trim() && renameVal.trim() !== entry.name) {
                commitRename(entry.path, renameVal.trim());
              } else {
                cancelRename();
              }
            }}
            className="flex-1 min-w-0 bg-surface border border-accent rounded px-1 text-xs text-text outline-none"
          />
        ) : (
          <span className="truncate flex-1 min-w-0 font-normal">{entry.name}</span>
        )}

        {/* Hover Micro-actions */}
        {!isRenaming && (
          <div className="hidden group-hover:flex items-center gap-1 text-muted ml-auto pl-1 bg-gradient-to-l from-canvas via-canvas to-transparent">
            {entry.isDir && (
              <>
                <button
                  type="button"
                  title="New File Inside"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isExpanded) toggleExpand(entry.path);
                    startCreate(entry.path, "file");
                  }}
                  className="p-0.5 hover:text-accent rounded transition-colors"
                >
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M9 1H4a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V6L9 1z" />
                    <path d="M8 8v4M6 10h4" />
                  </svg>
                </button>
                <button
                  type="button"
                  title="New Folder Inside"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isExpanded) toggleExpand(entry.path);
                    startCreate(entry.path, "folder");
                  }}
                  className="p-0.5 hover:text-accent rounded transition-colors"
                >
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M1 3.5A1.5 1.5 0 012.5 2h3.293a1 1 0 01.707.293L8 3.793 9.5 2.293A1 1 0 0110.207 2H13.5A1.5 1.5 0 0115 3.5v9a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z" />
                    <path d="M8 7v4M6 9h4" />
                  </svg>
                </button>
              </>
            )}

            <button
              type="button"
              title="Rename"
              onClick={(e) => {
                e.stopPropagation();
                startRename(entry.path, entry.name);
              }}
              className="p-0.5 hover:text-accent rounded transition-colors"
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" />
              </svg>
            </button>

            <button
              type="button"
              title={copied ? "Path Copied!" : "Copy Path"}
              onClick={handleCopyPath}
              className={`p-0.5 rounded transition-colors ${copied ? "text-emerald-400" : "hover:text-text"}`}
            >
              {copied ? (
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 8.5l3.5 3.5L13 4" />
                </svg>
              ) : (
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <rect x="5" y="5" width="8" height="8" rx="1.5" />
                  <path d="M3 11V3a1.5 1.5 0 011.5-1.5h8" />
                </svg>
              )}
            </button>

            <button
              type="button"
              title="Delete"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(entry);
              }}
              className="p-0.5 hover:text-red-400 rounded transition-colors"
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M2 4h12M5 4V2.5A1.5 1.5 0 016.5 1h3A1.5 1.5 0 0111 2.5V4M13 4v9.5a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 013 13.5V4" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Inline Create Row inside this folder */}
      {entry.isDir && isExpanded && creating?.parentPath === entry.path && (
        <InlineCreateRow
          type={creating.type}
          depth={depth + 1}
          onCommit={(name) => commitCreate(entry.path, creating.type, name)}
          onCancel={cancelCreate}
        />
      )}

      {/* Children */}
      {entry.isDir && isExpanded && children.map((c) => (
        <FileNode
          key={c.path}
          entry={c}
          depth={depth + 1}
          expandedPaths={expandedPaths}
          toggleExpand={toggleExpand}
          onFileClick={onFileClick}
          creating={creating}
          startCreate={startCreate}
          commitCreate={commitCreate}
          cancelCreate={cancelCreate}
          renaming={renaming}
          startRename={startRename}
          commitRename={commitRename}
          cancelRename={cancelRename}
          onDelete={onDelete}
          dragOverPath={dragOverPath}
          setDragOverPath={setDragOverPath}
          onDropFiles={onDropFiles}
          treeVersion={treeVersion}
        />
      ))}
    </div>
  );
}

export function FileTree({ root, onFileClick }: Props) {
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState<{ parentPath: string; type: "file" | "folder" } | null>(null);
  const [renaming, setRenaming] = useState<{ path: string; currentName: string } | null>(null);
  const [treeVersion, setTreeVersion] = useState(0);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const importMenuRef = useRef<HTMLDivElement>(null);

  const refreshTree = useCallback(() => {
    setTreeVersion((v) => v + 1);
  }, []);

  // Fetch root entries
  useEffect(() => {
    if (!root) {
      setEntries([]);
      return;
    }
    ipc.readDir(root)
      ?.then((e) =>
        setEntries(e.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name)))
      )
      ?.catch(() => setEntries([]));
  }, [root, treeVersion]);

  // Click outside to close import menu
  useEffect(() => {
    if (!importMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (importMenuRef.current && !importMenuRef.current.contains(e.target as Node)) {
        setImportMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [importMenuOpen]);

  const toggleExpand = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedPaths(new Set());
  }, []);

  const startCreate = useCallback((parentPath: string, type: "file" | "folder") => {
    setCreating({ parentPath, type });
    setExpandedPaths((prev) => new Set(prev).add(parentPath));
  }, []);

  const cancelCreate = useCallback(() => {
    setCreating(null);
  }, []);

  const commitCreate = useCallback(
    async (parentPath: string, type: "file" | "folder", rawName: string) => {
      setCreating(null);
      const name = rawName.trim();
      if (!name) return;

      try {
        const fullPath = joinPath(parentPath, name);
        const parentDir = dirnamePath(fullPath);

        // Ensure parent directories exist if user provided a subpath (e.g. "utils/helpers.ts")
        if (parentDir !== parentPath) {
          await ipc.mkdir(parentDir);
        }

        if (type === "file") {
          await ipc.writeFile(fullPath, "");
          setExpandedPaths((prev) => {
            const next = new Set(prev);
            next.add(parentPath);
            next.add(parentDir);
            return next;
          });
          refreshTree();
          onFileClick?.(fullPath);
        } else {
          await ipc.mkdir(fullPath);
          setExpandedPaths((prev) => {
            const next = new Set(prev);
            next.add(parentPath);
            next.add(fullPath);
            return next;
          });
          refreshTree();
        }
      } catch (err: any) {
        console.error("Failed to create file/folder:", err);
      }
    },
    [refreshTree, onFileClick]
  );

  const startRename = useCallback((path: string, currentName: string) => {
    setRenaming({ path, currentName });
  }, []);

  const cancelRename = useCallback(() => {
    setRenaming(null);
  }, []);

  const commitRename = useCallback(
    async (oldPath: string, newName: string) => {
      setRenaming(null);
      const name = newName.trim();
      if (!name) return;

      try {
        const dir = dirnamePath(oldPath);
        const newPath = joinPath(dir, name);
        if (newPath === oldPath) return;
        await ipc.rename(oldPath, newPath);
        refreshTree();
      } catch (err: any) {
        console.error("Failed to rename:", err);
      }
    },
    [refreshTree]
  );

  const handleDelete = useCallback(
    async (entry: DirEntry) => {
      const confirmed = window.confirm(
        `Are you sure you want to delete ${entry.isDir ? "folder" : "file"} "${entry.name}"?`
      );
      if (!confirmed) return;

      try {
        await ipc.delete(entry.path);
        refreshTree();
      } catch (err: any) {
        console.error("Failed to delete:", err);
      }
    },
    [refreshTree]
  );

  const handleDropFiles = useCallback(
    async (targetDir: string, files: File[]) => {
      try {
        for (const file of files) {
          const srcPath = (file as any).path;
          if (srcPath) {
            const destPath = joinPath(targetDir, file.name);
            await ipc.copy(srcPath, destPath);
          }
        }
        setExpandedPaths((prev) => new Set(prev).add(targetDir));
        refreshTree();
      } catch (err: any) {
        console.error("Failed to copy dropped files:", err);
      }
    },
    [refreshTree]
  );

  const handleImportFiles = async () => {
    setImportMenuOpen(false);
    try {
      const selected = await ipc.openFiles({
        title: "Select files to add to workspace",
        multiSelections: true,
      });
      if (selected && selected.length > 0) {
        for (const src of selected) {
          const dest = joinPath(root, basenamePath(src));
          await ipc.copy(src, dest);
        }
        refreshTree();
      }
    } catch (err: any) {
      console.error("Failed to import files:", err);
    }
  };

  const handleImportFolder = async () => {
    setImportMenuOpen(false);
    try {
      const selected = await ipc.openFiles({
        title: "Select folder to add to workspace",
        directory: true,
        multiSelections: false,
      });
      if (selected && selected.length > 0) {
        const src = selected[0];
        const dest = joinPath(root, basenamePath(src));
        await ipc.copy(src, dest);
        refreshTree();
      }
    } catch (err: any) {
      console.error("Failed to import folder:", err);
    }
  };

  const rootName = basenamePath(root) || "Workspace";

  return (
    <div
      className="flex flex-col h-full select-none"
      onDragOver={(e) => {
        e.preventDefault();
        if (dragOverPath !== root) setDragOverPath(root);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        if (dragOverPath === root) setDragOverPath(null);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOverPath(null);
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) handleDropFiles(root, files);
      }}
    >
      {/* Explorer Toolbar Header */}
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-border/50 text-xs text-muted relative bg-surface/30">
        <span
          className="font-semibold text-text uppercase tracking-wider text-[10.5px] truncate max-w-[130px]"
          title={root}
        >
          {rootName}
        </span>

        <div className="flex items-center gap-1">
          {/* New File at root */}
          <button
            type="button"
            onClick={() => startCreate(root, "file")}
            title="New File (at workspace root)"
            className="p-1 hover:text-text hover:bg-canvas rounded transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M9 1H4a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V6L9 1z" />
              <path d="M8 8v4M6 10h4" />
            </svg>
          </button>

          {/* New Folder at root */}
          <button
            type="button"
            onClick={() => startCreate(root, "folder")}
            title="New Folder (at workspace root)"
            className="p-1 hover:text-text hover:bg-canvas rounded transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M1 3.5A1.5 1.5 0 012.5 2h3.293a1 1 0 01.707.293L8 3.793 9.5 2.293A1 1 0 0110.207 2H13.5A1.5 1.5 0 0115 3.5v9a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z" />
              <path d="M8 7v4M6 9h4" />
            </svg>
          </button>

          {/* Add / Import Menu */}
          <div className="relative" ref={importMenuRef}>
            <button
              type="button"
              onClick={() => setImportMenuOpen(!importMenuOpen)}
              title="Add / Import into workspace..."
              className={`p-1 rounded transition-colors ${
                importMenuOpen ? "text-accent bg-canvas" : "hover:text-text hover:bg-canvas"
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M8 2v8M4 6l4 4 4-4" />
                <path d="M2 12v1.5A1.5 1.5 0 003.5 15h9a1.5 1.5 0 001.5-1.5V12" />
              </svg>
            </button>

            {importMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-surface border border-border rounded-lg shadow-xl py-1 z-30 text-xs">
                <button
                  type="button"
                  onClick={handleImportFiles}
                  className="w-full text-left px-3 py-1.5 hover:bg-canvas hover:text-text flex items-center gap-2 text-text"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M9 1H4a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V6L9 1z" />
                  </svg>
                  Import Files...
                </button>
                <button
                  type="button"
                  onClick={handleImportFolder}
                  className="w-full text-left px-3 py-1.5 hover:bg-canvas hover:text-text flex items-center gap-2 text-text"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M1 3.5A1.5 1.5 0 012.5 2h3.293a1 1 0 01.707.293L8 3.793 9.5 2.293A1 1 0 0110.207 2H13.5A1.5 1.5 0 0115 3.5v9a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z" />
                  </svg>
                  Import Folder...
                </button>
              </div>
            )}
          </div>

          {/* Refresh Tree */}
          <button
            type="button"
            onClick={refreshTree}
            title="Refresh"
            className="p-1 hover:text-text hover:bg-canvas rounded transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M1.5 8a6.5 6.5 0 101.9-4.6L1 5.5" />
              <path d="M1 1.5v4h4" />
            </svg>
          </button>

          {/* Collapse All */}
          <button
            type="button"
            onClick={collapseAll}
            title="Collapse All"
            className="p-1 hover:text-text hover:bg-canvas rounded transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M11 2L8 5 5 2M11 14l-3-3-3 3" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto py-1">
        {/* Root-level Inline Creation Row */}
        {creating?.parentPath === root && (
          <InlineCreateRow
            type={creating.type}
            depth={0}
            onCommit={(name) => commitCreate(root, creating.type, name)}
            onCancel={cancelCreate}
          />
        )}

        {entries.length === 0 && !creating ? (
          <div className="px-4 py-8 text-center text-xs text-muted/70 flex flex-col items-center gap-2">
            <p>Folder is empty</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => startCreate(root, "file")}
                className="px-2 py-1 text-[11px] border border-border rounded hover:border-accent hover:text-accent transition-colors"
              >
                + New File
              </button>
              <button
                type="button"
                onClick={handleImportFiles}
                className="px-2 py-1 text-[11px] border border-border rounded hover:border-accent hover:text-accent transition-colors"
              >
                Import...
              </button>
            </div>
          </div>
        ) : (
          entries.map((e) => (
            <FileNode
              key={e.path}
              entry={e}
              depth={0}
              expandedPaths={expandedPaths}
              toggleExpand={toggleExpand}
              onFileClick={onFileClick}
              creating={creating}
              startCreate={startCreate}
              commitCreate={commitCreate}
              cancelCreate={cancelCreate}
              renaming={renaming}
              startRename={startRename}
              commitRename={commitRename}
              cancelRename={cancelRename}
              onDelete={handleDelete}
              dragOverPath={dragOverPath}
              setDragOverPath={setDragOverPath}
              onDropFiles={handleDropFiles}
              treeVersion={treeVersion}
            />
          ))
        )}
      </div>
    </div>
  );
}

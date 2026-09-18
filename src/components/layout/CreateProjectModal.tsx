import { useState, useEffect, useRef } from "react";
import { ipc } from "../../lib/ipc";

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, folderPath: string) => void;
}

function basename(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

export function CreateProjectModal({ isOpen, onClose, onCreate }: CreateProjectModalProps) {
  const [name, setName] = useState("");
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName("");
      setFolderPath(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSelectFolder = async () => {
    try {
      const selected = await ipc.openFolder();
      if (selected) {
        setFolderPath(selected);
        if (!name.trim()) {
          setName(basename(selected));
        }
      }
    } catch (err) {
      console.error("Failed to open folder picker", err);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderPath) return;
    const projectName = name.trim() || basename(folderPath);
    onCreate(projectName, folderPath);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        className="w-full max-w-md rounded-2xl border border-border/80 bg-[#1c1c1e] text-text shadow-2xl overflow-hidden p-6 relative"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-text tracking-tight">Create project</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-faint hover:text-text hover:bg-surface2 transition-colors"
            title="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.28 3.22a.75.75 0 00-1.06 1.06L6.94 8l-3.72 3.72a.75.75 0 101.06 1.06L8 9.06l3.72 3.72a.75.75 0 101.06-1.06L9.06 8l3.72-3.72a.75.75 0 00-1.06-1.06L8 6.94 4.28 3.22z" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Project Name input */}
          <div className="flex items-center gap-2.5 px-3 py-2.5 bg-[#262629] border border-border/70 rounded-xl focus-within:border-accent focus-within:ring-1 focus-within:ring-accent transition-all">
            <span className="text-faint">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 3a1 1 0 011-1h3.5l1.5 1.5H13a1 1 0 011 1v8a1 1 0 01-1 1H3a1 1 0 01-1-1V3z" />
              </svg>
            </span>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
              className="w-full bg-transparent text-sm text-text placeholder:text-muted/60 outline-none"
            />
          </div>

          {/* Source folders section */}
          <div>
            <label className="block text-xs font-semibold text-faint mb-2">Source folders</label>
            <div className="rounded-xl border border-border/60 bg-[#242426]/60 p-4">
              {folderPath ? (
                <div className="flex items-center justify-between gap-2 p-2 bg-[#2a2a2d] rounded-lg border border-border/50">
                  <div className="flex items-center gap-2 overflow-hidden min-w-0">
                    <span className="text-accent shrink-0">
                      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M2 3a1 1 0 011-1h3.5l1.5 1.5H13a1 1 0 011 1v8a1 1 0 01-1 1H3a1 1 0 01-1-1V3z" />
                      </svg>
                    </span>
                    <span className="text-xs text-text truncate font-mono" title={folderPath}>
                      {folderPath}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSelectFolder}
                    className="text-xs text-accent hover:underline shrink-0 px-1"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-3">
                  <div className="flex items-center gap-1 text-xs text-muted mb-3 cursor-default select-none">
                    <span>Add a folder on this computer</span>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M4 6l4 4 4-4H4z" />
                    </svg>
                  </div>
                  <button
                    type="button"
                    onClick={handleSelectFolder}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-border/70 bg-[#2c2c30] hover:bg-[#343438] text-xs font-medium text-text transition-colors shadow-sm"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M2 3a1 1 0 011-1h3.5l1.5 1.5H13a1 1 0 011 1v8a1 1 0 01-1 1H3a1 1 0 01-1-1V3z" />
                      <path d="M8 6v4M6 8h4" />
                    </svg>
                    <span>Add</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-muted hover:text-text transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!folderPath}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-white text-black hover:bg-neutral-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            >
              Create project
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

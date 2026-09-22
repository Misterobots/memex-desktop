import { useEffect, useRef, useState } from "react";
import { ipc } from "../../lib/ipc";
import { parseNotebook, serializeNotebook, type NotebookCell, type NotebookDocument } from "../../lib/notebook";
import { clearEditorBuffer, getEditorBuffer, setEditorBuffer } from "../../lib/editorBufferStore";

interface Props {
  path: string;
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

function outputText(output: unknown): string {
  if (!output || typeof output !== "object") return String(output ?? "");
  const item = output as Record<string, unknown>;
  if (typeof item.text === "string") return item.text;
  if (Array.isArray(item.text) && item.text.every((line) => typeof line === "string")) return item.text.join("");
  const data = item.data;
  if (data && typeof data === "object") {
    const text = (data as Record<string, unknown>)["text/plain"];
    if (typeof text === "string") return text;
    if (Array.isArray(text) && text.every((line) => typeof line === "string")) return text.join("");
    if ((data as Record<string, unknown>)["image/png"]) return "[image output]";
  }
  return "";
}

export function NotebookEditor({ path, onClose, onDirtyChange }: Props) {
  const [notebook, setNotebook] = useState<NotebookDocument | null>(null);
  const [original, setOriginal] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [externalChange, setExternalChange] = useState(false);
  const notebookRef = useRef<NotebookDocument | null>(null);
  const originalRef = useRef("");
  const fileStatRef = useRef<{ mtimeMs: number; size: number } | null>(null);
  const filename = path.split(/[/\\]/).pop() ?? path;
  const dirty = notebook !== null && serializeNotebook(notebook) !== original;

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  useEffect(() => {
    setError("");
    setExternalChange(false);
    fileStatRef.current = null;
    const cached = getEditorBuffer(path);
    if (cached) {
      const parsed = parseNotebook(cached.content);
      notebookRef.current = parsed;
      originalRef.current = cached.original;
      setNotebook(parsed);
      setOriginal(cached.original);
      void ipc.stat(path).then((stat) => { fileStatRef.current = stat; }).catch(() => undefined);
    } else {
      setNotebook(null);
      setOriginal("");
      notebookRef.current = null;
      ipc.readFile(path)
        .then((raw) => {
          const parsed = parseNotebook(raw);
          const serialized = serializeNotebook(parsed);
          notebookRef.current = parsed;
          originalRef.current = serialized;
          setNotebook(parsed);
          setOriginal(serialized);
          setEditorBuffer(path, { content: serialized, original: serialized });
          void ipc.stat(path).then((stat) => { fileStatRef.current = stat; }).catch(() => undefined);
        })
        .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
    }
    return () => {
      if (notebookRef.current) setEditorBuffer(path, { content: serializeNotebook(notebookRef.current), original: originalRef.current });
    };
  }, [path]);

  useEffect(() => {
    if (!notebook) return;
    let alive = true;
    const check = async () => {
      try {
        const stat = await ipc.stat(path);
        if (!alive || !fileStatRef.current) return;
        if (stat.mtimeMs !== fileStatRef.current.mtimeMs || stat.size !== fileStatRef.current.size) setExternalChange(true);
      } catch { /* preserve the local buffer when the file is temporarily unavailable */ }
    };
    const timer = window.setInterval(check, 1500);
    return () => { alive = false; window.clearInterval(timer); };
  }, [path, notebook !== null]);

  const updateCell = (index: number, patch: Partial<NotebookCell>) => {
    setNotebook((current) => {
      if (!current) return current;
      const next = {
      ...current,
      cells: current.cells.map((cell, cellIndex) => cellIndex === index ? { ...cell, ...patch } : cell),
      };
      notebookRef.current = next;
      setEditorBuffer(path, { content: serializeNotebook(next), original: originalRef.current });
      return next;
    });
  };

  const save = async () => {
    if (!notebook) return;
    setSaving(true);
    try {
      const serialized = serializeNotebook(notebook);
      await ipc.writeFile(path, serialized);
      originalRef.current = serialized;
      setOriginal(serialized);
      setEditorBuffer(path, { content: serialized, original: serialized });
      fileStatRef.current = await ipc.stat(path).catch(() => fileStatRef.current);
      setExternalChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const requestClose = () => {
    if (dirty) {
      if (!window.confirm("Discard unsaved changes to this notebook?")) return;
      // Prevent the unmount cleanup below from writing the just-discarded
      // buffer back into the cache, which would silently resurrect it.
      notebookRef.current = null;
      clearEditorBuffer(path);
    }
    onClose();
  };

  const saveWithConflictGuard = async () => {
    if (externalChange && !window.confirm("This notebook changed outside Memex. Save and replace the external changes?")) return;
    await save();
  };

  const reloadExternal = async () => {
    if (dirty && !window.confirm("This notebook changed outside Memex. Reload and discard your local edits?")) return;
    try {
      const raw = await ipc.readFile(path);
      const parsed = parseNotebook(raw);
      const serialized = serializeNotebook(parsed);
      notebookRef.current = parsed;
      originalRef.current = serialized;
      setNotebook(parsed);
      setOriginal(serialized);
      setEditorBuffer(path, { content: serialized, original: serialized });
      fileStatRef.current = await ipc.stat(path).catch(() => fileStatRef.current);
      setExternalChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault();
        void saveWithConflictGuard();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  });

  return (
    <div className="flex flex-col h-full bg-surface text-sm">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/60 bg-surface flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-text font-mono text-xs">{filename}</span>
          {dirty && <span className="w-1.5 h-1.5 rounded-full bg-accent" title="Unsaved changes" />}
          <span className="text-[10px] uppercase tracking-wide text-muted">Notebook</span>
        </div>
        <div className="flex items-center gap-2">
          {dirty && <button onClick={() => void saveWithConflictGuard()} disabled={saving} className="px-2.5 py-1 text-xs bg-accent text-canvas rounded-md hover:bg-accentdim disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>}
          <button onClick={requestClose} aria-label="Close notebook" className="text-faint hover:text-text transition-colors text-lg leading-none">×</button>
        </div>
      </div>

      {error ? (
        <div className="flex-1 flex items-center justify-center text-red text-xs px-4 text-center">{error}</div>
      ) : !notebook ? (
        <div className="flex-1 flex items-center justify-center text-faint text-xs">Loading notebook…</div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4 space-y-3">
          {externalChange && <div role="alert" className="flex shrink-0 flex-wrap items-center gap-2 border-b border-yellow-400/30 bg-yellow-400/10 px-3 py-2 text-xs text-yellow-100"><span className="min-w-0 flex-1">This notebook changed outside Memex. Reload it or keep your local edits; saving will replace the external version.</span><button type="button" onClick={() => void reloadExternal()} className="rounded border border-yellow-300/40 px-2 py-1 text-[11px] text-yellow-100 hover:bg-yellow-300/10">Reload</button></div>}
          {notebook.cells.map((cell, index) => {
            const outputs = Array.isArray(cell.outputs) ? cell.outputs : [];
            return (
              <section key={index} className="rounded-lg border border-border/60 bg-canvas/30 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40 bg-surface2/30">
                  <span className="text-[10px] font-mono text-faint w-7">[{cell.execution_count ?? " "}]</span>
                  <select value={cell.cell_type} onChange={(event) => updateCell(index, { cell_type: event.target.value as NotebookCell["cell_type"] })} className="bg-transparent text-xs text-muted focus:outline-none">
                    <option value="code">Code</option>
                    <option value="markdown">Markdown</option>
                    <option value="raw">Raw</option>
                  </select>
                </div>
                <textarea value={cell.source} onChange={(event) => updateCell(index, { source: event.target.value })} spellCheck={cell.cell_type === "markdown"} className="block w-full min-h-24 resize-y bg-transparent text-text text-xs font-mono leading-[1.6] p-3 focus:outline-none" />
                {outputs.length > 0 && (
                  <div className="border-t border-border/40 px-3 py-2 space-y-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted">Outputs · read-only</div>
                    {outputs.map((output, outputIndex) => {
                      const text = outputText(output);
                      return <pre key={outputIndex} className="whitespace-pre-wrap overflow-auto max-h-48 rounded bg-black/20 p-2 text-[11px] text-muted">{text || "[structured output]"}</pre>;
                    })}
                  </div>
                )}
              </section>
            );
          })}
          {notebook.cells.length === 0 && <div className="text-center text-xs text-faint py-10">This notebook has no cells.</div>}
        </div>
      )}
      <div className="flex items-center justify-between px-4 py-1 border-t border-border/60 bg-surface text-faint text-xs flex-shrink-0">
        <span>{notebook ? `${notebook.cells.length} cell${notebook.cells.length === 1 ? "" : "s"}` : ""}</span>
        <span>{dirty ? "Modified" : "Saved · execution is available through Terminal"}</span>
      </div>
    </div>
  );
}

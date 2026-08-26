import { useEffect, useState } from "react";
import { ipc } from "../../lib/ipc";
import { parseNotebook, serializeNotebook, type NotebookCell, type NotebookDocument } from "../../lib/notebook";

interface Props {
  path: string;
  onClose: () => void;
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

export function NotebookEditor({ path, onClose }: Props) {
  const [notebook, setNotebook] = useState<NotebookDocument | null>(null);
  const [original, setOriginal] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const filename = path.split(/[/\\]/).pop() ?? path;
  const dirty = notebook !== null && serializeNotebook(notebook) !== original;

  useEffect(() => {
    setNotebook(null);
    setOriginal("");
    setError("");
    ipc.readFile(path)
      .then((raw) => {
        const parsed = parseNotebook(raw);
        setNotebook(parsed);
        setOriginal(serializeNotebook(parsed));
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [path]);

  const updateCell = (index: number, patch: Partial<NotebookCell>) => {
    setNotebook((current) => current ? {
      ...current,
      cells: current.cells.map((cell, cellIndex) => cellIndex === index ? { ...cell, ...patch } : cell),
    } : current);
  };

  const save = async () => {
    if (!notebook) return;
    setSaving(true);
    try {
      const serialized = serializeNotebook(notebook);
      await ipc.writeFile(path, serialized);
      setOriginal(serialized);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault();
        void save();
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
          {dirty && <button onClick={() => void save()} disabled={saving} className="px-2.5 py-1 text-xs bg-accent text-canvas rounded-md hover:bg-accentdim disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>}
          <button onClick={onClose} className="text-faint hover:text-text transition-colors text-lg leading-none">×</button>
        </div>
      </div>

      {error ? (
        <div className="flex-1 flex items-center justify-center text-red text-xs px-4 text-center">{error}</div>
      ) : !notebook ? (
        <div className="flex-1 flex items-center justify-center text-faint text-xs">Loading notebook…</div>
      ) : (
        <div className="flex-1 overflow-auto p-4 space-y-3">
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

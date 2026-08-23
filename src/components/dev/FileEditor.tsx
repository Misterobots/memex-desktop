import { useEffect, useRef, useState } from "react";
import { ipc } from "../../lib/ipc";
import { desktop } from "../../lib/desktop";

interface Props {
  path: string;
  onClose: () => void;
}

function lspLanguage(path: string): string {
  const suffix = ext(path);
  return suffix === "py" ? "py" : suffix === "rs" ? "rs" : suffix === "go" ? "go" : "ts";
}

function fileUri(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.startsWith("/") ? `file://${normalized}` : `file:///${normalized}`;
}

function ext(path: string) {
  return path.split(".").pop()?.toLowerCase() ?? "";
}

export function FileEditor({ path, onClose }: Props) {
  const [content, setContent]   = useState<string | null>(null);
  const [original, setOriginal] = useState("");
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");
  const [diagnostics, setDiagnostics] = useState<Array<{ severity?: number; message: string; range?: { start?: { line?: number; character?: number } } }>>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const filename = path.split(/[/\\]/).pop() ?? path;
  const dirty    = content !== null && content !== original;

  useEffect(() => {
    ipc.readFile(path)
      .then((c) => { setContent(c); setOriginal(c); })
      .catch((e) => setError(String(e)));
  }, [path]);

  // Connect the native language server for this file when one is available.
  useEffect(() => {
    const bridge = desktop();
    if (!bridge || !content || !path.includes(".")) return;
    const uri = fileUri(path);
    const rootPath = path.replace(/[\\/][^\\/]*$/, "") || path;
    const rootUri = fileUri(rootPath);
    let alive = true;
    const onNotification = (event: { method: string; params: unknown }) => {
      if (event.method !== "textDocument/publishDiagnostics") return;
      const params = event.params as { uri?: string; diagnostics?: Array<{ severity?: number; message: string; range?: { start?: { line?: number; character?: number } } }> };
      if (params.uri === uri && alive) setDiagnostics(params.diagnostics ?? []);
    };
    const unsubscribe = bridge.lsp.onNotification(onNotification);
    void bridge.lsp.start(`.${ext(path)}`, rootUri).then((started) => {
      if (started && alive) {
        bridge.lsp.notify(lspLanguage(path), rootUri, "textDocument/didOpen", {
          textDocument: { uri, languageId: ext(path), version: 1, text: content },
        });
      }
    });
    return () => { alive = false; unsubscribe(); };
  }, [path, content === null]);
  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
  }, [content]);

  const save = async () => {
    if (content === null) return;
    setSaving(true);
    try {
      await ipc.writeFile(path, content);
      setOriginal(content);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      save();
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface text-sm">
      {/* Tab bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/60 bg-surface flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-text font-mono text-xs">{filename}</span>
          {dirty && <span className="w-1.5 h-1.5 rounded-full bg-accent" title="Unsaved changes" />}
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              onClick={save}
              disabled={saving}
              className="px-2.5 py-1 text-xs bg-accent text-canvas rounded-md hover:bg-accentdim disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          )}
          <button
            onClick={onClose}
            className="text-faint hover:text-text transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>
      </div>

      {/* Content */}
      {error ? (
        <div className="flex-1 flex items-center justify-center text-red text-xs px-4">{error}</div>
      ) : content === null ? (
        <div className="flex-1 flex items-center justify-center text-faint text-xs">Loading…</div>
      ) : (
        <div className="flex-1 overflow-auto">
          {/* Line numbers + editor */}
          <div className="flex">
            <div className="flex-shrink-0 select-none text-right text-faint text-xs font-mono px-3 pt-3 leading-[1.6] min-w-[3.5rem]">
              {content.split("\n").map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              className="flex-1 bg-transparent text-text text-xs font-mono leading-[1.6] pt-3 pr-4 resize-none focus:outline-none overflow-hidden"
            />
          </div>
        </div>
      )}

      {diagnostics.length > 0 && (
        <div className="border-t border-border/60 bg-surface2/40 px-4 py-2 space-y-1 max-h-28 overflow-y-auto">
          <div className="text-[10px] uppercase tracking-wide text-muted">Diagnostics</div>
          {diagnostics.map((diagnostic, index) => (
            <div key={`${diagnostic.message}-${index}`} className={`text-xs ${diagnostic.severity === 1 ? "text-red-400" : diagnostic.severity === 2 ? "text-yellow" : "text-muted"}`}>
              {diagnostic.range?.start?.line !== undefined ? `${diagnostic.range.start.line + 1}: ` : ""}{diagnostic.message}
            </div>
          ))}
        </div>
      )}
      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-1 border-t border-border/60 bg-surface text-faint text-xs flex-shrink-0">
        <span className="font-mono">{ext(path)}</span>
        <span>{dirty ? "Modified" : "Saved"}</span>
      </div>
    </div>
  );
}

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
  const [vimEnabled, setVimEnabled] = useState(false);
  const [vimMode, setVimMode] = useState<"insert" | "normal">("insert");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef<string | null>(null);
  const lspDocumentRef = useRef<{ bridge: NonNullable<ReturnType<typeof desktop>>; lang: string; rootUri: string; uri: string; version: number } | null>(null);

  const filename = path.split(/[/\\]/).pop() ?? path;
  const dirty    = content !== null && content !== original;

  useEffect(() => {
    setContent(null);
    setDiagnostics([]);
    contentRef.current = null;
    ipc.readFile(path)
      .then((c) => { contentRef.current = c; setContent(c); setOriginal(c); })
      .catch((e) => setError(String(e)));
  }, [path]);

  // Connect the native language server for this file when one is available.
  useEffect(() => {
    const bridge = desktop();
    if (!bridge || content === null || !path.includes(".")) return;
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
        const document = { bridge, lang: lspLanguage(path), rootUri, uri, version: 1 };
        lspDocumentRef.current = document;
        bridge.lsp.notify(lspLanguage(path), rootUri, "textDocument/didOpen", {
          textDocument: { uri, languageId: ext(path), version: document.version, text: contentRef.current ?? "" },
        });
      }
    });
    return () => {
      alive = false;
      if (lspDocumentRef.current?.uri === uri) {
        bridge.lsp.notify(lspLanguage(path), rootUri, "textDocument/didClose", { textDocument: { uri } });
        lspDocumentRef.current = null;
      }
      unsubscribe();
    };
  }, [path, content === null]);

  useEffect(() => {
    contentRef.current = content;
    const document = lspDocumentRef.current;
    if (!document || content === null) return;
    document.version += 1;
    document.bridge.lsp.notify(document.lang, document.rootUri, "textDocument/didChange", {
      textDocument: { uri: document.uri, version: document.version },
      contentChanges: [{ text: content }],
    });
  }, [content]);
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
      return;
    }
    if (!vimEnabled || content === null) return;

    const textarea = textareaRef.current;
    if (!textarea) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setVimMode("normal");
      return;
    }
    if (vimMode === "insert") return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const move = (position: number) => {
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(position, position);
      });
    };
    const replace = (next: string, position: number) => {
      setContent(next);
      contentRef.current = next;
      move(position);
    };
    const lineStart = content.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const lineEndIndex = content.indexOf("\n", start);
    const lineEnd = lineEndIndex === -1 ? content.length : lineEndIndex;

    e.preventDefault();
    switch (e.key) {
      case "i":
        setVimMode("insert");
        break;
      case "a":
        setVimMode("insert");
        move(Math.min(content.length, end + 1));
        break;
      case "0":
        move(lineStart);
        break;
      case "$":
        move(lineEnd);
        break;
      case "h":
      case "ArrowLeft":
        move(Math.max(0, start - 1));
        break;
      case "l":
      case "ArrowRight":
        move(Math.min(content.length, end + 1));
        break;
      case "j":
      case "ArrowDown": {
        const column = start - lineStart;
        const nextLineStart = lineEndIndex === -1 ? content.length : lineEndIndex + 1;
        const nextLineEndIndex = content.indexOf("\n", nextLineStart);
        const nextLineEnd = nextLineEndIndex === -1 ? content.length : nextLineEndIndex;
        move(Math.min(nextLineStart + column, nextLineEnd));
        break;
      }
      case "k":
      case "ArrowUp": {
        const previousLineEnd = Math.max(0, lineStart - 1);
        const previousLineStart = content.lastIndexOf("\n", Math.max(0, previousLineEnd - 1)) + 1;
        const column = start - lineStart;
        move(Math.min(previousLineStart + column, previousLineEnd));
        break;
      }
      case "x":
        if (start < content.length) replace(content.slice(0, start) + content.slice(start + 1), start);
        break;
      case "o":
        replace(content.slice(0, lineEnd) + "\n" + content.slice(lineEnd), lineEnd + 1);
        setVimMode("insert");
        break;
      case "O":
        replace(content.slice(0, lineStart) + "\n" + content.slice(lineStart), lineStart);
        setVimMode("insert");
        break;
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface text-sm">
      {/* Tab bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/60 bg-surface flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-text font-mono text-xs">{filename}</span>
          {dirty && <span className="w-1.5 h-1.5 rounded-full bg-accent" title="Unsaved changes" />}
          <button
            onClick={() => { setVimEnabled((enabled) => !enabled); setVimMode("insert"); }}
            className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${vimEnabled ? "text-accent border-accent/50" : "text-faint border-border/60"}`}
            title="Toggle basic Vim navigation and editing mode"
          >
            Vim
          </button>
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
        <span>{vimEnabled ? `Vim · ${vimMode}` : dirty ? "Modified" : "Saved"}</span>
      </div>
    </div>
  );
}

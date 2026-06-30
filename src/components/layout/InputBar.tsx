import { useRef, useState, useCallback, useEffect } from "react";
import { useStore } from "../../lib/store";
import { streamChat } from "../../lib/sse-stream";
import { pushSession } from "../../lib/conv-sync";
import { MODE_FLAGS, MODE_LABELS, type MemexMode, type ChatMessage, type MessageEvent } from "../../types/memex";
import { ModelPickerPopover } from "./ModelPickerPopover";
import { ContextMeter } from "./ContextMeter";

const MODES: MemexMode[] = ["chat", "swarm", "research", "design", "think", "plan"];

const MODE_DOT: Record<MemexMode, string> = {
  chat:     "bg-muted",
  swarm:    "bg-accent",
  research: "bg-green",
  design:   "bg-yellow",
  think:    "bg-accent2",
  plan:     "bg-yellow",
  workshop: "bg-accent",
};

interface InputBarProps {
  /** Extra request flags merged into every send (e.g. { dev_mode: true }). */
  extraFlags?: Record<string, boolean>;
  /** When set, the composer is locked to this mode and the mode pill is hidden. */
  lockMode?: MemexMode;
  /** Placeholder override. */
  placeholder?: string;
}

export function InputBar({ extraFlags = {}, lockMode, placeholder }: InputBarProps) {
  const [text, setText] = useState("");
  const [modeOpen, setModeOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modeRef = useRef<HTMLDivElement>(null);
  const {
    mode: globalMode, setMode, activeSessionId, createSession,
    addMessage, appendEvent, updateMessageContent, updateMessageRunId, setMessageUsage,
    setStreaming, streaming, stopStream, activeSession, selectedModel,
  } = useStore();

  const mode = lockMode ?? globalMode;

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 220) + "px";
  }, [text]);

  useEffect(() => {
    if (!modeOpen) return;
    const h = (e: MouseEvent) => { if (!modeRef.current?.contains(e.target as Node)) setModeOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [modeOpen]);

  const submit = useCallback(() => {
    const content = text.trim();
    if (!content || streaming) return;
    setText("");

    const sessionId = activeSessionId ?? createSession();
    const session = activeSession();

    addMessage(sessionId, {
      id: `msg-${Date.now()}-u`, role: "user", content,
      events: [], timestamp: Date.now(), mode,
    } as ChatMessage);

    const assistantId = `msg-${Date.now()}-a`;
    addMessage(sessionId, {
      id: assistantId, role: "assistant", content: "",
      events: [], timestamp: Date.now(), mode,
    } as ChatMessage);

    const history = (session?.messages ?? []).map((m) => ({ role: m.role, content: m.content }));
    history.push({ role: "user", content });

    let accumulated = "";
    const stop = streamChat({
      messages: history,
      mode,
      model: selectedModel,
      modeFlags: { ...MODE_FLAGS[mode], ...extraFlags },
      sessionId,
      runMeta: { profile: "default" },
      onRunStarted: (runId) => updateMessageRunId(sessionId, assistantId, runId),
      onUsage: (usage) => setMessageUsage(sessionId, assistantId, usage),
      onEvent: (event) => {
        appendEvent(sessionId, assistantId, event as MessageEvent);
        if (event.type === "message" || event.type === "response") {
          accumulated += event.content;
          updateMessageContent(sessionId, assistantId, accumulated);
        }
      },
      onDone: () => {
        setStreaming(false);
        // Sync the completed conversation to the backend for resume / cross-device.
        const sess = useStore.getState().sessions.find((x) => x.id === sessionId);
        if (sess) pushSession(sess);
      },
      onError: (err) => {
        appendEvent(sessionId, assistantId, { type: "log", content: `Error: ${err.message}` });
        setStreaming(false);
      },
    });
    setStreaming(true, stop);
  }, [text, streaming, mode, activeSessionId, extraFlags]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Enter sends; Shift+Enter inserts a newline. Skip while an IME composition
    // is active so Enter can confirm candidates instead of sending.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
    if (e.key === "Escape" && streaming && stopStream) {
      stopStream();
      setStreaming(false);
    }
  };

  return (
    <div className="px-6 pb-5 pt-2 flex-shrink-0">
      <div className="max-w-conversation mx-auto">
        <div className="bg-surface border border-border rounded-2xl px-3 pt-3 pb-2 focus-within:border-accent/50 transition-colors shadow-lg shadow-black/10">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ?? (streaming ? "Streaming… (Esc to stop)" : "Message Memex…")}
            rows={1}
            className="w-full bg-transparent px-2 text-text text-[15px] resize-none focus:outline-none placeholder-faint min-h-[24px] leading-relaxed"
          />
          <div className="flex items-center justify-between mt-1.5">
            {/* Mode selector + model picker */}
            <div className="flex items-center gap-1">
              {lockMode ? (
                <span className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted">
                  <span className={`w-1.5 h-1.5 rounded-full ${MODE_DOT[mode]}`} />
                  {MODE_LABELS[mode]}
                </span>
              ) : (
                <div ref={modeRef} className="relative">
                  <button
                    onClick={() => setModeOpen((o) => !o)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors
                      ${modeOpen ? "bg-surface2 text-text" : "text-muted hover:text-text hover:bg-surface2"}`}
                    title="Select mode"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${MODE_DOT[mode]}`} />
                    {MODE_LABELS[mode]}
                    <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M2 3.5l3 3 3-3" />
                    </svg>
                  </button>
                  {modeOpen && (
                    <div className="absolute bottom-full mb-2 left-0 w-44 bg-canvas border border-border/60 rounded-xl shadow-2xl z-50 overflow-hidden py-1">
                      {MODES.map((m) => (
                        <button
                          key={m}
                          onClick={() => { setMode(m); setModeOpen(false); }}
                          className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs transition-colors
                            ${m === globalMode ? "bg-accent/10 text-text" : "text-text/80 hover:bg-surface2/60"}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${MODE_DOT[m]}`} />
                          <span className="flex-1">{MODE_LABELS[m]}</span>
                          {m === globalMode && (
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-accent">
                              <path d="M1.5 5l3 3 4-5" />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <ModelPickerPopover />
              <ContextMeter />
            </div>

            <button
              onClick={streaming ? () => { stopStream?.(); setStreaming(false); } : submit}
              disabled={!streaming && !text.trim()}
              className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
                streaming
                  ? "bg-red/90 text-white hover:bg-red"
                  : "bg-accent text-canvas hover:bg-accentdim disabled:bg-surface2 disabled:text-faint disabled:cursor-not-allowed"
              }`}
              title={streaming ? "Stop" : "Send"}
            >
              {streaming ? (
                <span className="w-2.5 h-2.5 bg-current rounded-sm" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M8 13V3M8 3L4 7M8 3l4 4" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
